import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { buildChromeLaunchArgs } from '../../apps/desktop-electron/src/main/chrome-launcher.js';

describe('buildChromeLaunchArgs', () => {
  it('opens seller center in regular Chrome without forcing a profile or extension', () => {
    const target = 'https://sell.smartstore.naver.com/#/products/origin-list';
    const args = buildChromeLaunchArgs(target);

    expect(args).toContain('--no-first-run');
    expect(args).toContain('--no-default-browser-check');
    expect(args.some((arg) => arg.startsWith('--user-data-dir='))).toBe(false);
    expect(args.some((arg) => arg.startsWith('--profile-directory='))).toBe(false);
    expect(args.some((arg) => arg.startsWith('--load-extension='))).toBe(false);
    expect(args.some((arg) => arg.startsWith('--disable-extensions-except='))).toBe(false);
    expect(args.some((arg) => arg.startsWith('--window-size='))).toBe(false);
    expect(args.some((arg) => arg.startsWith('--window-position='))).toBe(false);
    expect(args).toContain('--new-window');
    expect(args.at(-1)).toBe(target);
  });

  it('supports opening a compact dedicated-profile work window for seller-center automation', () => {
    const target = 'https://sell.smartstore.naver.com/#/products/origin-list';
    const executablePath = path.join(
      process.cwd(),
      '.playwright-browsers',
      'chromium-1217',
      'chrome-win64',
      'chrome.exe',
    );
    const userDataDir = path.join(process.cwd(), '.auth', 'chrome-profile');
    const extensionPath = path.join(process.cwd(), 'dist', 'apps', 'chrome-extension');
    const args = buildChromeLaunchArgs(target, {
      executablePath,
      keepBackgroundActive: true,
      userDataDir,
      profileDirectory: 'Default',
      extensionPath,
      restartExistingUserDataDir: true,
      windowSize: {
        width: 1000,
        height: 750,
      },
      windowPosition: {
        x: 896,
        y: 306,
      },
    });

    expect(args).toContain(`--user-data-dir=${path.resolve(userDataDir)}`);
    expect(args.some((arg) => arg.startsWith('--executablePath='))).toBe(false);
    expect(args).toContain('--profile-directory=Default');
    expect(args).not.toContain(`--disable-extensions-except=${path.resolve(extensionPath)}`);
    expect(args).toContain(`--load-extension=${path.resolve(extensionPath)}`);
    expect(args).toContain('--disable-background-timer-throttling');
    expect(args).toContain('--disable-renderer-backgrounding');
    expect(args).toContain('--disable-backgrounding-occluded-windows');
    expect(args).toContain(
      '--disable-features=CalculateNativeWinOcclusion,IntensiveWakeUpThrottling',
    );
    expect(args).toContain('--window-size=1000,750');
    expect(args).toContain('--window-position=896,306');
    expect(args).toContain('--new-window');
    expect(args.at(-1)).toBe(target);
  });

  it('keeps Chrome internal pages in the current Chrome session when requested', () => {
    const target = 'chrome://extensions';

    const args = buildChromeLaunchArgs(target, {
      newWindow: false,
    });

    expect(args).not.toContain('--new-window');
    expect(args.at(-1)).toBe(target);
  });

  it('loads an unpacked extension without disabling the rest of the profile by default', () => {
    const target = 'chrome://extensions';
    const userDataDir = path.join(process.cwd(), '.auth', 'chrome-profile');
    const extensionPath = path.join(process.cwd(), 'dist', 'apps', 'chrome-extension');

    const args = buildChromeLaunchArgs(target, {
      userDataDir,
      profileDirectory: 'Default',
      extensionPath,
    });

    expect(args).toContain(`--user-data-dir=${path.resolve(userDataDir)}`);
    expect(args).toContain('--profile-directory=Default');
    expect(args).not.toContain(`--disable-extensions-except=${path.resolve(extensionPath)}`);
    expect(args).toContain(`--load-extension=${path.resolve(extensionPath)}`);
  });

  it('can still disable other extensions for diagnostic launches', () => {
    const target = 'chrome://extensions';
    const extensionPath = path.join(process.cwd(), 'dist', 'apps', 'chrome-extension');

    const args = buildChromeLaunchArgs(target, {
      extensionPath,
      disableExtensionsExcept: true,
    });

    expect(args).toContain(`--disable-extensions-except=${path.resolve(extensionPath)}`);
    expect(args).toContain(`--load-extension=${path.resolve(extensionPath)}`);
  });
});
