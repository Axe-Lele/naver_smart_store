import type { ProductStatus } from './types.js';

export type FatalAutomationCode =
  | 'AUTH_REQUIRED'
  | 'CAPTCHA_OR_MFA_REQUIRED'
  | 'SESSION_INVALID'
  | 'ACCESS_DENIED';

export type SessionFailureReason =
  | 'STORAGE_STATE_MISSING'
  | 'STORAGE_STATE_INVALID'
  | 'LOGIN_REDIRECT'
  | 'LOGIN_FORM_VISIBLE'
  | 'CHALLENGE_REQUIRED'
  | 'ACCESS_DENIED'
  | 'EXPECTED_PAGE_MISSING';

export class ClassifiedAutomationError extends Error {
  constructor(
    public readonly status: ProductStatus,
    message: string,
  ) {
    super(message);
    this.name = 'ClassifiedAutomationError';
  }
}

export class FatalAutomationError extends Error {
  constructor(
    public readonly code: FatalAutomationCode,
    message: string,
  ) {
    super(message);
    this.name = 'FatalAutomationError';
  }
}

export class SessionRecoveryRequiredError extends FatalAutomationError {
  constructor(
    public readonly reason: SessionFailureReason,
    message: string,
    public readonly recoveryCommand = 'npm run login:prepare',
  ) {
    super(mapSessionFailureReasonToCode(reason), message);
    this.name = 'SessionRecoveryRequiredError';
  }
}

function mapSessionFailureReasonToCode(
  reason: SessionFailureReason,
): FatalAutomationCode {
  switch (reason) {
    case 'CHALLENGE_REQUIRED':
      return 'CAPTCHA_OR_MFA_REQUIRED';
    case 'ACCESS_DENIED':
      return 'ACCESS_DENIED';
    case 'STORAGE_STATE_INVALID':
    case 'EXPECTED_PAGE_MISSING':
      return 'SESSION_INVALID';
    case 'STORAGE_STATE_MISSING':
    case 'LOGIN_REDIRECT':
    case 'LOGIN_FORM_VISIBLE':
      return 'AUTH_REQUIRED';
  }
}
