// File: packages/infrastructure-playwright/src/persistence/file-batch-execution-control.store.ts
import type { BatchExecutionControlPort } from '@smart-store/application';
import type { BatchJobId } from '@smart-store/core';

import { fileExists, removeFileIfExists, writeJsonFile } from '../utils/fs.js';
import { OutputPathResolver } from './output-path-resolver.js';

export class FileBatchExecutionControlStore implements BatchExecutionControlPort {
  constructor(private readonly paths: OutputPathResolver) {}

  async requestStop(jobId: BatchJobId, reason?: string): Promise<void> {
    await writeJsonFile(await this.paths.controlFile(jobId.toString()), {
      jobId: jobId.toString(),
      reason,
      requestedAt: new Date().toISOString(),
    });
  }

  async clearStopRequest(jobId: BatchJobId): Promise<void> {
    await removeFileIfExists(await this.paths.controlFile(jobId.toString()));
  }

  async isStopRequested(jobId: BatchJobId): Promise<boolean> {
    return fileExists(await this.paths.controlFile(jobId.toString()));
  }
}
