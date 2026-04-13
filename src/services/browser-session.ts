import type pino from 'pino';
import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
} from 'playwright';

import type { AppConfig } from '../config/schema.js';
import { FatalAutomationError } from '../domain/errors.js';
import {
  createInvalidStorageStateError,
  createMissingStorageStateError,
  resolveSessionLaunchMode,
} from './auth-session.js';
import { hasSavedStorageState } from './storage-state-store.js';

export interface BrowserSession {
  browser?: Browser;
  context: BrowserContext;
  initialPage: Page;
  close: () => Promise<void>;
}

export async function createBrowserSession(
  config: AppConfig,
  logger: pino.Logger,
): Promise<BrowserSession> {
  const launchOptions = {
    headless: config.headless,
    channel: config.chromeChannel,
    executablePath: config.executablePath,
    args: ['--disable-blink-features=AutomationControlled'],
  };

  const hasStorageState = await hasSavedStorageState(config.storageStatePath);
  const launchMode = resolveSessionLaunchMode({
    hasStorageState,
    loginMode: config.loginMode,
  });

  if (launchMode === 'storageState') {
    try {
      const browser = await chromium.launch(launchOptions);
      const context = await browser.newContext({
        storageState: config.storageStatePath,
        viewport: null,
      });
      context.setDefaultTimeout(config.timeoutMs);
      context.setDefaultNavigationTimeout(config.navigationTimeoutMs);

      const initialPage = await context.newPage();

      logger.info(
        { storageStatePath: config.storageStatePath },
        'Using saved storageState session.',
      );

      return {
        browser,
        context,
        initialPage,
        close: async () => browser.close(),
      };
    } catch (error) {
      logger.error(
        {
          storageStatePath: config.storageStatePath,
          error,
        },
        'Saved storageState could not be loaded.',
      );
      throw createInvalidStorageStateError(config.storageStatePath);
    }
  }

  if (launchMode === 'missing') {
    logger.error(
      { storageStatePath: config.storageStatePath },
      'Saved storageState file is missing.',
    );
    throw createMissingStorageStateError(config.storageStatePath);
  }

  if (launchMode === 'persistent') {
    const context = await chromium.launchPersistentContext(
      config.userDataDir,
      launchOptions,
    );
    context.setDefaultTimeout(config.timeoutMs);
    context.setDefaultNavigationTimeout(config.navigationTimeoutMs);

    const initialPage = context.pages()[0] ?? (await context.newPage());

    logger.info(
      {
        storageStatePath: config.storageStatePath,
        userDataDir: config.userDataDir,
      },
      'Saved storageState not found. Falling back to persistent Chrome context.',
    );

    return {
      context,
      initialPage,
      close: async () => context.close(),
    };
  }

  throw createMissingStorageStateError(config.storageStatePath);
}
