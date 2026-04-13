import { describe, expect, it } from 'vitest';

import {
  buildExpiredStorageStateMessage,
  buildMissingStorageStateMessage,
  classifySessionHealth,
  resolveSessionLaunchMode,
} from '../src/services/auth-session.js';

describe('resolveSessionLaunchMode', () => {
  it('prefers storageState when a saved session file exists', () => {
    expect(
      resolveSessionLaunchMode({
        hasStorageState: true,
        loginMode: 'persistent',
      }),
    ).toBe('storageState');
  });

  it('falls back to persistent mode when no storageState file exists', () => {
    expect(
      resolveSessionLaunchMode({
        hasStorageState: false,
        loginMode: 'persistent',
      }),
    ).toBe('persistent');
  });

  it('marks storageState mode as missing when the saved session file does not exist', () => {
    expect(
      resolveSessionLaunchMode({
        hasStorageState: false,
        loginMode: 'storageState',
      }),
    ).toBe('missing');
  });
});

describe('classifySessionHealth', () => {
  it('detects login redirects', () => {
    const result = classifySessionHealth({
      currentUrl: 'https://nid.naver.com/nidlogin.login',
      loginFormVisible: false,
      challengeVisible: false,
      accessDeniedVisible: false,
      expectedPageVisible: false,
      expectedPageName: 'Smart Store product list page',
    });

    expect(result.status).toBe('LOGIN_REQUIRED');
    expect(result.reason).toBe('LOGIN_REDIRECT');
  });

  it('detects explicit access denied pages', () => {
    const result = classifySessionHealth({
      currentUrl: 'https://sell.smartstore.naver.com/forbidden',
      loginFormVisible: false,
      challengeVisible: false,
      accessDeniedVisible: true,
      expectedPageVisible: false,
      expectedPageName: 'Smart Store product list page',
    });

    expect(result.status).toBe('ACCESS_DENIED');
    expect(result.reason).toBe('ACCESS_DENIED');
  });

  it('detects missing core page selectors as a session-health problem', () => {
    const result = classifySessionHealth({
      currentUrl: 'https://sell.smartstore.naver.com/products',
      loginFormVisible: false,
      challengeVisible: false,
      accessDeniedVisible: false,
      expectedPageVisible: false,
      expectedPageName: 'Smart Store product edit page',
    });

    expect(result.status).toBe('EXPECTED_PAGE_MISSING');
    expect(result.reason).toBe('EXPECTED_PAGE_MISSING');
  });

  it('treats expected selectors as an authenticated page', () => {
    const result = classifySessionHealth({
      currentUrl: 'https://sell.smartstore.naver.com/products',
      loginFormVisible: false,
      challengeVisible: false,
      accessDeniedVisible: false,
      expectedPageVisible: true,
      expectedPageName: 'Smart Store product list page',
    });

    expect(result.status).toBe('AUTHENTICATED');
    expect(result.reason).toBeNull();
  });
});

describe('storageState guidance messages', () => {
  it('includes recovery guidance for missing storageState files', () => {
    const message = buildMissingStorageStateMessage(
      'C:\\smart-store\\.auth\\smartstore-storage-state.json',
    );

    expect(message).toContain('Saved storageState file was not found');
    expect(message).toContain('npm run login:prepare');
  });

  it('includes refresh guidance for expired storageState files', () => {
    const message = buildExpiredStorageStateMessage(
      'C:\\smart-store\\.auth\\smartstore-storage-state.json',
    );

    expect(message).toContain('expired');
    expect(message).toContain('npm run login:prepare');
  });
});
