// File: packages/infrastructure-playwright/src/errors/playwright-infrastructure.error.ts
import type { LoginSession, LoginSessionStatus } from '@smart-store/core';

export type SessionFailureReason =
  | 'STORAGE_STATE_MISSING'
  | 'STORAGE_STATE_INVALID'
  | 'MANUAL_WINDOW_CLOSED'
  | 'LOGIN_REDIRECT'
  | 'LOGIN_FORM_VISIBLE'
  | 'CHALLENGE_REQUIRED'
  | 'ACCESS_DENIED'
  | 'EXPECTED_PAGE_MISSING';

export type SessionProbeStatus =
  | 'AUTHENTICATED'
  | 'LOGIN_REQUIRED'
  | 'CHALLENGE_REQUIRED'
  | 'ACCESS_DENIED'
  | 'EXPECTED_PAGE_MISSING';

export interface SessionProbeResult {
  status: SessionProbeStatus;
  reason: SessionFailureReason | null;
  loginSessionStatus: LoginSessionStatus;
  currentUrl: string;
  detail: string;
  expectedPageName: string;
}

export class PlaywrightInfrastructureError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'PlaywrightInfrastructureError';
  }
}

export class SelectorProfileNotFoundError extends PlaywrightInfrastructureError {
  constructor(profileId: string) {
    super(
      'SELECTOR_PROFILE_NOT_FOUND',
      `Selector profile was not found: ${profileId}`,
    );
    this.name = 'SelectorProfileNotFoundError';
  }
}

export class SessionRecoveryRequiredError extends PlaywrightInfrastructureError {
  constructor(
    public readonly reason: SessionFailureReason,
    public readonly session: LoginSession,
    message: string,
    public readonly recoveryCommand = 'npm run login:prepare',
    public readonly probe?: SessionProbeResult,
  ) {
    super('SESSION_RECOVERY_REQUIRED', message);
    this.name = 'SessionRecoveryRequiredError';
  }
}

export class ManualLoginTimeoutError extends PlaywrightInfrastructureError {
  constructor(
    message: string,
    public readonly session?: LoginSession,
    public readonly recoveryCommand = 'npm run login:prepare',
  ) {
    super('MANUAL_LOGIN_TIMEOUT', message);
    this.name = 'ManualLoginTimeoutError';
  }
}

export class ManualLoginWindowClosedError extends PlaywrightInfrastructureError {
  constructor(
    message: string,
    public readonly session?: LoginSession,
    public readonly recoveryCommand = 'npm run login:prepare',
  ) {
    super('MANUAL_LOGIN_WINDOW_CLOSED', message);
    this.name = 'ManualLoginWindowClosedError';
  }
}
