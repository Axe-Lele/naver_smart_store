import type pino from 'pino';
import type { Locator, Page } from 'playwright';

import type { AppConfig } from '../config/schema.js';
import { sleep } from '../utils/time.js';
import { smartStoreSelectors } from './selectors.js';

export abstract class BasePage {
  constructor(
    protected readonly page: Page,
    protected readonly config: AppConfig,
    protected readonly logger: pino.Logger,
  ) {}

  protected async waitForSettled(extraDelayMs = 0): Promise<void> {
    try {
      await this.page.waitForLoadState('domcontentloaded', {
        timeout: Math.min(this.config.navigationTimeoutMs, 5_000),
      });
    } catch {}

    try {
      await this.page.waitForLoadState('networkidle', {
        timeout: Math.min(this.config.navigationTimeoutMs, 5_000),
      });
    } catch {}

    await this.waitForSpinnersToDisappear(3_000);

    if (extraDelayMs > 0) {
      await sleep(extraDelayMs);
    }
  }

  protected async waitForSpinnersToDisappear(timeoutMs: number): Promise<void> {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      let visibleSpinnerFound = false;

      for (const selector of smartStoreSelectors.common.loadingIndicators) {
        const locator = this.page.locator(selector).first();
        const isVisible = await locator.isVisible().catch(() => false);

        if (isVisible) {
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
    timeoutMs = this.config.timeoutMs,
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
    timeoutMs = this.config.timeoutMs,
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
    timeoutMs = this.config.timeoutMs,
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

        if (/\b(disabled|readonly|inactive)\b/i.test(nestedClassName)) {
          return true;
        }

        return false;
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
