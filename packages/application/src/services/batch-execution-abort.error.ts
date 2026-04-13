// File: packages/application/src/services/batch-execution-abort.error.ts
import type { BatchJobItemResult } from '@smart-store/core';

export class BatchExecutionAbortError extends Error {
  constructor(
    public readonly itemResult: BatchJobItemResult,
    public readonly stopReason: string,
    cause?: unknown,
  ) {
    super(stopReason);
    this.name = 'BatchExecutionAbortError';

    if (cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = cause;
    }
  }
}
