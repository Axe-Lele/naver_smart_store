import type pino from 'pino';
import type { Page } from 'playwright';

import type { AppConfig } from '../config/schema.js';
import {
  ClassifiedAutomationError,
  FatalAutomationError,
  SessionRecoveryRequiredError,
} from '../domain/errors.js';
import {
  createEmptyStatusCounts,
  isOperationalFailure,
  toResultBucket,
  type ProductProcessResult,
  type ProductStatus,
  type ProductTask,
  type RunSummary,
} from '../domain/types.js';
import { ProductEditPage } from '../pages/product-edit-page.js';
import { ProductListPage } from '../pages/product-list-page.js';
import { elapsedMs, nowIso, sleep } from '../utils/time.js';
import { assertSessionHealthy } from './auth-session.js';
import { createBrowserSession } from './browser-session.js';
import { CheckpointStore } from './checkpoint-store.js';
import { readInputCsv } from './input-reader.js';
import { OutputManager } from './output-manager.js';
import { WorkQueue } from './work-queue.js';

interface RuntimeState {
  consecutiveOperationalFailures: number;
  stoppedEarly: boolean;
  stopReason?: string;
  fatalError?: FatalAutomationError;
}

interface AggregateState {
  processed: number;
  successCount: number;
  lockedCount: number;
  failedCount: number;
  convertedCount: number;
  dryRunEligibleCount: number;
  counts: ReturnType<typeof createEmptyStatusCounts>;
}

export async function runSmartStoreAutomation(
  config: AppConfig,
  logger: pino.Logger,
): Promise<RunSummary> {
  const startedAt = nowIso();
  const startedAtMs = Date.now();
  const input = await readInputCsv(config.inputFile, logger);
  const checkpoint = await CheckpointStore.create({
    filePath: config.checkpointFile,
    inputFile: config.inputFile,
    runId: config.runId,
    resume: config.resume,
  });
  const output = await OutputManager.create(config);

  const resumeSkipped = input.tasks.filter((task) => checkpoint.has(task.productNo)).length;
  const unprocessedTasks = input.tasks.filter(
    (task) => !checkpoint.has(task.productNo),
  );
  const queueItems =
    config.maxItems !== undefined
      ? unprocessedTasks.slice(0, config.maxItems)
      : unprocessedTasks;

  const queue = new WorkQueue(queueItems);
  const runtimeState: RuntimeState = {
    consecutiveOperationalFailures: 0,
    stoppedEarly: false,
  };
  const aggregate: AggregateState = {
    processed: 0,
    successCount: 0,
    lockedCount: 0,
    failedCount: 0,
    convertedCount: 0,
    dryRunEligibleCount: 0,
    counts: createEmptyStatusCounts(),
  };

  if (queueItems.length === 0) {
    const summary = buildSummary(
      config,
      startedAt,
      startedAtMs,
      input.invalidRowCount,
      input.duplicateCount,
      resumeSkipped,
      runtimeState,
      aggregate,
    );

    await output.writeSummary(summary);
    await output.close();
    return summary;
  }

  let session: Awaited<ReturnType<typeof createBrowserSession>> | undefined;

  try {
    session = await createBrowserSession(config, logger);
    const activeSession = session;

    const workers = Array.from(
      { length: Math.min(config.concurrency, Math.max(queueItems.length, 1)) },
      (_, index) =>
        runWorker(
          index + 1,
          activeSession,
          queue,
          checkpoint,
          output,
          runtimeState,
          aggregate,
          config,
          logger,
        ),
    );

    await Promise.all(workers);
  } catch (error) {
    runtimeState.stoppedEarly = true;
    runtimeState.stopReason =
      error instanceof Error ? error.message : 'Unknown error while running automation.';
    throw error;
  } finally {
    await output.writeSummary(
      buildSummary(
        config,
        startedAt,
        startedAtMs,
        input.invalidRowCount,
        input.duplicateCount,
        resumeSkipped,
        runtimeState,
        aggregate,
      ),
    );
    await output.close();
    await session?.close().catch(() => undefined);
  }

  if (runtimeState.fatalError) {
    throw runtimeState.fatalError;
  }

  return buildSummary(
    config,
    startedAt,
    startedAtMs,
    input.invalidRowCount,
    input.duplicateCount,
    resumeSkipped,
    runtimeState,
    aggregate,
  );
}

async function runWorker(
  workerId: number,
  session: Awaited<ReturnType<typeof createBrowserSession>>,
  queue: WorkQueue,
  checkpoint: CheckpointStore,
  output: OutputManager,
  runtimeState: RuntimeState,
  aggregate: AggregateState,
  config: AppConfig,
  logger: pino.Logger,
): Promise<void> {
  const page =
    workerId === 1
      ? session.initialPage
      : await session.context.newPage();

  while (!runtimeState.stoppedEarly) {
    const task = queue.next();

    if (!task) {
      break;
    }

    const taskStartedAt = nowIso();
    const taskStartedAtMs = Date.now();

    try {
      const result = await processTask(
        task,
        workerId,
        page,
        config,
        logger,
        output,
        taskStartedAt,
        taskStartedAtMs,
      );
      await output.appendResult(result);
      await checkpoint.markProcessed(result);
      updateAggregate(aggregate, result);
      updateRuntimeState(runtimeState, result, config, queue);
    } catch (error) {
      if (error instanceof SessionRecoveryRequiredError) {
        const result = await withArtifacts(
          output,
          page,
          task.productNo,
          buildResult(task, workerId, config, taskStartedAt, taskStartedAtMs, {
            status: 'UNKNOWN_ERROR',
            actionResult: 'FAILED',
            verificationMethod: 'NOT_ATTEMPTED',
            reason: 'Login session expired or access is no longer valid.',
            errorMessage: error.message,
          }),
        );

        await output.appendResult(result);
        await checkpoint.markProcessed(result);
        updateAggregate(aggregate, result);

        runtimeState.stoppedEarly = true;
        runtimeState.stopReason = error.message;
        runtimeState.fatalError = error;
        queue.stop();
        logger.error(
          {
            workerId,
            productNo: task.productNo,
            error,
            artifactPaths: result.artifactPaths,
          },
          'Session recovery is required. Stopping run after saving diagnostics.',
        );
        break;
      }

      if (error instanceof FatalAutomationError) {
        runtimeState.stoppedEarly = true;
        runtimeState.stopReason = error.message;
        runtimeState.fatalError = error;
        queue.stop();
        logger.error({ workerId, error }, 'Fatal automation error. Stopping run.');
        break;
      }

      throw error;
    }

    if (!runtimeState.stoppedEarly && config.delayMs > 0) {
      await sleep(config.delayMs);
    }
  }

  if (workerId !== 1) {
    await page.close().catch(() => undefined);
  }
}

async function processTask(
  task: ProductTask,
  workerId: number,
  page: Page,
  config: AppConfig,
  logger: pino.Logger,
  output: OutputManager,
  startedAt: string,
  startedAtMs: number,
): Promise<ProductProcessResult> {
  const listPage = new ProductListPage(page, config, logger);
  const editPage = new ProductEditPage(page, config, logger);

  logger.info({ workerId, productNo: task.productNo }, 'Processing product.');

  try {
    await listPage.goto();
    await assertSessionHealthy(page, {
      storageStatePath: config.storageStatePath,
      expectedPageName: 'Smart Store product list page',
      expectedSelectors: listPage.getReadySelectors(),
      timeoutMs: 8_000,
    });
    const searchOutcome = await listPage.search(task.productNo);

    if (searchOutcome.state === 'NOT_FOUND') {
      return buildResult(task, workerId, config, startedAt, startedAtMs, {
        status: 'NOT_FOUND',
        actionResult: 'SKIPPED',
        verificationMethod: 'NOT_ATTEMPTED',
        reason: searchOutcome.reason,
      });
    }

    if (searchOutcome.state === 'UI_CHANGED') {
      return await withArtifacts(
        output,
        page,
        task.productNo,
        buildResult(task, workerId, config, startedAt, startedAtMs, {
          status: 'UI_CHANGED',
          actionResult: 'FAILED',
          verificationMethod: 'NOT_ATTEMPTED',
          reason: searchOutcome.reason,
        }),
      );
    }

    const opened = await listPage.openEdit(task.productNo);
    if (!opened) {
      return await withArtifacts(
        output,
        page,
        task.productNo,
        buildResult(task, workerId, config, startedAt, startedAtMs, {
          status: 'UI_CHANGED',
          actionResult: 'FAILED',
          verificationMethod: 'NOT_ATTEMPTED',
          reason: 'The edit action could not be opened from the search result row.',
        }),
      );
    }

    await assertSessionHealthy(page, {
      storageStatePath: config.storageStatePath,
      expectedPageName: 'Smart Store product edit page',
      expectedSelectors: editPage.getReadySelectors(),
      timeoutMs: 8_000,
    });

    const classification = await editPage.classify();

    if (classification.status === 'EDITABLE_PREORDER') {
      if (config.dryRun) {
        return buildResult(task, workerId, config, startedAt, startedAtMs, {
          status: 'EDITABLE_PREORDER',
          actionResult: 'DRY_RUN',
          verificationMethod: 'DRY_RUN',
          reason: classification.reason,
        });
      }

      await editPage.convertToNormalProduct();
      const saveUiSignal = await editPage.readSaveUiSignal();
      const verification = await verifyConversionByRequery(
        task.productNo,
        page,
        config,
        logger,
        listPage,
        editPage,
        saveUiSignal,
      );

      if (verification.success) {
        return buildResult(task, workerId, config, startedAt, startedAtMs, {
          status: 'EDITABLE_PREORDER',
          actionResult: 'CONVERTED',
          verificationMethod: verification.verificationMethod,
          reason: verification.reason,
        });
      }

      return await withArtifacts(
        output,
        page,
        task.productNo,
        buildResult(task, workerId, config, startedAt, startedAtMs, {
          status: 'UNKNOWN_ERROR',
          actionResult: 'FAILED',
          verificationMethod: verification.verificationMethod,
          reason: verification.reason,
        }),
      );
    }

    if (
      classification.status === 'LOCKED_BY_ORDER_PERIOD' ||
      classification.status === 'NOT_PREORDER' ||
      classification.status === 'NOT_FOUND'
    ) {
      return buildResult(task, workerId, config, startedAt, startedAtMs, {
        status: classification.status,
        actionResult: 'SKIPPED',
        verificationMethod: 'NOT_ATTEMPTED',
        reason: classification.reason,
      });
    }

    return await withArtifacts(
      output,
      page,
      task.productNo,
      buildResult(task, workerId, config, startedAt, startedAtMs, {
        status: classification.status,
        actionResult: 'FAILED',
        verificationMethod: 'NOT_ATTEMPTED',
        reason: classification.reason,
      }),
    );
  } catch (error) {
    if (error instanceof FatalAutomationError) {
      throw error;
    }

    if (error instanceof ClassifiedAutomationError) {
      const base = buildResult(task, workerId, config, startedAt, startedAtMs, {
        status: error.status,
        actionResult:
          error.status === 'LOCKED_BY_ORDER_PERIOD' ? 'SKIPPED' : 'FAILED',
        verificationMethod: 'NOT_ATTEMPTED',
        reason: error.message,
      });

      return error.status === 'LOCKED_BY_ORDER_PERIOD'
        ? base
        : withArtifacts(output, page, task.productNo, base);
    }

    const message =
      error instanceof Error ? error.message : 'Unexpected non-error thrown.';

    return withArtifacts(
      output,
      page,
      task.productNo,
      buildResult(task, workerId, config, startedAt, startedAtMs, {
        status: 'UNKNOWN_ERROR',
        actionResult: 'FAILED',
        verificationMethod: 'NOT_ATTEMPTED',
        reason: 'Unhandled exception during product processing.',
        errorMessage: message,
      }),
    );
  }
}

async function withArtifacts(
  output: OutputManager,
  page: Page,
  productNo: string,
  result: ProductProcessResult,
): Promise<ProductProcessResult> {
  const artifactPaths = await output.captureFailureArtifacts(page, productNo, result.status);

  return {
    ...result,
    artifactPaths,
  };
}

async function verifyConversionByRequery(
  productNo: string,
  page: Page,
  config: AppConfig,
  logger: pino.Logger,
  listPage: ProductListPage,
  editPage: ProductEditPage,
  saveUiSignal: 'TOAST' | 'BANNER' | null,
): Promise<{
  success: boolean;
  verificationMethod: ProductProcessResult['verificationMethod'];
  reason: string;
}> {
  await listPage.goto();
  await assertSessionHealthy(page, {
    storageStatePath: config.storageStatePath,
    expectedPageName: 'Smart Store product list page',
    expectedSelectors: listPage.getReadySelectors(),
    timeoutMs: 8_000,
  });

  const searchOutcome = await listPage.search(productNo);
  if (searchOutcome.state !== 'FOUND') {
    return {
      success: false,
      verificationMethod: saveUiSignal ?? 'NOT_ATTEMPTED',
      reason: `Requery failed after save: ${searchOutcome.reason}`,
    };
  }

  const opened = await listPage.openEdit(productNo);
  if (!opened) {
    return {
      success: false,
      verificationMethod: saveUiSignal ?? 'NOT_ATTEMPTED',
      reason: 'Product row was found during requery but the edit action could not be opened.',
    };
  }

  await assertSessionHealthy(page, {
    storageStatePath: config.storageStatePath,
    expectedPageName: 'Smart Store product edit page',
    expectedSelectors: editPage.getReadySelectors(),
    timeoutMs: 8_000,
  });

  const reclassified = await editPage.classify();
  if (reclassified.status === 'NOT_PREORDER') {
    return {
      success: true,
      verificationMethod: combineVerification(saveUiSignal),
      reason: 'Requery confirmed that the product is now a normal product.',
    };
  }

  return {
    success: false,
    verificationMethod: saveUiSignal ?? 'REQUERY',
    reason: `Requery status after save is ${reclassified.status}: ${reclassified.reason}`,
  };
}

function combineVerification(
  uiSignal: 'TOAST' | 'BANNER' | null,
): ProductProcessResult['verificationMethod'] {
  if (uiSignal === 'TOAST') {
    return 'TOAST_AND_REQUERY';
  }

  if (uiSignal === 'BANNER') {
    return 'BANNER_AND_REQUERY';
  }

  return 'REQUERY';
}

function buildResult(
  task: ProductTask,
  workerId: number,
  config: AppConfig,
  startedAt: string,
  startedAtMs: number,
  partial: {
    status: ProductStatus;
    actionResult: ProductProcessResult['actionResult'];
    verificationMethod: ProductProcessResult['verificationMethod'];
    reason: string;
    errorMessage?: string;
  },
): ProductProcessResult {
  return {
    productNo: task.productNo,
    rowNumber: task.rowNumber,
    status: partial.status,
    actionResult: partial.actionResult,
    verificationMethod: partial.verificationMethod,
    outputBucket: toResultBucket(partial.status, partial.actionResult),
    reason: partial.reason,
    startedAt,
    finishedAt: nowIso(),
    durationMs: elapsedMs(startedAtMs),
    workerId,
    dryRun: config.dryRun,
    errorMessage: partial.errorMessage,
  };
}

function updateAggregate(
  aggregate: AggregateState,
  result: ProductProcessResult,
): void {
  aggregate.processed += 1;
  aggregate.counts[result.status] += 1;

  if (result.outputBucket === 'success') {
    aggregate.successCount += 1;
  } else if (result.outputBucket === 'locked') {
    aggregate.lockedCount += 1;
  } else {
    aggregate.failedCount += 1;
  }

  if (result.actionResult === 'CONVERTED') {
    aggregate.convertedCount += 1;
  }

  if (result.actionResult === 'DRY_RUN') {
    aggregate.dryRunEligibleCount += 1;
  }
}

function updateRuntimeState(
  runtimeState: RuntimeState,
  result: ProductProcessResult,
  config: AppConfig,
  queue: WorkQueue,
): void {
  if (isOperationalFailure(result.status)) {
    runtimeState.consecutiveOperationalFailures += 1;
  } else {
    runtimeState.consecutiveOperationalFailures = 0;
  }

  if (
    runtimeState.consecutiveOperationalFailures >=
    config.consecutiveFailureLimit
  ) {
    runtimeState.stoppedEarly = true;
    runtimeState.stopReason = `Stopped after ${config.consecutiveFailureLimit} consecutive operational failures.`;
    queue.stop();
  }
}

function buildSummary(
  config: AppConfig,
  startedAt: string,
  startedAtMs: number,
  invalidRowCount: number,
  duplicateCount: number,
  skippedByResume: number,
  runtimeState: RuntimeState,
  aggregate: AggregateState,
): RunSummary {
  return {
    runId: config.runId,
    mode: config.mode,
    inputFile: config.inputFile,
    outputDir: config.outputDir,
    startedAt,
    finishedAt: nowIso(),
    durationMs: elapsedMs(startedAtMs),
    dryRun: config.dryRun,
    requestedMaxItems: config.maxItems,
    actualProcessedItems: aggregate.processed,
    skippedByResume,
    invalidRowCount,
    duplicateCount,
    stoppedEarly: runtimeState.stoppedEarly,
    stopReason: runtimeState.stopReason,
    concurrency: config.concurrency,
    delayMs: config.delayMs,
    counts: aggregate.counts,
    convertedCount: aggregate.convertedCount,
    dryRunEligibleCount: aggregate.dryRunEligibleCount,
    lockedCount: aggregate.lockedCount,
    failedCount: aggregate.failedCount,
    successCount: aggregate.successCount,
  };
}
