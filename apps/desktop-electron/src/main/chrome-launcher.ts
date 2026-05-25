// File: apps/desktop-electron/src/main/chrome-launcher.ts
import fs from 'node:fs';
import path from 'node:path';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const CHROME_PATH_ENV_KEYS = [
  'SMART_STORE_CHROME_PATH',
  'CHROME_PATH',
  'GOOGLE_CHROME_SHIM',
] as const;

const WINDOWS_CHROME_CANDIDATES = [
  ['LOCALAPPDATA', 'Google', 'Chrome', 'Application', 'chrome.exe'],
  ['PROGRAMFILES', 'Google', 'Chrome', 'Application', 'chrome.exe'],
  ['PROGRAMFILES(X86)', 'Google', 'Chrome', 'Application', 'chrome.exe'],
  ['PROGRAMW6432', 'Google', 'Chrome', 'Application', 'chrome.exe'],
  ['LOCALAPPDATA', 'Google', 'Chrome Beta', 'Application', 'chrome.exe'],
  ['PROGRAMFILES', 'Google', 'Chrome Beta', 'Application', 'chrome.exe'],
  ['PROGRAMFILES(X86)', 'Google', 'Chrome Beta', 'Application', 'chrome.exe'],
  ['PROGRAMW6432', 'Google', 'Chrome Beta', 'Application', 'chrome.exe'],
  ['LOCALAPPDATA', 'Google', 'Chrome SxS', 'Application', 'chrome.exe'],
] as const;

const WINDOWS_CHROME_APP_PATH_REGISTRY_KEYS = [
  'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\chrome.exe',
  'HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\chrome.exe',
  'HKLM\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\App Paths\\chrome.exe',
] as const;

export type ChromeLaunchOptions = {
  newWindow?: boolean;
  userDataDir?: string;
  profileDirectory?: string;
  extensionPath?: string;
};

export async function resolveChromeExecutablePath(): Promise<string | null> {
  for (const envKey of CHROME_PATH_ENV_KEYS) {
    const resolved = normalizeChromeExecutablePath(process.env[envKey]);
    if (resolved) {
      return resolved;
    }
  }

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

  const registeredPath = await resolveChromePathFromWindowsRegistry();
  if (registeredPath) {
    return registeredPath;
  }

  try {
    const result = await execFileAsync('where.exe', ['chrome']);
    const firstPath = result.stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .map(normalizeChromeExecutablePath)
      .find((line): line is string => Boolean(line));

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

  if (options.profileDirectory) {
    args.push(`--profile-directory=${options.profileDirectory}`);
  }

  if (options.extensionPath) {
    args.push(`--disable-extensions-except=${path.resolve(options.extensionPath)}`);
    args.push(`--load-extension=${path.resolve(options.extensionPath)}`);
  }

  if (options.newWindow !== false) {
    args.push('--new-window');
  }

  args.push(target);
  return args;
}

async function resolveChromePathFromWindowsRegistry(): Promise<string | null> {
  if (process.platform !== 'win32') {
    return null;
  }

  for (const registryKey of WINDOWS_CHROME_APP_PATH_REGISTRY_KEYS) {
    try {
      const result = await execFileAsync('reg.exe', ['query', registryKey, '/ve']);
      const resolved = normalizeChromeExecutablePath(parseRegistryDefaultValue(result.stdout));
      if (resolved) {
        return resolved;
      }
    } catch {
      continue;
    }
  }

  return null;
}

function parseRegistryDefaultValue(output: string): string | undefined {
  const lines = output.split(/\r?\n/).map((line) => line.trim());
  const defaultValueLine = lines.find((line) => line.includes('REG_SZ'));
  if (!defaultValueLine) {
    return undefined;
  }

  return defaultValueLine.replace(/^.*REG_SZ\s+/i, '').trim();
}

function normalizeChromeExecutablePath(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const resolved = path.resolve(value.replace(/^"|"$/g, '').trim());
  return path.basename(resolved).toLowerCase() === 'chrome.exe' &&
    fs.existsSync(resolved)
    ? resolved
    : null;
}
