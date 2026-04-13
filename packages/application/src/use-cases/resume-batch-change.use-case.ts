// File: packages/application/src/use-cases/resume-batch-change.use-case.ts
import { DomainValidationError, type BatchJobId, type BatchJobResult, type LoginSession } from '@smart-store/core';

import type { BatchJobStorePort, ExecutionCheckpointStorePort } from '../ports/batch-job-store.port.js';
import type { SessionGatewayPort } from '../ports/session-gateway.port.js';
import type { SettingsStorePort } from '../ports/settings-store.port.js';
import { BatchExecutionService } from '../services/batch-execution.service.js';

export class ResumeBatchChangeUseCase {
  constructor(
    private readonly settingsStore: SettingsStorePort,
    private readonly sessionGateway: SessionGatewayPort,
    private readonly batchJobStore: BatchJobStorePort,
    private readonly checkpointStore: ExecutionCheckpointStorePort,
    private readonly batchExecutionService: BatchExecutionService,
  ) {}

  async execute(input: {
    jobId: BatchJobId;
    session?: LoginSession;
  }): Promise<BatchJobResult> {
    const job = await this.batchJobStore.loadJob(input.jobId);

    if (!job) {
      throw new DomainValidationError(
        `Batch job was not found: ${input.jobId.toString()}`,
      );
    }

    const [checkpoint, previousResults, settings] = await Promise.all([
      this.checkpointStore.loadCheckpoint(input.jobId),
      this.batchJobStore.loadItemResults(input.jobId),
      this.settingsStore.loadSettings(),
    ]);
    const session =
      input.session ??
      (await this.sessionGateway.validateSession({
        settings,
      }));

    return this.batchExecutionService.resumePlan({
      job,
      checkpoint,
      previousResults,
      settings,
      session,
    });
  }
}
