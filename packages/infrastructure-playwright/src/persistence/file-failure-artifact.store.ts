// File: packages/infrastructure-playwright/src/persistence/file-failure-artifact.store.ts
import path from 'node:path';

import { FailureArtifact, type ProductStatus } from '@smart-store/core';
import type { AppSettings } from '@smart-store/application';
import type { Page } from 'playwright';

import { ensureDir, sanitizeFileSegment, writeTextFile } from '../utils/fs.js';
import { timestampForFile } from '../utils/time.js';

export interface CaptureFailureArtifactInput {
  settings: AppSettings;
  jobId?: string;
  productId: string;
  status: ProductStatus;
  failureLabel?: string;
}

export class FileFailureArtifactStore {
  async capturePage(
    page: Page,
    input: CaptureFailureArtifactInput,
  ): Promise<FailureArtifact | undefined> {
    if (
      !input.settings.captureScreenshotOnFailure &&
      !input.settings.captureHtmlOnFailure
    ) {
      return undefined;
    }

    const screenshotsDir = path.join(input.settings.outputDir, 'screenshots');
    const htmlDir = path.join(input.settings.outputDir, 'html');
    const stem = [
      timestampForFile(),
      input.jobId ? sanitizeFileSegment(input.jobId) : undefined,
      sanitizeFileSegment(input.productId),
      sanitizeFileSegment(input.status.toLowerCase()),
      input.failureLabel ? sanitizeFileSegment(input.failureLabel) : undefined,
    ]
      .filter(Boolean)
      .join('_');

    let screenshotPath: string | undefined;
    let htmlPath: string | undefined;

    if (input.settings.captureScreenshotOnFailure) {
      await ensureDir(screenshotsDir);
      screenshotPath = path.join(screenshotsDir, `${stem}.png`);
      await page.screenshot({
        path: screenshotPath,
        fullPage: true,
      });
    }

    if (input.settings.captureHtmlOnFailure) {
      await ensureDir(htmlDir);
      htmlPath = path.join(htmlDir, `${stem}.html`);
      await writeTextFile(htmlPath, await page.content());
    }

    return FailureArtifact.create({
      screenshotPath,
      htmlPath,
      capturedAt: new Date().toISOString(),
    });
  }
}
