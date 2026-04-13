// File: packages/infrastructure-playwright/src/session/storage-state.repository.ts
import path from 'node:path';
import fsPromises from 'node:fs/promises';

import { LoginSession } from '@smart-store/core';
import type { BrowserContext } from 'playwright';

import { ensureDir, fileExists, statIfExists } from '../utils/fs.js';

export class FileStorageStateRepository {
  async exists(storageStatePath: string): Promise<boolean> {
    return fileExists(storageStatePath);
  }

  async assertReadable(storageStatePath: string): Promise<void> {
    const raw = await fsPromises.readFile(storageStatePath, 'utf8');
    const parsed = JSON.parse(raw) as unknown;

    if (!parsed || typeof parsed !== 'object') {
      throw new Error('storageState content is not a JSON object.');
    }
  }

  async loadKnownSession(storageStatePath: string): Promise<LoginSession> {
    const stats = await statIfExists(storageStatePath);

    if (!stats) {
      return LoginSession.create({
        storageStatePath,
        status: 'MISSING',
        lastErrorMessage: `storageState file was not found: ${storageStatePath}`,
      });
    }

    return LoginSession.create({
      storageStatePath,
      status: 'UNKNOWN',
      preparedAt: stats.mtime.toISOString(),
    });
  }

  async save(context: BrowserContext, storageStatePath: string): Promise<LoginSession> {
    await ensureDir(path.dirname(storageStatePath));
    await context.storageState({ path: storageStatePath });

    const savedStats = await fsPromises.stat(storageStatePath);
    const savedAt = savedStats.mtime.toISOString();

    return LoginSession.create({
      storageStatePath,
      status: 'READY',
      preparedAt: savedAt,
      validatedAt: savedAt,
    });
  }
}
