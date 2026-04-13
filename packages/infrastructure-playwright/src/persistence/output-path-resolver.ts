// File: packages/infrastructure-playwright/src/persistence/output-path-resolver.ts
import path from 'node:path';

import { sanitizeFileSegment } from '../utils/fs.js';

export type OutputDirProvider = () => Promise<string>;

export class OutputPathResolver {
  constructor(private readonly outputDirProvider: OutputDirProvider) {}

  async jobsDir(): Promise<string> {
    return path.join(await this.outputDirProvider(), 'state', 'jobs');
  }

  async itemResultsDir(): Promise<string> {
    return path.join(await this.outputDirProvider(), 'state', 'item-results');
  }

  async batchResultsDir(): Promise<string> {
    return path.join(await this.outputDirProvider(), 'state', 'batch-results');
  }

  async checkpointsDir(): Promise<string> {
    return path.join(await this.outputDirProvider(), 'state', 'checkpoints');
  }

  async controlDir(): Promise<string> {
    return path.join(await this.outputDirProvider(), 'state', 'control');
  }

  async reportsDir(): Promise<string> {
    return path.join(await this.outputDirProvider(), 'reports');
  }

  async jobFile(jobId: string): Promise<string> {
    return path.join(await this.jobsDir(), `${sanitizeFileSegment(jobId)}.json`);
  }

  async itemResultsFile(jobId: string): Promise<string> {
    return path.join(await this.itemResultsDir(), `${sanitizeFileSegment(jobId)}.jsonl`);
  }

  async batchResultFile(jobId: string): Promise<string> {
    return path.join(await this.batchResultsDir(), `${sanitizeFileSegment(jobId)}.json`);
  }

  async checkpointFile(jobId: string): Promise<string> {
    return path.join(await this.checkpointsDir(), `${sanitizeFileSegment(jobId)}.json`);
  }

  async controlFile(jobId: string): Promise<string> {
    return path.join(await this.controlDir(), `${sanitizeFileSegment(jobId)}.json`);
  }

  async reportDir(jobId: string): Promise<string> {
    return path.join(await this.reportsDir(), sanitizeFileSegment(jobId));
  }
}
