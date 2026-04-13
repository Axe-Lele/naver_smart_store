// File: packages/infrastructure-playwright/src/session/session-health-monitor.ts
import { LoginSession } from '@smart-store/core';
import type { Page } from 'playwright';

import type { ResolvedSelectorProfile } from '../config/selector-profile.js';
import {
  ManualLoginTimeoutError,
  SessionRecoveryRequiredError,
  type SessionProbeResult,
} from '../errors/playwright-infrastructure.error.js';
import { sleep } from '../utils/time.js';

export interface SessionExpectation {
  expectedPageName: string;
  expectedSelectors: readonly string[];
  storageStatePath: string;
  landingUrl?: string;
  timeoutMs?: number;
}

export class SessionHealthMonitor {
  constructor(
    private readonly selectorProfile: ResolvedSelectorProfile,
    private readonly pollIntervalMs = 250,
  ) {}

  async probe(page: Page, expectation: SessionExpectation): Promise<SessionProbeResult> {
    if (expectation.landingUrl) {
      await page.goto(expectation.landingUrl, {
        waitUntil: 'domcontentloaded',
      });
    }

    await page
      .waitForLoadState('networkidle', {
        timeout: Math.min(expectation.timeoutMs ?? 8_000, 5_000),
      })
      .catch(() => undefined);

    const currentUrl = page.url();
    const loginFormVisible = await this.isAnyVisible(
      page,
      this.selectorProfile.auth.loginIndicators,
      500,
    );
    const challengeVisible = await this.isAnyVisible(
      page,
      this.selectorProfile.auth.challengeIndicators,
      500,
    );
    const accessDeniedVisible = await this.isAnyVisible(
      page,
      this.selectorProfile.auth.accessDeniedIndicators,
      500,
    );
    const expectedPageVisible = await this.isAnyVisible(
      page,
      expectation.expectedSelectors,
      expectation.timeoutMs ?? 8_000,
    );

    if (/login|nidlogin/i.test(currentUrl)) {
      return {
        status: 'LOGIN_REQUIRED',
        reason: 'LOGIN_REDIRECT',
        loginSessionStatus: 'LOGIN_REQUIRED',
        currentUrl,
        detail: 'The browser was redirected to the Naver login page.',
        expectedPageName: expectation.expectedPageName,
      };
    }

    if (challengeVisible) {
      return {
        status: 'CHALLENGE_REQUIRED',
        reason: 'CHALLENGE_REQUIRED',
        loginSessionStatus: 'CHALLENGE_REQUIRED',
        currentUrl,
        detail: 'CAPTCHA or MFA challenge is still visible.',
        expectedPageName: expectation.expectedPageName,
      };
    }

    if (loginFormVisible) {
      return {
        status: 'LOGIN_REQUIRED',
        reason: 'LOGIN_FORM_VISIBLE',
        loginSessionStatus: 'LOGIN_REQUIRED',
        currentUrl,
        detail: 'The Naver login form is visible instead of the Smart Store page.',
        expectedPageName: expectation.expectedPageName,
      };
    }

    if (
      accessDeniedVisible ||
      this.selectorProfile.auth.accessDeniedUrlPatterns.some((pattern) =>
        pattern.test(currentUrl),
      )
    ) {
      return {
        status: 'ACCESS_DENIED',
        reason: 'ACCESS_DENIED',
        loginSessionStatus: 'ACCESS_DENIED',
        currentUrl,
        detail: 'An access denied page is visible instead of the Smart Store page.',
        expectedPageName: expectation.expectedPageName,
      };
    }

    if (expectedPageVisible) {
      return {
        status: 'AUTHENTICATED',
        reason: null,
        loginSessionStatus: 'READY',
        currentUrl,
        detail: `${expectation.expectedPageName} is visible and ready.`,
        expectedPageName: expectation.expectedPageName,
      };
    }

    return {
      status: 'EXPECTED_PAGE_MISSING',
      reason: 'EXPECTED_PAGE_MISSING',
      loginSessionStatus: 'EXPIRED',
      currentUrl,
      detail: `${expectation.expectedPageName} did not expose the expected selectors.`,
      expectedPageName: expectation.expectedPageName,
    };
  }

  async assertAuthenticated(
    page: Page,
    expectation: SessionExpectation,
  ): Promise<SessionProbeResult> {
    const probe = await this.probe(page, expectation);

    if (probe.status === 'AUTHENTICATED') {
      return probe;
    }

    throw this.toRecoveryError(probe, expectation.storageStatePath);
  }

  async waitUntilAuthenticated(
    page: Page,
    expectation: SessionExpectation,
  ): Promise<SessionProbeResult> {
    const timeoutMs = expectation.timeoutMs ?? 10 * 60_000;
    const deadline = Date.now() + timeoutMs;
    let lastProbe: SessionProbeResult | null = null;

    while (Date.now() < deadline) {
      lastProbe = await this.probe(page, expectation).catch(() => null);

      if (lastProbe?.status === 'AUTHENTICATED') {
        return lastProbe;
      }

      await sleep(this.pollIntervalMs);
    }

    const timedOutSession = LoginSession.create({
      storageStatePath: expectation.storageStatePath,
      status: lastProbe?.loginSessionStatus ?? 'LOGIN_REQUIRED',
      lastErrorMessage: lastProbe?.detail,
    });

    throw new ManualLoginTimeoutError(
      [
        'Manual login session preparation timed out before the Smart Store page became ready.',
        lastProbe ? `Last observed state: ${lastProbe.detail}` : 'Last observed state: unknown.',
        `Recovery: run "npm run login:prepare" again and wait until ${expectation.expectedPageName} is visible.`,
      ].join('\n'),
      timedOutSession,
    );
  }

  private async isAnyVisible(
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

      await sleep(this.pollIntervalMs);
    }

    return false;
  }

  private toRecoveryError(
    probe: SessionProbeResult,
    storageStatePath: string,
  ): SessionRecoveryRequiredError {
    const session = LoginSession.create({
      storageStatePath,
      status: probe.loginSessionStatus,
      validatedAt: new Date().toISOString(),
      lastErrorMessage: probe.detail,
    });

    const recoveryLines = [
      probe.detail,
      `Current URL: ${probe.currentUrl}`,
      `Expected page: ${probe.expectedPageName}`,
      `Saved storageState path: ${storageStatePath}`,
      'Recovery:',
      '1. Run "npm run login:prepare".',
      '2. Log in to Naver Smart Store manually in the opened browser.',
      '3. Complete any CAPTCHA or MFA manually if prompted.',
      '4. Retry the failed action after the new session is saved.',
    ];

    if (probe.reason === 'EXPECTED_PAGE_MISSING') {
      recoveryLines.splice(
        4,
        0,
        'If the session still looks valid, review the selector profile or selector override config because the Smart Store DOM may have changed.',
      );
    }

    if (probe.reason === 'ACCESS_DENIED') {
      recoveryLines.splice(
        4,
        0,
        'If access is still denied after refreshing the session, verify seller-center permissions for this account.',
      );
    }

    return new SessionRecoveryRequiredError(
      probe.reason ?? 'EXPECTED_PAGE_MISSING',
      session,
      recoveryLines.join('\n'),
      'npm run login:prepare',
      probe,
    );
  }
}
