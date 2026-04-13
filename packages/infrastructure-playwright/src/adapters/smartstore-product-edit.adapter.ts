// File: packages/infrastructure-playwright/src/adapters/smartstore-product-edit.adapter.ts
import { Product } from '@smart-store/core';
import type { Page } from 'playwright';

import type { ResolvedSelectorProfile } from '../config/selector-profile.js';
import { SmartStoreProductEditPage } from '../pages/smartstore-product-edit.page.js';
import { SessionHealthMonitor } from '../session/session-health-monitor.js';

export class SmartStoreProductEditAdapter {
  private readonly pageObject: SmartStoreProductEditPage;

  constructor(
    page: Page,
    selectorProfile: ResolvedSelectorProfile,
    private readonly sessionMonitor: SessionHealthMonitor,
  ) {
    this.pageObject = new SmartStoreProductEditPage(page, selectorProfile);
  }

  getReadySelectors(): readonly string[] {
    return this.pageObject.getReadySelectors();
  }

  async classifyCurrentProduct(
    productId: string,
    storageStatePath: string,
  ): Promise<Product> {
    const ready = await this.pageObject.isReady();

    if (!ready) {
      await this.sessionMonitor.assertAuthenticated(this.pageObject.rawPage, {
        expectedPageName: 'Smart Store product edit',
        expectedSelectors: this.pageObject.getReadySelectors(),
        storageStatePath,
      });
    }

    const decision = await this.pageObject.classify();

    return Product.create({
      id: productId,
      saleType: mapSaleType(decision.status),
      status: decision.status,
      reason: decision.reason,
      metadata: {
        classificationReason: decision.reason,
      },
    });
  }

  async convertToNormalProduct(): Promise<void> {
    await this.pageObject.convertToNormalProduct();
  }

  async readSaveUiSignal(): Promise<'TOAST' | 'BANNER' | null> {
    return this.pageObject.readSaveUiSignal();
  }
}

function mapSaleType(status: Product['status']): Product['saleType'] {
  if (status === 'EDITABLE_PREORDER' || status === 'LOCKED_BY_ORDER_PERIOD') {
    return 'PREORDER';
  }

  if (status === 'NOT_PREORDER') {
    return 'NORMAL';
  }

  return 'UNKNOWN';
}
