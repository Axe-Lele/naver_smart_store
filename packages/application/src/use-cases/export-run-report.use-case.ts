// File: packages/application/src/use-cases/export-run-report.use-case.ts
import { DomainValidationError, type BatchJobId } from '@smart-store/core';

import type { BatchJobStorePort, RunReportExporterPort } from '../ports/batch-job-store.port.js';

export class ExportRunReportUseCase {
  constructor(
    private readonly batchJobStore: BatchJobStorePort,
    private readonly reportExporter: RunReportExporterPort,
  ) {}

  async execute(input: { jobId: BatchJobId; targetPath?: string }): Promise<{
    targetPath: string;
    exportedFiles: readonly string[];
  }> {
    const [job, result] = await Promise.all([
      this.batchJobStore.loadJob(input.jobId),
      this.batchJobStore.loadBatchResult(input.jobId),
    ]);

    if (!job || !result) {
      throw new DomainValidationError(
        `Batch job report was not found: ${input.jobId.toString()}`,
      );
    }

    return this.reportExporter.exportRunReport({
      job,
      result,
      targetPath: input.targetPath,
    });
  }
}
