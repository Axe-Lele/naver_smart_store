// File: C:\smart-store\tests\extension\chrome-stores.test.ts
import { beforeEach, describe, expect, it } from 'vitest';

import { ChromeBatchStateStore } from '../../apps/chrome-extension/src/infrastructure/chrome-batch-state.store.js';
import { ChromeProgressStore } from '../../apps/chrome-extension/src/infrastructure/chrome-progress.store.js';

describe('Chrome extension stores', () => {
  beforeEach(() => {
    const storage = new Map<string, unknown>();
    (globalThis as typeof globalThis & { chrome: typeof chrome }).chrome = {
      storage: {
        local: {
          get(keys: string[], callback: (items: Record<string, unknown>) => void) {
            const items = Object.fromEntries(keys.map((key) => [key, storage.get(key)]));
            callback(items);
          },
          set(items: Record<string, unknown>, callback: () => void) {
            for (const [key, value] of Object.entries(items)) {
              storage.set(key, value);
            }
            callback();
          },
          remove(key: string, callback: () => void) {
            storage.delete(key);
            callback();
          },
        },
      },
    } as unknown as typeof chrome;
  });

  it('stores progress snapshots and appends logs', async () => {
    const store = new ChromeProgressStore('test.progress');
    await store.reset();
    await store.save({
      phase: 'dry-run',
      updatedAt: new Date().toISOString(),
      targetCount: 10,
      completedCount: 2,
      results: [],
      logs: [],
    });
    await store.appendLog({
      timestamp: new Date().toISOString(),
      level: 'info',
      message: 'progress updated',
    });

    const loaded = await store.load();
    expect(loaded.phase).toBe('dry-run');
    expect(loaded.logs).toHaveLength(1);
  });

  it('stores and clears batch checkpoints for resume support', async () => {
    const store = new ChromeBatchStateStore('test.batch');
    await store.save({
      status: 'running',
      mode: 'execute',
      searchPageUrl: 'https://sell.smartstore.naver.com/#/products/origin-list',
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      currentIndex: 3,
      stopRequested: false,
      delayMs: 750,
      skipSucceeded: true,
      consecutiveFailureCount: 1,
      stopOnConsecutiveFailures: 20,
      targets: [],
      results: [],
    });

    const loaded = await store.load();
    expect(loaded?.currentIndex).toBe(3);

    await store.clear();
    expect(await store.load()).toBeNull();
  });
});
