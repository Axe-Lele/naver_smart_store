import { describe, expect, it } from 'vitest';

import { classifySessionHealth } from '../packages/infrastructure-playwright/src/session/session-health-monitor.js';

describe('classifySessionHealth', () => {
  it('treats authenticated Smart Store URLs as a valid session even when product selectors are missing', () => {
    const result = classifySessionHealth({
      currentUrl: 'https://sell.smartstore.naver.com/#/products/origin-list',
      loginFormVisible: false,
      challengeVisible: false,
      accessDeniedVisible: false,
      authenticatedIndicatorVisible: false,
      authenticatedUrlMatched: true,
      expectedPageVisible: false,
      expectedPageName: 'Smart Store product list',
    });

    expect(result.status).toBe('AUTHENTICATED');
    expect(result.loginSessionStatus).toBe('READY');
  });

  it('still prefers explicit login redirects over authenticated-domain fallback', () => {
    const result = classifySessionHealth({
      currentUrl: 'https://nid.naver.com/nidlogin.login',
      loginFormVisible: false,
      challengeVisible: false,
      accessDeniedVisible: false,
      authenticatedIndicatorVisible: false,
      authenticatedUrlMatched: false,
      expectedPageVisible: false,
      expectedPageName: 'Smart Store product list',
    });

    expect(result.status).toBe('LOGIN_REQUIRED');
    expect(result.reason).toBe('LOGIN_REDIRECT');
  });
});
