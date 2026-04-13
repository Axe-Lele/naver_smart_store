// File: packages/application/src/ports/session-gateway.port.ts
import type { LoginSession } from '@smart-store/core';

import type { AppSettings } from '../settings/app-settings.js';

export interface PrepareLoginSessionCommand {
  settings: AppSettings;
  initiatedBy?: string;
}

export interface ValidateLoginSessionQuery {
  settings: AppSettings;
  existingSession?: LoginSession;
}

export interface SessionGatewayPort {
  prepareManualSession(command: PrepareLoginSessionCommand): Promise<LoginSession>;
  validateSession(query: ValidateLoginSessionQuery): Promise<LoginSession>;
}
