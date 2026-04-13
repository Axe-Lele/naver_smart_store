// File: packages/infrastructure-playwright/src/session/playwright-browser-session.adapter.ts
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';

import type { AppSettings } from '@smart-store/application';
import { LoginSession } from '@smart-store/core';

import { SessionRecoveryRequiredError } from '../errors/playwright-infrastructure.error.js';
import { FileStorageStateRepository } from './storage-state.repository.js';

export type BrowserLaunchMode = 'storageState' | 'persistent' | 'manual';

export interface ManagedBrowserSession {
  readonly browser?: Browser;
  readonly context: BrowserContext;
  readonly page: Page;
  readonly launchMode: BrowserLaunchMode;
  close(): Promise<void>;
}

export interface PlaywrightBrowserSessionAdapterOptions {
  defaultTimeoutMs?: number;
  defaultNavigationTimeoutMs?: number;
  launchArgs?: readonly string[];
}

export class PlaywrightBrowserSessionAdapter {
  private readonly defaultTimeoutMs: number;

  private readonly defaultNavigationTimeoutMs: number;

  private readonly launchArgs: readonly string[];

  constructor(
    private readonly storageStateRepository = new FileStorageStateRepository(),
    options: PlaywrightBrowserSessionAdapterOptions = {},
  ) {
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? 10_000;
    this.defaultNavigationTimeoutMs = options.defaultNavigationTimeoutMs ?? 15_000;
    this.launchArgs = options.launchArgs ?? ['--disable-blink-features=AutomationControlled'];
  }

  async openForManualLogin(settings: AppSettings): Promise<ManagedBrowserSession> {
    const browser = await chromium.launch({
      headless: false,
      args: [...this.launchArgs],
    });
    const context = await browser.newContext({
      viewport: null,
    });
    this.applyTimeouts(context);
    const page = await context.newPage();

    return {
      browser,
      context,
      page,
      launchMode: 'manual',
      close: async () => browser.close(),
    };
  }

  async openForAutomation(settings: AppSettings): Promise<ManagedBrowserSession> {
    const knownSession = await this.storageStateRepository.loadKnownSession(
      settings.storageStatePath,
    );

    if (knownSession.status !== 'MISSING') {
      try {
        await this.storageStateRepository.assertReadable(settings.storageStatePath);

        const browser = await chromium.launch({
          headless: settings.headless,
          args: [...this.launchArgs],
        });
        const context = await browser.newContext({
          storageState: settings.storageStatePath,
          viewport: null,
        });
        this.applyTimeouts(context);
        const page = await context.newPage();

        return {
          browser,
          context,
          page,
          launchMode: 'storageState',
          close: async () => browser.close(),
        };
      } catch (error) {
        const invalidSession = LoginSession.create({
          storageStatePath: settings.storageStatePath,
          status: 'INVALID',
          lastErrorMessage: error instanceof Error ? error.message : String(error),
        });

        throw new SessionRecoveryRequiredError(
          'STORAGE_STATE_INVALID',
          invalidSession,
          [
            `Saved storageState could not be loaded: ${settings.storageStatePath}`,
            'Recovery:',
            '1. Run "npm run login:prepare".',
            '2. Log in to Naver Smart Store manually in the opened browser.',
            '3. Retry the batch after a new session is saved.',
          ].join('\n'),
        );
      }
    }

    if (settings.loginMode === 'persistent' && settings.userDataDir) {
      const context = await chromium.launchPersistentContext(settings.userDataDir, {
        headless: settings.headless,
        args: [...this.launchArgs],
        viewport: null,
      });
      this.applyTimeouts(context);
      const page = context.pages()[0] ?? (await context.newPage());

      return {
        context,
        page,
        launchMode: 'persistent',
        close: async () => context.close(),
      };
    }

    throw new SessionRecoveryRequiredError(
      'STORAGE_STATE_MISSING',
      knownSession,
      [
        `Saved storageState file was not found: ${settings.storageStatePath}`,
        'Recovery:',
        '1. Run "npm run login:prepare".',
        '2. Complete the Smart Store login manually.',
        '3. Retry after the new storageState file is saved.',
      ].join('\n'),
    );
  }

  private applyTimeouts(context: BrowserContext): void {
    context.setDefaultTimeout(this.defaultTimeoutMs);
    context.setDefaultNavigationTimeout(this.defaultNavigationTimeoutMs);
  }
}
