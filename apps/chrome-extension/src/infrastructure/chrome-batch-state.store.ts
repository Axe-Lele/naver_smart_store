// Path: C:\smart-store\apps\chrome-extension\src\infrastructure\chrome-batch-state.store.ts
import type { BatchExecutionCheckpoint } from "../domain/index.js";

const DEFAULT_BATCH_STATE_KEY = "smartstore.bundle-preorder.batch";

export class ChromeBatchStateStore {
  public constructor(private readonly storageKey = DEFAULT_BATCH_STATE_KEY) {}

  public async load(): Promise<BatchExecutionCheckpoint | null> {
    return new Promise<BatchExecutionCheckpoint | null>((resolve) => {
      chrome.storage.local.get([this.storageKey], (items) => {
        resolve((items[this.storageKey] as BatchExecutionCheckpoint | undefined) ?? null);
      });
    });
  }

  public async save(checkpoint: BatchExecutionCheckpoint): Promise<void> {
    await new Promise<void>((resolve) => {
      chrome.storage.local.set({ [this.storageKey]: checkpoint }, () => resolve());
    });
  }

  public async clear(): Promise<void> {
    await new Promise<void>((resolve) => {
      chrome.storage.local.remove(this.storageKey, () => resolve());
    });
  }
}
