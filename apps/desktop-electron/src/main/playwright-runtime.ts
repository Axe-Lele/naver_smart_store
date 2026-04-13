// File: apps/desktop-electron/src/main/playwright-runtime.ts
import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';

export function configurePlaywrightRuntime(): void {
  const candidates = app.isPackaged
    ? [path.join(process.resourcesPath, 'playwright-runtime')]
    : [path.join(process.cwd(), '.playwright-browsers')];

  const runtimePath = candidates.find((candidate) => fs.existsSync(candidate));

  if (runtimePath) {
    process.env.PLAYWRIGHT_BROWSERS_PATH = runtimePath;
  }
}
