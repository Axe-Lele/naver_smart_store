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

export type ChromeLaunchOptions = {
  newWindow?: boolean;
  userDataDir?: string;
  extensionPath?: string;
};

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
  options: ChromeLaunchOptions = {},
): Promise<string | null> {
  const chromePath = await resolveChromeExecutablePath();
  if (!chromePath) {
    return null;
  }

  if (options.userDataDir) {
    fs.mkdirSync(options.userDataDir, { recursive: true });
  }

  await new Promise<void>((resolve, reject) => {
    const child = spawn(chromePath, buildChromeLaunchArgs(target, options), {
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

export function buildChromeLaunchArgs(
  target: string,
  options: ChromeLaunchOptions = {},
): string[] {
  const args: string[] = [
    '--no-first-run',
    '--no-default-browser-check',
  ];

  if (options.userDataDir) {
    args.push(`--user-data-dir=${path.resolve(options.userDataDir)}`);
  }

  if (options.extensionPath) {
    args.push(`--load-extension=${path.resolve(options.extensionPath)}`);
  }

  if (options.newWindow !== false) {
    args.push('--new-window');
  }

  args.push(target);
  return args;
}
