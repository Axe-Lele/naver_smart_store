// File: scripts/prepare-playwright-runtime.mjs
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const projectRoot = process.cwd();
const runtimeDir = path.join(projectRoot, '.playwright-browsers');
const cliPath = path.join(projectRoot, 'node_modules', 'playwright', 'cli.js');

fs.mkdirSync(runtimeDir, { recursive: true });

console.log(`[installer] Preparing Playwright browser runtime in ${runtimeDir}`);

execFileSync(
  process.execPath,
  [cliPath, 'install', 'chromium'],
  {
    cwd: projectRoot,
    stdio: 'inherit',
    env: {
      ...process.env,
      PLAYWRIGHT_BROWSERS_PATH: runtimeDir,
    },
  },
);

console.log('[installer] Playwright browser runtime is ready.');
