import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

import { describe, expect, it } from 'vitest';

import {
  buildChromeLaunchArgs,
  resolveBundledAutomationBrowserExecutablePath,
} from '../../apps/desktop-electron/src/main/chrome-launcher.js';

describe('buildChromeLaunchArgs', () => {
  it('opens seller center in a dedicated automation browser profile with the bundled extension loaded', () => {
    const target = 'https://sell.smartstore.naver.com/#/products/origin-list';
    const userDataDir = path.join(process.cwd(), '.auth', 'automation-browser-profile');
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
    const userDataDir = path.join(process.cwd(), '.auth', 'automation-browser-profile');
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

describe('resolveBundledAutomationBrowserExecutablePath', () => {
  it('finds the bundled Playwright Chromium executable', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'smart-store-browser-'));
    const executablePath = path.join(
      tempRoot,
      'chromium-1217',
      'chrome-win64',
      'chrome.exe',
    );

    try {
      fs.mkdirSync(path.dirname(executablePath), { recursive: true });
      fs.writeFileSync(executablePath, '');

      expect(resolveBundledAutomationBrowserExecutablePath(tempRoot)).toBe(
        path.resolve(executablePath),
      );
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('returns null when the bundled browser runtime is missing', () => {
    const tempRoot = path.join(
      os.tmpdir(),
      `smart-store-missing-browser-${Date.now()}`,
    );

    expect(resolveBundledAutomationBrowserExecutablePath(tempRoot)).toBeNull();
  });
});
