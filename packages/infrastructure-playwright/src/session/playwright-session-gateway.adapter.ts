// File: packages/infrastructure-playwright/src/session/playwright-session-gateway.adapter.ts
import type {
  PrepareLoginSessionCommand,
  SessionGatewayPort,
  ValidateLoginSessionQuery,
} from '@smart-store/application';
import type { LoginSession } from '@smart-store/core';

import { SelectorProfileRegistry } from '../config/selector-profile.registry.js';
import { PlaywrightBrowserSessionAdapter } from './playwright-browser-session.adapter.js';
import { SessionHealthMonitor } from './session-health-monitor.js';
import { FileStorageStateRepository } from './storage-state.repository.js';

export interface PlaywrightSessionGatewayAdapterOptions {
  manualLoginTimeoutMs?: number;
}

export class PlaywrightSessionGatewayAdapter implements SessionGatewayPort {
  private readonly manualLoginTimeoutMs: number;

  constructor(
    private readonly browserSessionAdapter = new PlaywrightBrowserSessionAdapter(),
    private readonly storageStateRepository = new FileStorageStateRepository(),
    private readonly selectorProfiles = new SelectorProfileRegistry(),
    options: PlaywrightSessionGatewayAdapterOptions = {},
  ) {
    this.manualLoginTimeoutMs = options.manualLoginTimeoutMs ?? 10 * 60_000;
  }

  async prepareManualSession(command: PrepareLoginSessionCommand): Promise<LoginSession> {
    const selectorProfile = await this.selectorProfiles.getResolved({
      profileId: command.settings.selectorProfileId,
      selectorConfigPath: command.settings.selectorConfigPath,
    });
    const monitor = new SessionHealthMonitor(selectorProfile);
    const browserSession = await this.browserSessionAdapter.openForManualLogin(
      command.settings,
    );

    try {
      await browserSession.page.goto(command.settings.productsUrl, {
        waitUntil: 'domcontentloaded',
      });

      await monitor.waitUntilAuthenticated(browserSession.page, {
        expectedPageName: 'Smart Store product list',
        expectedSelectors: [
          ...selectorProfile.productList.searchInput,
          ...selectorProfile.productList.pageIdentity,
        ],
        storageStatePath: command.settings.storageStatePath,
        timeoutMs: this.manualLoginTimeoutMs,
      });

      return this.storageStateRepository.save(
        browserSession.context,
        command.settings.storageStatePath,
      );
    } finally {
      await browserSession.close();
    }
  }

  async validateSession(query: ValidateLoginSessionQuery): Promise<LoginSession> {
    const selectorProfile = await this.selectorProfiles.getResolved({
      profileId: query.settings.selectorProfileId,
      selectorConfigPath: query.settings.selectorConfigPath,
    });
    const browserSession = await this.browserSessionAdapter.openForAutomation(
      query.settings,
    );
    const monitor = new SessionHealthMonitor(selectorProfile);

    try {
      await monitor.assertAuthenticated(browserSession.page, {
        landingUrl: query.settings.productsUrl,
        expectedPageName: 'Smart Store product list',
        expectedSelectors: [
          ...selectorProfile.productList.searchInput,
          ...selectorProfile.productList.pageIdentity,
        ],
        storageStatePath: query.settings.storageStatePath,
      });

      const savedSession = await this.storageStateRepository.save(
        browserSession.context,
        query.settings.storageStatePath,
      );

      return savedSession.markValidated();
    } finally {
      await browserSession.close();
    }
  }
}
