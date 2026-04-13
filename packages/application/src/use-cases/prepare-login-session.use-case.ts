// File: packages/application/src/use-cases/prepare-login-session.use-case.ts
import type { LoginSession } from '@smart-store/core';

import type { SessionGatewayPort } from '../ports/session-gateway.port.js';
import type { SettingsStorePort } from '../ports/settings-store.port.js';

export class PrepareLoginSessionUseCase {
  constructor(
    private readonly settingsStore: SettingsStorePort,
    private readonly sessionGateway: SessionGatewayPort,
  ) {}

  async execute(input?: { initiatedBy?: string }): Promise<LoginSession> {
    const settings = await this.settingsStore.loadSettings();

    return this.sessionGateway.prepareManualSession({
      settings,
      initiatedBy: input?.initiatedBy,
    });
  }
}
