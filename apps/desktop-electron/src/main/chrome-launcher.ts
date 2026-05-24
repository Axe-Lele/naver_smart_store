// File: apps/desktop-electron/src/main/chrome-launcher.ts
import fs from 'node:fs';
import path from 'node:path';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const WINDOWS_CHROME_CANDIDATES = [
  ['LOCALAPPDATA', 'Google', 'Chrome', 'Application', 'chrome.exe'],
  ['PROGRAMFILES', 'Google', 'Chrome', 'Application', 'chrome.exe'],
  ['PROGRAMFILES(X86)', 'Google', 'Chrome', 'Application', 'chrome.exe'],
  ['LOCALAPPDATA', 'Google', 'Chrome Beta', 'Application', 'chrome.exe'],
  ['PROGRAMFILES', 'Google', 'Chrome Beta', 'Application', 'chrome.exe'],
  ['PROGRAMFILES(X86)', 'Google', 'Chrome Beta', 'Application', 'chrome.exe'],
  ['LOCALAPPDATA', 'Google', 'Chrome SxS', 'Application', 'chrome.exe'],
] as const;

export async function resolveChromeExecutablePath(): Promise<string | null> {
  for (const candidate of WINDOWS_CHROME_CANDIDATES) {
    const [envKey, ...segments] = candidate;
    const envValue = process.env[envKey];

    if (!envValue) {
      continue;
    }

    const resolved = path.join(envValue, ...segments);
    if (fs.existsSync(resolved)) {
      return resolved;
    }
  }

  try {
    const result = await execFileAsync('where.exe', ['chrome']);
    const firstPath = result.stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line.toLowerCase().endsWith('chrome.exe'));

    return firstPath || null;
  } catch {
    return null;
  }
}

export async function openUrlInChrome(
  target: string,
  options: { newWindow?: boolean } = {},
): Promise<string | null> {
  const chromePath = await resolveChromeExecutablePath();
  if (!chromePath) {
    return null;
  }

  await new Promise<void>((resolve, reject) => {
    const child = spawn(chromePath, buildChromeArgs(target, options), {
      detached: true,
      stdio: 'ignore',
      windowsHide: false,
    });

    child.once('error', reject);
    child.once('spawn', () => {
      child.unref();
      resolve();
    });
  });

  return chromePath;
}

function buildChromeArgs(
  target: string,
  options: { newWindow?: boolean },
): string[] {
  if (target.toLowerCase().startsWith('chrome://')) {
    return [target];
  }

  return options.newWindow === false ? [target] : ['--new-window', target];
}
