import type { Page } from 'playwright';

import {
  SessionRecoveryRequiredError,
  type SessionFailureReason,
} from '../domain/errors.js';
import { smartStoreSelectors } from '../pages/selectors.js';

export type SessionLaunchMode = 'storageState' | 'persistent' | 'missing';

export type SessionProbeStatus =
  | 'AUTHENTICATED'
  | 'LOGIN_REQUIRED'
  | 'CHALLENGE_REQUIRED'
  | 'ACCESS_DENIED'
  | 'EXPECTED_PAGE_MISSING';

export interface SessionProbeResult {
  status: SessionProbeStatus;
  reason: SessionFailureReason | null;
  currentUrl: string;
  detail: string;
  expectedPageName: string;
}

export interface SessionHealthSignals {
  currentUrl: string;
  loginFormVisible: boolean;
  challengeVisible: boolean;
  accessDeniedVisible: boolean;
  expectedPageVisible: boolean;
  expectedPageName: string;
}

export function resolveSessionLaunchMode(options: {
  hasStorageState: boolean;
  loginMode: 'storageState' | 'persistent';
}): SessionLaunchMode {
  if (options.hasStorageState) {
    return 'storageState';
  }

  if (options.loginMode === 'persistent') {
    return 'persistent';
  }

  return 'missing';
}

export function classifySessionHealth(
  signals: SessionHealthSignals,
): SessionProbeResult {
  if (/login|nidlogin/i.test(signals.currentUrl)) {
    return {
      status: 'LOGIN_REQUIRED',
      reason: 'LOGIN_REDIRECT',
      currentUrl: signals.currentUrl,
      detail: 'The browser was redirected to the Naver login page.',
      expectedPageName: signals.expectedPageName,
    };
  }

  if (signals.challengeVisible) {
    return {
      status: 'CHALLENGE_REQUIRED',
      reason: 'CHALLENGE_REQUIRED',
      currentUrl: signals.currentUrl,
      detail: 'CAPTCHA or MFA challenge is still visible.',
      expectedPageName: signals.expectedPageName,
    };
  }

  if (signals.loginFormVisible) {
    return {
      status: 'LOGIN_REQUIRED',
      reason: 'LOGIN_FORM_VISIBLE',
      currentUrl: signals.currentUrl,
      detail: 'Naver login form is still visible.',
      expectedPageName: signals.expectedPageName,
    };
  }

  if (signals.accessDeniedVisible || isAccessDeniedUrl(signals.currentUrl)) {
    return {
      status: 'ACCESS_DENIED',
      reason: 'ACCESS_DENIED',
      currentUrl: signals.currentUrl,
      detail:
        'An access-denied or permission-related page is visible instead of the Smart Store page.',
      expectedPageName: signals.expectedPageName,
    };
  }

  if (signals.expectedPageVisible) {
    return {
      status: 'AUTHENTICATED',
      reason: null,
      currentUrl: signals.currentUrl,
      detail: `${signals.expectedPageName} is visible and ready.`,
      expectedPageName: signals.expectedPageName,
    };
  }

  return {
    status: 'EXPECTED_PAGE_MISSING',
    reason: 'EXPECTED_PAGE_MISSING',
    currentUrl: signals.currentUrl,
    detail: `${signals.expectedPageName} did not show the expected core selectors.`,
    expectedPageName: signals.expectedPageName,
  };
}

export async function probeSessionHealth(
  page: Page,
  options: {
    landingUrl?: string;
    timeoutMs?: number;
    expectedPageName: string;
    expectedSelectors: readonly string[];
  },
): Promise<SessionProbeResult> {
  if (options.landingUrl) {
    await page.goto(options.landingUrl, {
      waitUntil: 'domcontentloaded',
    });
  }

  const timeoutMs = options.timeoutMs ?? 8_000;

  await page
    .waitForLoadState('networkidle', { timeout: Math.min(timeoutMs, 5_000) })
    .catch(() => undefined);

  const signals: SessionHealthSignals = {
    currentUrl: page.url(),
    loginFormVisible: await isAnyVisible(
      page,
      smartStoreSelectors.auth.loginIndicators,
      500,
    ),
    challengeVisible: await isAnyVisible(
      page,
      smartStoreSelectors.auth.challengeIndicators,
      500,
    ),
    accessDeniedVisible: await isAnyVisible(
      page,
      smartStoreSelectors.auth.accessDeniedIndicators,
      500,
    ),
    expectedPageVisible: await isAnyVisible(
      page,
      options.expectedSelectors,
      timeoutMs,
    ),
    expectedPageName: options.expectedPageName,
  };

  return classifySessionHealth(signals);
}

export async function assertSessionHealthy(
  page: Page,
  options: {
    storageStatePath: string;
    landingUrl?: string;
    timeoutMs?: number;
    expectedPageName: string;
    expectedSelectors: readonly string[];
  },
): Promise<SessionProbeResult> {
  const probe = await probeSessionHealth(page, options);

  if (probe.status === 'AUTHENTICATED') {
    return probe;
  }

  throw createSessionRecoveryError(probe, options.storageStatePath);
}

export function createMissingStorageStateError(
  storageStatePath: string,
): SessionRecoveryRequiredError {
  return new SessionRecoveryRequiredError(
    'STORAGE_STATE_MISSING',
    buildMissingStorageStateMessage(storageStatePath),
  );
}

export function createInvalidStorageStateError(
  storageStatePath: string,
): SessionRecoveryRequiredError {
  return new SessionRecoveryRequiredError(
    'STORAGE_STATE_INVALID',
    buildExpiredStorageStateMessage(storageStatePath),
  );
}

export function createSessionRecoveryError(
  probe: SessionProbeResult,
  storageStatePath: string,
): SessionRecoveryRequiredError {
  const recoveryLines = [
    `Current URL: ${probe.currentUrl}`,
    `Expected page: ${probe.expectedPageName}`,
    `Saved storageState path: ${storageStatePath}`,
    'Recovery:',
    '1. Run "npm run login:prepare".',
    '2. Log in to Naver Smart Store manually in the opened browser.',
    '3. Complete any CAPTCHA or MFA manually if prompted.',
    '4. Re-run your original "npm run poc" or "npm run run" command.',
  ];

  if (probe.reason === 'ACCESS_DENIED') {
    recoveryLines.splice(
      3,
      0,
      'If access is still denied after refreshing the session, verify seller-center permissions for this account.',
    );
  }

  return new SessionRecoveryRequiredError(
    probe.reason ?? 'EXPECTED_PAGE_MISSING',
    [probe.detail, ...recoveryLines].join('\n'),
  );
}

export function buildMissingStorageStateMessage(storageStatePath: string): string {
  return [
    `Saved storageState file was not found: ${storageStatePath}`,
    'Recovery:',
    '1. Run "npm run login:prepare".',
    '2. Log in to Naver Smart Store manually in the opened browser.',
    '3. Press Enter after the product list page is visible.',
  ].join('\n');
}

export function buildExpiredStorageStateMessage(
  storageStatePath: string,
): string {
  return [
    `Saved storageState appears to be missing, expired, or no longer valid: ${storageStatePath}`,
    'Recovery:',
    '1. Run "npm run login:prepare".',
    '2. Complete any login, CAPTCHA, or MFA manually.',
    '3. Re-run your "npm run poc" or "npm run run" command after the new session is saved.',
  ].join('\n');
}

export function buildLoginPrepareSuccessMessage(
  storageStatePath: string,
): string {
  return [
    `storageState saved successfully: ${storageStatePath}`,
    'Next step:',
    'Run "npm run poc -- --input input\\products.csv --dry-run" or your normal run command.',
  ].join('\n');
}

async function isAnyVisible(
  page: Page,
  selectors: readonly string[],
  timeoutMs: number,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    for (const selector of selectors) {
      const locator = page.locator(selector).first();
      const visible = await locator.isVisible().catch(() => false);

      if (visible) {
        return true;
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  return false;
}

function isAccessDeniedUrl(url: string): boolean {
  return smartStoreSelectors.auth.accessDeniedUrlPatterns.some((pattern) =>
    pattern.test(url),
  );
}
