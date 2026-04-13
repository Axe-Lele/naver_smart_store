// File: packages/infrastructure-playwright/src/adapters/smartstore-product-list.adapter.ts
import { Product } from '@smart-store/core';
import type { Page } from 'playwright';

import type { ProductQuery } from '@smart-store/application';

import type { ResolvedSelectorProfile } from '../config/selector-profile.js';
import { SessionHealthMonitor } from '../session/session-health-monitor.js';
import { SmartStoreProductListPage, type ProductSearchOutcome } from '../pages/smartstore-product-list.page.js';

export class SmartStoreProductListAdapter {
  private readonly pageObject: SmartStoreProductListPage;

  constructor(
    page: Page,
    selectorProfile: ResolvedSelectorProfile,
    private readonly sessionMonitor: SessionHealthMonitor,
  ) {
    this.pageObject = new SmartStoreProductListPage(page, selectorProfile);
  }

  getReadySelectors(): readonly string[] {
    return this.pageObject.getReadySelectors();
  }

  async ensureReady(productsUrl: string, storageStatePath: string): Promise<void> {
    await this.pageObject.goto(productsUrl);

    if (!(await this.pageObject.isReady())) {
      await this.sessionMonitor.assertAuthenticated(this.pageObject.rawPage, {
        expectedPageName: 'Smart Store product list',
        expectedSelectors: this.pageObject.getReadySelectors(),
        storageStatePath,
      });
    }
  }

  async loadVisibleProducts(
    productsUrl: string,
    storageStatePath: string,
    query?: ProductQuery,
  ): Promise<readonly Product[]> {
    await this.ensureReady(productsUrl, storageStatePath);

    const rows = await this.pageObject.collectVisibleRows(
      query?.limit ?? 50,
      query?.searchText,
    );
    let products = rows.map((row) =>
      Product.create({
        id: row.productId,
        name: row.name,
        saleType: 'UNKNOWN',
        status: 'UNCLASSIFIED',
        metadata: {
          listRowText: row.rawText,
        },
      }),
    );

    if (query?.statuses?.length) {
      const allowed = new Set(query.statuses);
      products = products.filter((product) => allowed.has(product.status));
    }

    return products;
  }

  async searchAndOpenEdit(
    productsUrl: string,
    storageStatePath: string,
    productId: string,
  ): Promise<ProductSearchOutcome> {
    await this.ensureReady(productsUrl, storageStatePath);

    const searchOutcome = await this.pageObject.search(productId);
    if (searchOutcome.state !== 'FOUND') {
      return searchOutcome;
    }

    const opened = await this.pageObject.openEdit(productId);
    if (!opened) {
      return {
        state: 'UI_CHANGED',
        reason: 'The product row was found, but the edit action could not be opened.',
      };
    }

    return searchOutcome;
  }
}
