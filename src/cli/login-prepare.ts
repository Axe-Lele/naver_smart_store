import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';

import { printCliError } from './shared.js';
import {
  readEnvironmentConfig,
  resolveStorageStatePath,
  resolveUserDataDir,
} from '../config/schema.js';
import { smartStoreSelectors } from '../pages/selectors.js';
import {
  assertSessionHealthy,
  buildLoginPrepareSuccessMessage,
} from '../services/auth-session.js';
import { saveStorageStateFile } from '../services/storage-state-store.js';
import { ensureDir } from '../utils/fs.js';

async function main(): Promise<void> {
  const env = readEnvironmentConfig();
  const storageStatePath = resolveStorageStatePath(env.SMARTSTORE_STORAGE_STATE_PATH);
  const userDataDir = resolveUserDataDir(env.SMARTSTORE_USER_DATA_DIR);
  const executablePath = env.SMARTSTORE_EXECUTABLE_PATH
    ? path.resolve(process.cwd(), env.SMARTSTORE_EXECUTABLE_PATH)
    : undefined;
  const chromeChannel =
    executablePath && env.SMARTSTORE_CHROME_CHANNEL === 'chrome'
      ? undefined
      : env.SMARTSTORE_CHROME_CHANNEL;
  const launchOptions = {
    headless: false,
    channel: chromeChannel,
    executablePath,
    args: ['--disable-blink-features=AutomationControlled'],
  };

  let browser: Browser | undefined;
  let context: BrowserContext | undefined;

  try {
    if (env.SMARTSTORE_LOGIN_MODE === 'persistent') {
      await ensureDir(userDataDir);
      context = await chromium.launchPersistentContext(userDataDir, launchOptions);
    } else {
      browser = await chromium.launch(launchOptions);
      context = await browser.newContext({
        viewport: null,
      });
    }

    context.setDefaultTimeout(env.SMARTSTORE_TIMEOUT_MS);
    context.setDefaultNavigationTimeout(env.SMARTSTORE_NAVIGATION_TIMEOUT_MS);

    const page = context.pages()[0] ?? (await context.newPage());
    await page.goto(env.SMARTSTORE_PRODUCTS_URL, {
      waitUntil: 'domcontentloaded',
    });

    printInstructions(env.SMARTSTORE_LOGIN_MODE, storageStatePath, userDataDir);
    await waitForManualConfirmation();
    await verifyLoggedIn(page, env.SMARTSTORE_PRODUCTS_URL, storageStatePath);

    await saveStorageStateFile(context, storageStatePath);

    console.log(`[login:prepare] session verified at ${page.url()}`);
    console.log(buildLoginPrepareSuccessMessage(storageStatePath));

    if (env.SMARTSTORE_LOGIN_MODE === 'persistent') {
      console.log(`[login:prepare] persistent profile ready: ${userDataDir}`);
    }
  } finally {
    await context?.close().catch(() => undefined);
    await browser?.close().catch(() => undefined);
  }
}

function printInstructions(
  loginMode: 'storageState' | 'persistent',
  storageStatePath?: string,
  userDataDir?: string,
): void {
  console.log('');
  console.log('[login:prepare]');
  console.log(`mode: ${loginMode}`);
  console.log(
    'A browser window is open. Log in to Naver/Smart Store yourself, complete any CAPTCHA or MFA manually, then return here.',
  );
  console.log(`storageState will be saved to: ${storageStatePath}`);

  if (loginMode === 'persistent') {
    console.log(`persistent profile directory: ${userDataDir}`);
  }

  console.log('');
}

async function waitForManualConfirmation(): Promise<void> {
  const readline = createInterface({ input, output });

  try {
    await readline.question(
      'Press Enter after seller center is fully open and you are logged in: ',
    );
  } finally {
    readline.close();
  }
}

async function verifyLoggedIn(
  page: Page,
  productsUrl: string,
  storageStatePath: string,
): Promise<void> {
  await assertSessionHealthy(page, {
    storageStatePath,
    landingUrl: productsUrl,
    timeoutMs: 10_000,
    expectedPageName: 'Smart Store product list page',
    expectedSelectors: [
      ...smartStoreSelectors.productList.searchInput,
      ...smartStoreSelectors.productList.pageIdentity,
    ],
  });
}

await main().catch((error) => {
  printCliError(error);
  process.exitCode = 1;
});
