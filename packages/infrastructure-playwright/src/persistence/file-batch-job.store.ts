// File: packages/infrastructure-playwright/src/persistence/file-batch-job.store.ts
import {
  BatchJob,
  BatchJobId,
  BatchJobItemResult,
  BatchJobResult,
  type BatchJobItemResultSnapshot,
  type BatchJobResultSnapshot,
} from '@smart-store/core';
import type { BatchJobStorePort } from '@smart-store/application';

import { listFiles, readJsonFile, readJsonLines, writeJsonFile, appendJsonLine, fileExists } from '../utils/fs.js';
import { OutputPathResolver } from './output-path-resolver.js';

export class FileBatchJobStore implements BatchJobStorePort {
  constructor(private readonly paths: OutputPathResolver) {}

  async saveJob(job: BatchJob): Promise<void> {
    await writeJsonFile(await this.paths.jobFile(job.id.toString()), job.toSnapshot());
  }

  async loadJob(jobId: BatchJobId): Promise<BatchJob | null> {
    const filePath = await this.paths.jobFile(jobId.toString());
    if (!(await fileExists(filePath))) {
      return null;
    }

    return BatchJob.create(await readJsonFile(filePath));
  }

  async appendItemResult(jobId: BatchJobId, itemResult: BatchJobItemResult): Promise<void> {
    await appendJsonLine(
      await this.paths.itemResultsFile(jobId.toString()),
      itemResult.toSnapshot(),
    );
  }

  async loadItemResults(jobId: BatchJobId): Promise<readonly BatchJobItemResult[]> {
    const lines = await readJsonLines<BatchJobItemResultSnapshot>(
      await this.paths.itemResultsFile(jobId.toString()),
    );
    return lines.map((line) => BatchJobItemResult.create(line));
  }

  async saveBatchResult(result: BatchJobResult): Promise<void> {
    await writeJsonFile(
      await this.paths.batchResultFile(result.jobId),
      result.toSnapshot(),
    );
  }

  async loadBatchResult(jobId: BatchJobId): Promise<BatchJobResult | null> {
    const filePath = await this.paths.batchResultFile(jobId.toString());
    if (!(await fileExists(filePath))) {
      return null;
    }

    return BatchJobResult.create(
      await readJsonFile<BatchJobResultSnapshot>(filePath),
    );
  }

  async listRecentBatchResults(limit = 20): Promise<readonly BatchJobResult[]> {
    const files = await listFiles(await this.paths.batchResultsDir());
    const results = await Promise.all(
      files.map(async (filePath) =>
        BatchJobResult.create(await readJsonFile<BatchJobResultSnapshot>(filePath)),
      ),
    );

    return results
      .sort((left, right) => right.finishedAt.localeCompare(left.finishedAt))
      .slice(0, limit);
  }
}
