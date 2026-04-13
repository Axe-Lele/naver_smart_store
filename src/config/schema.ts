import { config as loadDotEnv } from 'dotenv';
import path from 'node:path';
import { z } from 'zod';

loadDotEnv({ quiet: true });

export const DEFAULT_STORAGE_STATE_RELATIVE_PATH = './.auth/smartstore-storage-state.json';
export const DEFAULT_USER_DATA_DIR_RELATIVE_PATH = './.auth/chrome-profile';

const booleanish = z
  .union([z.boolean(), z.string()])
  .optional()
  .transform((value) => {
    if (typeof value === 'boolean') {
      return value;
    }

    if (value === undefined || value === '') {
      return undefined;
    }

    return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
  });

const numberish = z
  .union([z.number(), z.string()])
  .optional()
  .transform((value) => {
    if (typeof value === 'number') {
      return value;
    }

    if (value === undefined || value === '') {
      return undefined;
    }

    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  });

const stringish = z
  .string()
  .optional()
  .transform((value) => {
    const trimmed = value?.trim();
    return trimmed && trimmed.length > 0 ? trimmed : undefined;
  });

const envSchema = z
  .object({
    SMARTSTORE_PRODUCTS_URL: z.string().min(1),
    SMARTSTORE_LOGIN_MODE: z
      .enum(['storageState', 'persistent'])
      .optional()
      .default('storageState'),
    SMARTSTORE_STORAGE_STATE_PATH: stringish,
    SMARTSTORE_USER_DATA_DIR: stringish,
    SMARTSTORE_CHROME_CHANNEL: z.string().optional().default('chrome'),
    SMARTSTORE_EXECUTABLE_PATH: stringish,
    SMARTSTORE_HEADLESS: booleanish.default(false),
    SMARTSTORE_TIMEOUT_MS: numberish.default(20_000),
    SMARTSTORE_NAVIGATION_TIMEOUT_MS: numberish.default(45_000),
    SMARTSTORE_OUTPUT_DIR: z.string().optional().default('./output'),
    SMARTSTORE_CONSECUTIVE_FAILURE_LIMIT: numberish.default(20),
    SMARTSTORE_CAPTURE_SCREENSHOT_ON_FAILURE: booleanish.default(true),
    SMARTSTORE_CAPTURE_HTML_ON_FAILURE: booleanish.default(true),
    SMARTSTORE_DEFAULT_DELAY_MS: numberish.default(1_500),
  });

const cliOptionsSchema = z.object({
  input: z.string().min(1),
  dryRun: z.boolean().default(false),
  maxItems: z.number().int().positive().optional(),
  resume: z.boolean().default(false),
  concurrency: z.number().int().min(1).max(8).default(1),
  delayMs: z.number().int().min(0).optional(),
});

export interface CliOverrides extends z.input<typeof cliOptionsSchema> {}

export type EnvironmentConfig = z.output<typeof envSchema>;

export interface AppConfig {
  mode: 'poc' | 'full';
  inputFile: string;
  productsUrl: string;
  loginMode: 'storageState' | 'persistent';
  storageStatePath: string;
  userDataDir: string;
  chromeChannel?: string;
  executablePath?: string;
  headless: boolean;
  timeoutMs: number;
  navigationTimeoutMs: number;
  outputDir: string;
  checkpointFile: string;
  resultsJsonlPath: string;
  successCsvPath: string;
  lockedCsvPath: string;
  failedCsvPath: string;
  summaryPath: string;
  screenshotsDir: string;
  htmlDir: string;
  logPath: string;
  dryRun: boolean;
  maxItems?: number;
  resume: boolean;
  concurrency: number;
  delayMs: number;
  consecutiveFailureLimit: number;
  captureScreenshotOnFailure: boolean;
  captureHtmlOnFailure: boolean;
  runId: string;
}

export function readEnvironmentConfig(): EnvironmentConfig {
  return envSchema.parse(process.env);
}

export function resolveStorageStatePath(
  rawPath?: string,
  cwd = process.cwd(),
): string {
  return path.resolve(
    cwd,
    rawPath?.trim() || DEFAULT_STORAGE_STATE_RELATIVE_PATH,
  );
}

export function resolveUserDataDir(
  rawPath?: string,
  cwd = process.cwd(),
): string {
  return path.resolve(
    cwd,
    rawPath?.trim() || DEFAULT_USER_DATA_DIR_RELATIVE_PATH,
  );
}

export function buildConfig(
  mode: 'poc' | 'full',
  overrides: CliOverrides,
): AppConfig {
  const env = readEnvironmentConfig();
  const cli = cliOptionsSchema.parse({
    ...overrides,
    maxItems:
      mode === 'poc'
        ? Math.min(overrides.maxItems ?? 20, 20)
        : overrides.maxItems,
  });

  const outputDir = path.resolve(process.cwd(), env.SMARTSTORE_OUTPUT_DIR);
  const runId = new Date().toISOString().replace(/[:.]/g, '-');

  return {
    mode,
    inputFile: path.resolve(process.cwd(), cli.input),
    productsUrl: env.SMARTSTORE_PRODUCTS_URL,
    loginMode: env.SMARTSTORE_LOGIN_MODE,
    storageStatePath: resolveStorageStatePath(env.SMARTSTORE_STORAGE_STATE_PATH),
    userDataDir: resolveUserDataDir(env.SMARTSTORE_USER_DATA_DIR),
    chromeChannel:
      env.SMARTSTORE_EXECUTABLE_PATH && env.SMARTSTORE_CHROME_CHANNEL === 'chrome'
        ? undefined
        : env.SMARTSTORE_CHROME_CHANNEL,
    executablePath: env.SMARTSTORE_EXECUTABLE_PATH
      ? path.resolve(process.cwd(), env.SMARTSTORE_EXECUTABLE_PATH)
      : undefined,
    headless: env.SMARTSTORE_HEADLESS,
    timeoutMs: env.SMARTSTORE_TIMEOUT_MS,
    navigationTimeoutMs: env.SMARTSTORE_NAVIGATION_TIMEOUT_MS,
    outputDir,
    checkpointFile: path.join(outputDir, 'checkpoint.json'),
    resultsJsonlPath: path.join(outputDir, 'results.jsonl'),
    successCsvPath: path.join(outputDir, 'success.csv'),
    lockedCsvPath: path.join(outputDir, 'locked.csv'),
    failedCsvPath: path.join(outputDir, 'failed.csv'),
    summaryPath: path.join(outputDir, 'run-summary.json'),
    screenshotsDir: path.join(outputDir, 'screenshots'),
    htmlDir: path.join(outputDir, 'html'),
    logPath: path.join(outputDir, 'app.log'),
    dryRun: cli.dryRun,
    maxItems: cli.maxItems,
    resume: cli.resume,
    concurrency: cli.concurrency,
    delayMs: cli.delayMs ?? env.SMARTSTORE_DEFAULT_DELAY_MS,
    consecutiveFailureLimit: env.SMARTSTORE_CONSECUTIVE_FAILURE_LIMIT,
    captureScreenshotOnFailure: env.SMARTSTORE_CAPTURE_SCREENSHOT_ON_FAILURE,
    captureHtmlOnFailure: env.SMARTSTORE_CAPTURE_HTML_ON_FAILURE,
    runId,
  };
}
