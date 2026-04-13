// File: packages/infrastructure-playwright/src/pages/base-playwright.page.ts
import type { Locator, Page } from 'playwright';

import type { ResolvedSelectorProfile } from '../config/selector-profile.js';
import { sleep } from '../utils/time.js';

export interface BasePlaywrightPageOptions {
  defaultTimeoutMs?: number;
  navigationTimeoutMs?: number;
}

export abstract class BasePlaywrightPage {
  protected readonly defaultTimeoutMs: number;

  protected readonly navigationTimeoutMs: number;

  constructor(
    protected readonly page: Page,
    protected readonly selectorProfile: ResolvedSelectorProfile,
    options: BasePlaywrightPageOptions = {},
  ) {
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? 10_000;
    this.navigationTimeoutMs = options.navigationTimeoutMs ?? 15_000;
  }

  get rawPage(): Page {
    return this.page;
  }

  protected async waitForSettled(extraDelayMs = 0): Promise<void> {
    await this.page
      .waitForLoadState('domcontentloaded', {
        timeout: Math.min(this.navigationTimeoutMs, 5_000),
      })
      .catch(() => undefined);
    await this.page
      .waitForLoadState('networkidle', {
        timeout: Math.min(this.navigationTimeoutMs, 5_000),
      })
      .catch(() => undefined);
    await this.waitForSpinnersToDisappear(3_000);

    if (extraDelayMs > 0) {
      await sleep(extraDelayMs);
    }
  }

  protected async waitForSpinnersToDisappear(timeoutMs: number): Promise<void> {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      let visibleSpinnerFound = false;

      for (const selector of this.selectorProfile.common.loadingIndicators) {
        const locator = this.page.locator(selector).first();
        const visible = await locator.isVisible().catch(() => false);

        if (visible) {
          visibleSpinnerFound = true;
          break;
        }
      }

      if (!visibleSpinnerFound) {
        return;
      }

      await sleep(200);
    }
  }

  protected async findVisibleLocator(
    selectors: readonly string[],
    timeoutMs = this.defaultTimeoutMs,
  ): Promise<Locator | null> {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      for (const selector of selectors) {
        const locator = this.page.locator(selector).first();
        const visible = await locator.isVisible().catch(() => false);

        if (visible) {
          return locator;
        }
      }

      await sleep(200);
    }

    return null;
  }

  protected async isAnyVisible(
    selectors: readonly string[],
    timeoutMs = 1_000,
  ): Promise<boolean> {
    return (await this.findVisibleLocator(selectors, timeoutMs)) !== null;
  }

  protected async clickFirst(
    selectors: readonly string[],
    timeoutMs = this.defaultTimeoutMs,
  ): Promise<boolean> {
    const locator = await this.findVisibleLocator(selectors, timeoutMs);

    if (!locator) {
      return false;
    }

    await locator.click();
    return true;
  }

  protected async fillFirst(
    selectors: readonly string[],
    value: string,
    timeoutMs = this.defaultTimeoutMs,
  ): Promise<Locator | null> {
    const locator = await this.findVisibleLocator(selectors, timeoutMs);

    if (!locator) {
      return null;
    }

    await locator.fill('');
    await locator.fill(value);
    return locator;
  }

  protected async isLocatorDisabled(locator: Locator | null): Promise<boolean> {
    if (!locator) {
      return false;
    }

    const directDisabled = await locator.isDisabled().catch(() => false);
    if (directDisabled) {
      return true;
    }

    return locator
      .evaluate((element) => {
        const htmlElement = element as HTMLElement;
        const inputElement = element as HTMLInputElement;
        const className =
          typeof htmlElement.className === 'string' ? htmlElement.className : '';

        if (inputElement.disabled) {
          return true;
        }

        if (element.getAttribute('aria-disabled') === 'true') {
          return true;
        }

        if (/\b(disabled|readonly|inactive)\b/i.test(className)) {
          return true;
        }

        const nestedControl = element.querySelector(
          'input, button, select, [role="radio"], [role="option"]',
        );

        if (
          (nestedControl instanceof HTMLInputElement ||
            nestedControl instanceof HTMLButtonElement ||
            nestedControl instanceof HTMLSelectElement ||
            nestedControl instanceof HTMLTextAreaElement) &&
          nestedControl.disabled
        ) {
          return true;
        }

        if (nestedControl?.getAttribute('aria-disabled') === 'true') {
          return true;
        }

        const nestedClassName =
          nestedControl && 'className' in nestedControl
            ? String(nestedControl.className ?? '')
            : '';

        return /\b(disabled|readonly|inactive)\b/i.test(nestedClassName);
      })
      .catch(() => false);
  }

  protected async getText(locator: Locator | null): Promise<string> {
    if (!locator) {
      return '';
    }

    return (await locator.innerText().catch(() => '')).trim();
  }
}
