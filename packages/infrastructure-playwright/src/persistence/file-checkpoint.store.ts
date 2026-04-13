// File: packages/infrastructure-playwright/src/persistence/file-checkpoint.store.ts
import {
  BatchJobId,
  ExecutionCheckpoint,
  type ExecutionCheckpointSnapshot,
} from '@smart-store/core';
import type { ExecutionCheckpointStorePort } from '@smart-store/application';

import { fileExists, readJsonFile, removeFileIfExists, writeJsonFile } from '../utils/fs.js';
import { OutputPathResolver } from './output-path-resolver.js';

export class FileExecutionCheckpointStore implements ExecutionCheckpointStorePort {
  constructor(private readonly paths: OutputPathResolver) {}

  async saveCheckpoint(checkpoint: ExecutionCheckpoint): Promise<void> {
    await writeJsonFile(
      await this.paths.checkpointFile(checkpoint.jobId.toString()),
      checkpoint.toSnapshot(),
    );
  }

  async loadCheckpoint(jobId: BatchJobId): Promise<ExecutionCheckpoint | null> {
    const filePath = await this.paths.checkpointFile(jobId.toString());
    if (!(await fileExists(filePath))) {
      return null;
    }

    return ExecutionCheckpoint.create(
      await readJsonFile<ExecutionCheckpointSnapshot>(filePath),
    );
  }

  async clearCheckpoint(jobId: BatchJobId): Promise<void> {
    await removeFileIfExists(await this.paths.checkpointFile(jobId.toString()));
  }
}
