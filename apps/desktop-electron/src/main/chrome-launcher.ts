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
  executablePath?: string;
  newWindow?: boolean;
  windowSize?: {
    width: number;
    height: number;
  };
  windowPosition?: {
    x: number;
    y: number;
  };
  userDataDir?: string;
  profileDirectory?: string;
  extensionPath?: string;
  disableExtensionsExcept?: boolean;
  restartExistingUserDataDir?: boolean;
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
  const chromePath = options.executablePath
    ? normalizeChromeExecutablePath(options.executablePath)
    : await resolveChromeExecutablePath();
  if (!chromePath) {
    return null;
  }

  if (options.userDataDir) {
    fs.mkdirSync(options.userDataDir, { recursive: true });
  }

  if (options.restartExistingUserDataDir && options.userDataDir) {
    await terminateChromeProcessesForUserDataDir(options.userDataDir);
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

async function terminateChromeProcessesForUserDataDir(
  userDataDir: string,
): Promise<void> {
  if (process.platform !== 'win32') {
    return;
  }

  const normalizedUserDataDir = path.resolve(userDataDir);
  const targetLiteral = toPowerShellSingleQuotedString(normalizedUserDataDir);
  const script = [
    `$target = [System.IO.Path]::GetFullPath(${targetLiteral}).TrimEnd("\\")`,
    '$deadline = (Get-Date).AddMilliseconds(3000)',
    '$argumentPattern = \'(?i)--user-data-dir=(?:"([^"]+)"|([^\\s]+))\'',
    'do {',
    '  $chromeProcesses = @(Get-CimInstance Win32_Process -Filter "Name = \'chrome.exe\'" | Where-Object {',
    '    $cmd = $_.CommandLine',
    '    if (-not $cmd) { $false } else {',
    '    $match = [regex]::Match($cmd, $argumentPattern)',
    '    if (-not $match.Success) { $false } else {',
    '    $raw = if ($match.Groups[1].Success) { $match.Groups[1].Value } else { $match.Groups[2].Value }',
    '    try {',
    '      $candidate = [System.IO.Path]::GetFullPath($raw).TrimEnd("\\")',
    '    } catch {',
    '      $candidate = $raw.TrimEnd("\\")',
    '    }',
    '    [System.StringComparer]::OrdinalIgnoreCase.Equals($candidate, $target)',
    '    }',
    '    }',
    '  })',
    '  foreach ($process in $chromeProcesses) {',
    '    Stop-Process -Id $process.ProcessId -Force -ErrorAction SilentlyContinue',
    '  }',
    '  if ($chromeProcesses.Count -eq 0) { break }',
    '  Start-Sleep -Milliseconds 100',
    '} while ((Get-Date) -lt $deadline)',
  ].join('\n');

  try {
    await execFileAsync('powershell.exe', [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      script,
    ]);
  } catch {
    // Best effort: a running dedicated browser profile may ignore launch switches.
    // If closing fails, the UI will still surface connection state.
  }
}

function toPowerShellSingleQuotedString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
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
    if (options.disableExtensionsExcept) {
      args.push(`--disable-extensions-except=${path.resolve(options.extensionPath)}`);
    }
    args.push(`--load-extension=${path.resolve(options.extensionPath)}`);
  }

  if (options.windowSize) {
    args.push(`--window-size=${options.windowSize.width},${options.windowSize.height}`);
  }

  if (options.windowPosition) {
    args.push(`--window-position=${options.windowPosition.x},${options.windowPosition.y}`);
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
