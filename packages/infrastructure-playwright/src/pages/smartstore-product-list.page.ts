// File: packages/infrastructure-playwright/src/pages/smartstore-product-list.page.ts
import type { Locator, Page } from 'playwright';

import type { ResolvedSelectorProfile } from '../config/selector-profile.js';
import { BasePlaywrightPage } from './base-playwright.page.js';

export interface ProductSearchOutcome {
  state: 'FOUND' | 'NOT_FOUND' | 'UI_CHANGED';
  reason: string;
}

interface VisibleRow {
  productId: string;
  name?: string;
  rawText: string;
}

export class SmartStoreProductListPage extends BasePlaywrightPage {
  constructor(
    page: Page,
    selectorProfile: ResolvedSelectorProfile,
  ) {
    super(page, selectorProfile);
  }

  async goto(productsUrl: string): Promise<void> {
    await this.navigate(productsUrl, 'domcontentloaded');
    await this.waitForSettled(500);
  }

  getReadySelectors(): readonly string[] {
    return [
      ...this.selectorProfile.productList.searchInput,
      ...this.selectorProfile.productList.pageIdentity,
    ];
  }

  async isReady(timeoutMs = 8_000): Promise<boolean> {
    return (await this.findVisibleLocator(this.getReadySelectors(), timeoutMs)) !== null;
  }

  async search(productId: string): Promise<ProductSearchOutcome> {
    const input = await this.fillFirst(
      this.selectorProfile.productList.searchInput,
      productId,
      8_000,
    );

    if (!input) {
      return {
        state: 'UI_CHANGED',
        reason: 'Product-number search input was not found.',
      };
    }

    const clicked = await this.clickFirst(
      this.selectorProfile.productList.searchButton,
      3_000,
    );

    if (!clicked) {
      await input.press('Enter');
    }

    await this.waitForSettled(1_000);

    if (
      await this.isAnyVisible(
        this.selectorProfile.productList.noResultIndicators,
        1_500,
      )
    ) {
      return {
        state: 'NOT_FOUND',
        reason: 'Search result explicitly reported no matching product.',
      };
    }

    const row = await this.findProductRow(productId);
    if (row) {
      return {
        state: 'FOUND',
        reason: 'Matching product row found in search results.',
      };
    }

    if (await this.isAnyVisible(this.selectorProfile.productList.searchInput, 1_000)) {
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

  async openEdit(productId: string): Promise<boolean> {
    const row = await this.findProductRow(productId);
    if (!row) {
      return false;
    }

    const clicked =
      (await this.clickWithinRow(row, this.selectorProfile.productList.editButtons)) ||
      (await this.clickWithinRow(row, this.selectorProfile.productList.productLinks));

    if (!clicked) {
      return false;
    }

    await this.waitForSettled(800);
    return true;
  }

  async collectVisibleRows(limit = 50, searchText?: string): Promise<readonly VisibleRow[]> {
    const rows: VisibleRow[] = [];
    const normalizedSearch = searchText?.trim().toLowerCase();

    for (const selector of this.selectorProfile.productList.resultRows) {
      const locator = this.page.locator(selector);
      const count = Math.min(await locator.count().catch(() => 0), limit * 3);

      for (let index = 0; index < count; index += 1) {
        if (rows.length >= limit) {
          return rows;
        }

        const row = locator.nth(index);
        const visible = await row.isVisible().catch(() => false);
        if (!visible) {
          continue;
        }

        const rawText = (await row.innerText().catch(() => '')).trim();
        if (!rawText) {
          continue;
        }

        if (normalizedSearch && !rawText.toLowerCase().includes(normalizedSearch)) {
          continue;
        }

        const productId = extractProductId(rawText);
        if (!productId || rows.some((item) => item.productId === productId)) {
          continue;
        }

        rows.push({
          productId,
          name: inferProductName(rawText, productId),
          rawText,
        });
      }

      if (rows.length > 0) {
        return rows.slice(0, limit);
      }
    }

    return rows;
  }

  private async findProductRow(productId: string): Promise<Locator | null> {
    for (const selector of this.selectorProfile.productList.resultRows) {
      const row = this.page.locator(selector).filter({ hasText: productId }).first();
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

function extractProductId(text: string): string | null {
  const match = text.match(/\b\d{6,}\b/);
  return match?.[0] ?? null;
}

function inferProductName(text: string, productId: string): string | undefined {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && line !== productId);

  return lines[0];
}
