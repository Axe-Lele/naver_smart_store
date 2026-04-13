// File: packages/application/src/use-cases/load-products.use-case.ts
import type { Product } from '@smart-store/core';

import type { SessionGatewayPort } from '../ports/session-gateway.port.js';
import type { SettingsStorePort } from '../ports/settings-store.port.js';
import type { ProductQuery, SmartStoreAutomationPort } from '../ports/smartstore-automation.port.js';

export class LoadProductsUseCase {
  constructor(
    private readonly settingsStore: SettingsStorePort,
    private readonly sessionGateway: SessionGatewayPort,
    private readonly automationPort: SmartStoreAutomationPort,
  ) {}

  async execute(input?: { query?: ProductQuery }): Promise<readonly Product[]> {
    const settings = await this.settingsStore.loadSettings();
    const session = await this.sessionGateway.validateSession({ settings });

    return this.automationPort.loadProducts({
      settings,
      session,
      query: input?.query,
    });
  }
}
