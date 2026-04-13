import type { Locator, Page } from 'playwright';
import type pino from 'pino';

import type { AppConfig } from '../config/schema.js';
import { BasePage } from './base-page.js';
import { smartStoreSelectors } from './selectors.js';

export interface ProductSearchOutcome {
  state: 'FOUND' | 'NOT_FOUND' | 'UI_CHANGED';
  reason: string;
}

export class ProductListPage extends BasePage {
  constructor(page: Page, config: AppConfig, logger: pino.Logger) {
    super(page, config, logger);
  }

  async goto(): Promise<void> {
    await this.page.goto(this.config.productsUrl, {
      waitUntil: 'domcontentloaded',
    });
    await this.waitForSettled(500);
  }

  getReadySelectors(): readonly string[] {
    return [
      ...smartStoreSelectors.productList.searchInput,
      ...smartStoreSelectors.productList.pageIdentity,
    ];
  }

  async isReady(timeoutMs = 8_000): Promise<boolean> {
    return (
      (await this.findVisibleLocator(this.getReadySelectors(), timeoutMs)) !== null
    );
  }

  async search(productNo: string): Promise<ProductSearchOutcome> {
    const input = await this.fillFirst(
      smartStoreSelectors.productList.searchInput,
      productNo,
      8_000,
    );

    if (!input) {
      return {
        state: 'UI_CHANGED',
        reason: 'Product-number search input was not found.',
      };
    }

    const clicked = await this.clickFirst(
      smartStoreSelectors.productList.searchButton,
      3_000,
    );

    if (!clicked) {
      await input.press('Enter');
    }

    await this.waitForSettled(1_000);

    if (
      await this.isAnyVisible(
        smartStoreSelectors.productList.noResultIndicators,
        1_500,
      )
    ) {
      return {
        state: 'NOT_FOUND',
        reason: 'Search result explicitly reported no matching product.',
      };
    }

    const row = await this.findProductRow(productNo);
    if (row) {
      return {
        state: 'FOUND',
        reason: 'Matching product row found in search results.',
      };
    }

    if (
      await this.isAnyVisible(smartStoreSelectors.productList.searchInput, 1_000)
    ) {
      return {
        state: 'NOT_FOUND',
        reason: 'Search completed but no result row matched the product number.',
      };
    }

    return {
      state: 'UI_CHANGED',
      reason: 'Search completed but result rows could not be interpreted.',
    };
  }

  async openEdit(productNo: string): Promise<boolean> {
    const row = await this.findProductRow(productNo);
    if (!row) {
      return false;
    }

    const clicked =
      (await this.clickWithinRow(row, smartStoreSelectors.productList.editButtons)) ||
      (await this.clickWithinRow(row, smartStoreSelectors.productList.productLinks));

    if (!clicked) {
      return false;
    }

    await this.waitForSettled(800);
    return true;
  }

  private async findProductRow(productNo: string): Promise<Locator | null> {
    for (const selector of smartStoreSelectors.productList.resultRows) {
      const row = this.page.locator(selector).filter({ hasText: productNo }).first();
      const count = await row.count().catch(() => 0);

      if (count > 0) {
        return row;
      }
    }

    return null;
  }

  private async clickWithinRow(
    row: Locator,
    selectors: readonly string[],
  ): Promise<boolean> {
    for (const selector of selectors) {
      const target = row.locator(selector).first();
      const count = await target.count().catch(() => 0);
      const visible = await target.isVisible().catch(() => false);

      if (count > 0 && visible) {
        await target.click();
        return true;
      }
    }

    return false;
  }
}
