// File: packages/application/src/use-cases/validate-session.use-case.ts
import type { LoginSession } from '@smart-store/core';

import type { SessionGatewayPort } from '../ports/session-gateway.port.js';
import type { SettingsStorePort } from '../ports/settings-store.port.js';

export class ValidateSessionUseCase {
  constructor(
    private readonly settingsStore: SettingsStorePort,
    private readonly sessionGateway: SessionGatewayPort,
  ) {}

  async execute(input?: { existingSession?: LoginSession }): Promise<LoginSession> {
    const settings = await this.settingsStore.loadSettings();

    return this.sessionGateway.validateSession({
      settings,
      existingSession: input?.existingSession,
    });
  }
}
