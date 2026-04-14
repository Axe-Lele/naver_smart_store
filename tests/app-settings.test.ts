import { describe, expect, it } from 'vitest';

import {
  DEFAULT_SMARTSTORE_PRODUCTS_URL,
  parseAppSettings,
} from '../packages/application/src/settings/app-settings.js';

describe('parseAppSettings', () => {
  it('migrates legacy root Smart Store URL to the product list URL', () => {
    const settings = parseAppSettings({
      productsUrl: 'https://sell.smartstore.naver.com/',
      loginMode: 'storageState',
      storageStatePath: 'C:\\temp\\smartstore-storage-state.json',
      outputDir: 'C:\\temp\\output',
      headless: false,
      delayMs: 1500,
      concurrency: 1,
      consecutiveFailureLimit: 20,
      captureScreenshotOnFailure: true,
      captureHtmlOnFailure: true,
      selectorProfileId: 'smartstore-default',
    });

    expect(settings.productsUrl).toBe(DEFAULT_SMARTSTORE_PRODUCTS_URL);
  });
});
