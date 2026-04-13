import type { ProductProcessResult } from '../domain/types.js';
import { fileExists, readJsonFile, writeJsonFile } from '../utils/fs.js';

interface CheckpointState {
  runId: string;
  inputFile: string;
  createdAt: string;
  updatedAt: string;
  processed: Record<
    string,
    {
      status: ProductProcessResult['status'];
      actionResult: ProductProcessResult['actionResult'];
      finishedAt: string;
    }
  >;
}

export class CheckpointStore {
  private writeChain = Promise.resolve();

  private constructor(
    private readonly filePath: string,
    private readonly state: CheckpointState,
  ) {}

  static async create(options: {
    filePath: string;
    inputFile: string;
    runId: string;
    resume: boolean;
  }): Promise<CheckpointStore> {
    if (options.resume && (await fileExists(options.filePath))) {
      const state = await readJsonFile<CheckpointState>(options.filePath);

      if (state.inputFile !== options.inputFile) {
        throw new Error(
          `Checkpoint input mismatch. Expected ${state.inputFile}, received ${options.inputFile}.`,
        );
      }

      return new CheckpointStore(options.filePath, state);
    }

    const initialState: CheckpointState = {
      runId: options.runId,
      inputFile: options.inputFile,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      processed: {},
    };

    await writeJsonFile(options.filePath, initialState);
    return new CheckpointStore(options.filePath, initialState);
  }

  has(productNo: string): boolean {
    return productNo in this.state.processed;
  }

  processedCount(): number {
    return Object.keys(this.state.processed).length;
  }

  async markProcessed(result: ProductProcessResult): Promise<void> {
    this.state.processed[result.productNo] = {
      status: result.status,
      actionResult: result.actionResult,
      finishedAt: result.finishedAt,
    };
    this.state.updatedAt = new Date().toISOString();

    this.writeChain = this.writeChain.then(() =>
      writeJsonFile(this.filePath, this.state),
    );

    await this.writeChain;
  }
}
