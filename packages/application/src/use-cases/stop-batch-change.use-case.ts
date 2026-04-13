// File: packages/application/src/use-cases/stop-batch-change.use-case.ts
import type { BatchJobId } from '@smart-store/core';

import type { BatchExecutionControlPort } from '../ports/batch-job-store.port.js';
import type { RunEventPublisherPort } from '../ports/run-event.port.js';

export class StopBatchChangeUseCase {
  constructor(
    private readonly executionControl: BatchExecutionControlPort,
    private readonly eventPublisher: RunEventPublisherPort,
  ) {}

  async execute(input: { jobId: BatchJobId; reason?: string }): Promise<void> {
    await this.executionControl.requestStop(
      input.jobId,
      input.reason ?? 'Stop requested by operator.',
    );

    await this.eventPublisher.publish({
      type: 'log',
      createdAt: new Date().toISOString(),
      level: 'warn',
      message: input.reason ?? 'Stop requested by operator.',
      jobId: input.jobId.toString(),
    });
  }
}
