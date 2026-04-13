import path from 'node:path';
import type { BrowserContext } from 'playwright';

import { ensureDir, fileExists } from '../utils/fs.js';

export async function hasSavedStorageState(
  storageStatePath: string,
): Promise<boolean> {
  return fileExists(storageStatePath);
}

export async function saveStorageStateFile(
  context: BrowserContext,
  storageStatePath: string,
): Promise<void> {
  await ensureDir(path.dirname(storageStatePath));
  await context.storageState({ path: storageStatePath });
}
