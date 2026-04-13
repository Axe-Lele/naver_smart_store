// File: packages/application/src/use-cases/execute-batch-change.use-case.ts
import type { BatchJobResult, ChangePlan, LoginSession } from '@smart-store/core';

import type { SessionGatewayPort } from '../ports/session-gateway.port.js';
import type { SettingsStorePort } from '../ports/settings-store.port.js';
import { BatchExecutionService } from '../services/batch-execution.service.js';

export class ExecuteBatchChangeUseCase {
  constructor(
    private readonly settingsStore: SettingsStorePort,
    private readonly sessionGateway: SessionGatewayPort,
    private readonly batchExecutionService: BatchExecutionService,
  ) {}

  async execute(input: {
    plan: ChangePlan;
    session?: LoginSession;
  }): Promise<BatchJobResult> {
    const settings = await this.settingsStore.loadSettings();
    const session =
      input.session ??
      (await this.sessionGateway.validateSession({
        settings,
      }));

    return this.batchExecutionService.executeNewPlan({
      plan: input.plan,
      settings,
      session,
    });
  }
}
