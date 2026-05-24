import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { buildChromeLaunchArgs } from '../../apps/desktop-electron/src/main/chrome-launcher.js';

describe('buildChromeLaunchArgs', () => {
  it('opens seller center in a dedicated Chrome profile with the bundled extension loaded', () => {
    const target = 'https://sell.smartstore.naver.com/#/products/origin-list';
    const userDataDir = path.join(process.cwd(), '.auth', 'chrome-profile');
    const extensionPath = path.join(process.cwd(), 'dist', 'apps', 'chrome-extension');

    const args = buildChromeLaunchArgs(target, {
      userDataDir,
      profileDirectory: 'Default',
      extensionPath,
    });

    expect(args).toContain('--no-first-run');
    expect(args).toContain('--no-default-browser-check');
    expect(args).toContain(`--user-data-dir=${path.resolve(userDataDir)}`);
    expect(args).toContain('--profile-directory=Default');
    expect(args).toContain(`--disable-extensions-except=${path.resolve(extensionPath)}`);
    expect(args).toContain(`--load-extension=${path.resolve(extensionPath)}`);
    expect(args).toContain('--new-window');
    expect(args.at(-1)).toBe(target);
  });

  it('keeps Chrome internal pages inside the dedicated profile', () => {
    const target = 'chrome://extensions';
    const userDataDir = path.join(process.cwd(), '.auth', 'chrome-profile');
    const extensionPath = path.join(process.cwd(), 'dist', 'apps', 'chrome-extension');

    const args = buildChromeLaunchArgs(target, {
      newWindow: false,
      userDataDir,
      profileDirectory: 'Default',
      extensionPath,
    });

    expect(args).toContain(`--user-data-dir=${path.resolve(userDataDir)}`);
    expect(args).toContain('--profile-directory=Default');
    expect(args).toContain(`--disable-extensions-except=${path.resolve(extensionPath)}`);
    expect(args).toContain(`--load-extension=${path.resolve(extensionPath)}`);
    expect(args).not.toContain('--new-window');
    expect(args.at(-1)).toBe(target);
  });
});
