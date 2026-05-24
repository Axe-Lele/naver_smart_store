// Path: C:\smart-store\apps\chrome-extension\src\infrastructure\chrome-progress.store.ts
import type {
  ProgressLogEntry,
  ProgressSnapshot,
  ProgressStorePort,
} from "../application/index.js";

const DEFAULT_PROGRESS_KEY = "smartstore.bundle-preorder.progress";

const EMPTY_SNAPSHOT: ProgressSnapshot = {
  phase: "idle",
  updatedAt: new Date(0).toISOString(),
  targetCount: 0,
  completedCount: 0,
  results: [],
  logs: [],
};

export class ChromeProgressStore implements ProgressStorePort {
  public constructor(private readonly storageKey = DEFAULT_PROGRESS_KEY) {}

  public async load(): Promise<ProgressSnapshot> {
    const record = await readFromStorage<ProgressSnapshot>(this.storageKey);
    return record ?? EMPTY_SNAPSHOT;
  }

  public async save(snapshot: ProgressSnapshot): Promise<void> {
    await writeToStorage(this.storageKey, snapshot);
  }

  public async appendLog(entry: ProgressLogEntry): Promise<void> {
    const snapshot = await this.load();
    const next: ProgressSnapshot = {
      ...snapshot,
      updatedAt: new Date().toISOString(),
      logs: [...snapshot.logs, entry].slice(-100),
    };
    await this.save(next);
  }

  public async reset(): Promise<void> {
    await this.save({
      ...EMPTY_SNAPSHOT,
      updatedAt: new Date().toISOString(),
    });
  }
}

async function readFromStorage<T>(key: string): Promise<T | undefined> {
  return new Promise<T | undefined>((resolve) => {
    chrome.storage.local.get([key], (items) => {
      resolve(items[key] as T | undefined);
    });
  });
}

async function writeToStorage<T>(key: string, value: T): Promise<void> {
  await new Promise<void>((resolve) => {
    chrome.storage.local.set({ [key]: value }, () => {
      resolve();
    });
  });
}
