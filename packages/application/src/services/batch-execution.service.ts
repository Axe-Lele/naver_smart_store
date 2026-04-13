// File: packages/application/src/services/batch-execution.service.ts
import {
  BatchJob,
  BatchJobItemResult,
  BatchJobResult,
  ChangePlan,
  ExecutionCheckpoint,
  LoginSession,
  evaluateBatchContinuation,
  filterPendingItems,
  nextConsecutiveFailureCount,
} from '@smart-store/core';

import type { BatchJobStorePort, BatchExecutionControlPort, ExecutionCheckpointStorePort } from '../ports/batch-job-store.port.js';
import type { RunEventPublisherPort } from '../ports/run-event.port.js';
import type { SmartStoreAutomationPort } from '../ports/smartstore-automation.port.js';
import type { AppSettings } from '../settings/app-settings.js';
import { BatchExecutionAbortError } from './batch-execution-abort.error.js';

export interface ExecuteNewBatchPlanInput {
  plan: ChangePlan;
  settings: AppSettings;
  session: LoginSession;
}

export interface ResumeBatchPlanInput {
  job: BatchJob;
  checkpoint?: ExecutionCheckpoint | null;
  previousResults?: readonly BatchJobItemResult[];
  settings: AppSettings;
  session: LoginSession;
}

export class BatchExecutionService {
  constructor(
    private readonly automationPort: SmartStoreAutomationPort,
    private readonly batchJobStore: BatchJobStorePort,
    private readonly checkpointStore: ExecutionCheckpointStorePort,
    private readonly executionControl: BatchExecutionControlPort,
    private readonly eventPublisher: RunEventPublisherPort,
  ) {}

  async executeNewPlan(input: ExecuteNewBatchPlanInput): Promise<BatchJobResult> {
    const startedAt = new Date().toISOString();
    const job = BatchJob.createNew(input.plan, startedAt).markRunning(startedAt);
    const checkpoint = ExecutionCheckpoint.createNew(job.id, startedAt);

    await this.batchJobStore.saveJob(job);
    await this.checkpointStore.saveCheckpoint(checkpoint);
    await this.executionControl.clearStopRequest(job.id);
    await this.publishJobState(job);

    return this.run({
      job,
      checkpoint,
      previousResults: [],
      settings: input.settings,
      session: input.session,
    });
  }

  async resumePlan(input: ResumeBatchPlanInput): Promise<BatchJobResult> {
    const resumedAt = new Date().toISOString();
    const job =
      input.job.execution.status === 'RUNNING'
        ? input.job
        : input.job.markRunning(resumedAt);
    const checkpoint =
      input.checkpoint ?? ExecutionCheckpoint.createNew(job.id, resumedAt);

    await this.batchJobStore.saveJob(job);
    await this.checkpointStore.saveCheckpoint(checkpoint);
    await this.publishJobState(job);

    return this.run({
      job,
      checkpoint,
      previousResults: input.previousResults ?? [],
      settings: input.settings,
      session: input.session,
    });
  }

  private async run(input: {
    job: BatchJob;
    checkpoint: ExecutionCheckpoint;
    previousResults: readonly BatchJobItemResult[];
    settings: AppSettings;
    session: LoginSession;
  }): Promise<BatchJobResult> {
    let workingJob = input.job;
    let workingCheckpoint = input.checkpoint;
    const allResults = [...input.previousResults];
    const processedIds = new Set(Object.keys(workingCheckpoint.toSnapshot().processed));
    const pendingItems = filterPendingItems(workingJob.plan.items, processedIds);
    const runtime = {
      stopRequested: false,
      stopReason: undefined as string | undefined,
      consecutiveFailureCount: calculateTrailingConsecutiveFailures(allResults),
    };

    if (pendingItems.length === 0) {
      const completedJob = workingJob.markCompleted();
      const finalResult = BatchJobResult.fromJob(completedJob, allResults, {
        finishedAt: new Date().toISOString(),
        checkpoint: workingCheckpoint.toSnapshot(),
      });

      await this.batchJobStore.saveJob(completedJob);
      await this.batchJobStore.saveBatchResult(finalResult);
      await this.checkpointStore.clearCheckpoint(completedJob.id);
      await this.publishJobState(completedJob);

      return finalResult;
    }

    let queueIndex = 0;
    let persistenceChain = Promise.resolve();

    const nextItem = () => {
      if (runtime.stopRequested) {
        return undefined;
      }

      const item = pendingItems[queueIndex];
      queueIndex += 1;
      return item;
    };

    const commitResult = async (result: BatchJobItemResult): Promise<void> => {
      persistenceChain = persistenceChain.then(async () => {
        allResults.push(result);
        workingCheckpoint = workingCheckpoint.markProcessed(result);
        workingJob = workingJob.applyResult(result, result.toSnapshot().finishedAt);

        await this.batchJobStore.appendItemResult(workingJob.id, result);
        await this.checkpointStore.saveCheckpoint(workingCheckpoint);
        await this.batchJobStore.saveJob(workingJob);

        runtime.consecutiveFailureCount = nextConsecutiveFailureCount(
          runtime.consecutiveFailureCount,
          result,
        );

        const decision = evaluateBatchContinuation({
          runPolicy: workingJob.plan.runPolicy,
          stopRequested: runtime.stopRequested,
          consecutiveFailureCount: runtime.consecutiveFailureCount,
        });

        if (!decision.shouldContinue && !runtime.stopRequested) {
          runtime.stopRequested = true;
          runtime.stopReason =
            decision.reason === 'CONSECUTIVE_FAILURE_LIMIT_REACHED'
              ? `Stopped after ${workingJob.plan.runPolicy.consecutiveFailureLimit} consecutive retryable failures.`
              : 'Stop requested by operator.';
        }

        await this.publishProgress(workingJob);
      });

      await persistenceChain;
    };

    const worker = async (): Promise<void> => {
      while (!runtime.stopRequested) {
        if (await this.executionControl.isStopRequested(workingJob.id)) {
          runtime.stopRequested = true;
          runtime.stopReason = 'Stop requested by operator.';
          break;
        }

        const item = nextItem();
        if (!item) {
          break;
        }

        await this.publishLog('info', 'Processing batch item.', workingJob.id.toString(), {
          productId: item.productId.toString(),
          action: item.requestedAction,
        });

        let result: BatchJobItemResult;
        const startedAt = new Date().toISOString();
        const startedAtMs = Date.now();

        try {
          result = await this.automationPort.executeChange({
            settings: input.settings,
            session: input.session,
            plan: workingJob.plan,
            item,
            checkpoint: workingCheckpoint,
            attemptNumber: 1,
          });
        } catch (error) {
          if (error instanceof BatchExecutionAbortError) {
            result = error.itemResult;
            runtime.stopRequested = true;
            runtime.stopReason = error.stopReason;
          } else {
            result = BatchJobItemResult.create({
              productId: item.productId.toString(),
              status: 'UNKNOWN_ERROR',
              actionResult: 'FAILED',
              verificationMethod: 'NOT_ATTEMPTED',
              reason: 'Unhandled exception during batch item execution.',
              failureCategory: 'OPERATIONAL',
              errorMessage: error instanceof Error ? error.message : String(error),
              startedAt,
              finishedAt: new Date().toISOString(),
              durationMs: Date.now() - startedAtMs,
              attemptNumber: 1,
            });
          }
        }

        await commitResult(result);
      }
    };

    const workerCount = Math.min(
      workingJob.plan.runPolicy.concurrency,
      pendingItems.length,
    );

    await Promise.all(
      Array.from({ length: workerCount }, async () => worker()),
    );
    await persistenceChain;

    const finishedAt = new Date().toISOString();
    const finalJob = runtime.stopRequested
      ? runtime.stopReason?.includes('consecutive')
        ? workingJob.markFailed(finishedAt, runtime.stopReason)
        : workingJob.markStopped(finishedAt, runtime.stopReason)
      : workingJob.markCompleted(finishedAt);

    const finalCheckpoint = runtime.stopRequested
      ? workingCheckpoint.requestStop(runtime.stopReason)
      : workingCheckpoint;
    const finalResult = BatchJobResult.fromJob(finalJob, allResults, {
      finishedAt,
      stopReason: runtime.stopReason,
      checkpoint: finalCheckpoint.toSnapshot(),
    });

    await this.batchJobStore.saveJob(finalJob);
    await this.batchJobStore.saveBatchResult(finalResult);

    if (runtime.stopRequested) {
      await this.checkpointStore.saveCheckpoint(finalCheckpoint);
    } else {
      await this.checkpointStore.clearCheckpoint(finalJob.id);
    }

    await this.publishJobState(finalJob, runtime.stopReason);

    return finalResult;
  }

  private async publishLog(
    level: 'debug' | 'info' | 'warn' | 'error',
    message: string,
    jobId?: string,
    context?: Readonly<Record<string, string | number | boolean | null>>,
  ): Promise<void> {
    await this.eventPublisher.publish({
      type: 'log',
      createdAt: new Date().toISOString(),
      level,
      message,
      jobId,
      context,
    });
  }

  private async publishProgress(job: BatchJob): Promise<void> {
    const execution = job.execution.toSnapshot();

    await this.eventPublisher.publish({
      type: 'job-progress',
      createdAt: new Date().toISOString(),
      jobId: job.id.toString(),
      processedItems: execution.processedCount,
      totalItems: job.plan.itemCount,
      successCount: execution.successCount,
      lockedCount: execution.lockedCount,
      failedCount: execution.failedCount,
    });
  }

  private async publishJobState(job: BatchJob, stopReason?: string): Promise<void> {
    await this.eventPublisher.publish({
      type: 'job-state',
      createdAt: new Date().toISOString(),
      jobId: job.id.toString(),
      status: job.execution.status,
      stopReason,
    });
  }
}

function calculateTrailingConsecutiveFailures(
  results: readonly BatchJobItemResult[],
): number {
  let count = 0;

  for (let index = results.length - 1; index >= 0; index -= 1) {
    const nextCount = nextConsecutiveFailureCount(count, results[index]);
    if (nextCount === 0) {
      return count;
    }

    count = nextCount;
  }

  return count;
}
