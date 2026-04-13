// File: packages/application/src/ports/batch-job-store.port.ts
import type {
  BatchJob,
  BatchJobId,
  BatchJobItemResult,
  BatchJobResult,
  ExecutionCheckpoint,
} from '@smart-store/core';

export interface BatchJobStorePort {
  saveJob(job: BatchJob): Promise<void>;
  loadJob(jobId: BatchJobId): Promise<BatchJob | null>;
  appendItemResult(jobId: BatchJobId, itemResult: BatchJobItemResult): Promise<void>;
  loadItemResults(jobId: BatchJobId): Promise<readonly BatchJobItemResult[]>;
  saveBatchResult(result: BatchJobResult): Promise<void>;
  loadBatchResult(jobId: BatchJobId): Promise<BatchJobResult | null>;
  listRecentBatchResults(limit?: number): Promise<readonly BatchJobResult[]>;
}

export interface ExecutionCheckpointStorePort {
  saveCheckpoint(checkpoint: ExecutionCheckpoint): Promise<void>;
  loadCheckpoint(jobId: BatchJobId): Promise<ExecutionCheckpoint | null>;
  clearCheckpoint(jobId: BatchJobId): Promise<void>;
}

export interface BatchExecutionControlPort {
  requestStop(jobId: BatchJobId, reason?: string): Promise<void>;
  clearStopRequest(jobId: BatchJobId): Promise<void>;
  isStopRequested(jobId: BatchJobId): Promise<boolean>;
}

export interface RunReportExporterPort {
  exportRunReport(input: {
    job: BatchJob;
    result: BatchJobResult;
    targetPath?: string;
  }): Promise<{ targetPath: string; exportedFiles: readonly string[] }>;
}
