// File: packages/infrastructure-playwright/src/orchestration/playwright-batch-execution.orchestrator.ts
import {
  BatchExecutionService,
  BuildChangePlanUseCase,
  ExecuteBatchChangeUseCase,
  ExportRunReportUseCase,
  LoadProductsUseCase,
  PrepareLoginSessionUseCase,
  RetryFailedItemsUseCase,
  ResumeBatchChangeUseCase,
  StopBatchChangeUseCase,
  UpdateSettingsUseCase,
  ValidateSessionUseCase,
  noopRunEventPublisher,
  type AppSettings,
  type AppSettingsInput,
  type BatchJobStorePort,
  type RunEventPublisherPort,
} from '@smart-store/application';
import type {
  BatchJobId,
  BatchJobResult,
  ChangePlan,
  LoginSession,
  Product,
} from '@smart-store/core';

import type { SelectorProfileConfig } from '../config/selector-profile.js';
import { SelectorProfileRegistry } from '../config/selector-profile.registry.js';
import { PlaywrightSmartStoreAutomationAdapter } from '../adapters/playwright-smartstore-automation.adapter.js';
import { FileBatchExecutionControlStore } from '../persistence/file-batch-execution-control.store.js';
import { FileBatchJobStore } from '../persistence/file-batch-job.store.js';
import { FileExecutionCheckpointStore } from '../persistence/file-checkpoint.store.js';
import { FileRunReportExporter } from '../persistence/file-run-report.exporter.js';
import { FileSettingsStore } from '../persistence/file-settings.store.js';
import { OutputPathResolver } from '../persistence/output-path-resolver.js';
import { PlaywrightBrowserSessionAdapter } from '../session/playwright-browser-session.adapter.js';
import { PlaywrightSessionGatewayAdapter } from '../session/playwright-session-gateway.adapter.js';

export interface PlaywrightBatchExecutionOrchestratorOptions {
  settingsFilePath: string;
  defaultSettings: AppSettingsInput;
  selectorProfiles?: readonly SelectorProfileConfig[];
  eventPublisher?: RunEventPublisherPort;
  manualLoginTimeoutMs?: number;
}

export class PlaywrightBatchExecutionOrchestrator {
  readonly settingsStore: FileSettingsStore;

  readonly batchJobStore: BatchJobStorePort;

  readonly prepareLoginSessionUseCase: PrepareLoginSessionUseCase;

  readonly validateSessionUseCase: ValidateSessionUseCase;

  readonly loadProductsUseCase: LoadProductsUseCase;

  readonly buildChangePlanUseCase: BuildChangePlanUseCase;

  readonly executeBatchChangeUseCase: ExecuteBatchChangeUseCase;

  readonly resumeBatchChangeUseCase: ResumeBatchChangeUseCase;

  readonly stopBatchChangeUseCase: StopBatchChangeUseCase;

  readonly retryFailedItemsUseCase: RetryFailedItemsUseCase;

  readonly exportRunReportUseCase: ExportRunReportUseCase;

  readonly updateSettingsUseCase: UpdateSettingsUseCase;

  constructor(options: PlaywrightBatchExecutionOrchestratorOptions) {
    this.settingsStore = new FileSettingsStore(
      options.settingsFilePath,
      options.defaultSettings,
    );

    const outputPaths = new OutputPathResolver(async () => {
      const settings = await this.settingsStore.loadSettings();
      return settings.outputDir;
    });
    const selectorProfiles = new SelectorProfileRegistry(options.selectorProfiles);
    const browserSessionAdapter = new PlaywrightBrowserSessionAdapter();
    const sessionGateway = new PlaywrightSessionGatewayAdapter(
      browserSessionAdapter,
      undefined,
      selectorProfiles,
      {
        manualLoginTimeoutMs: options.manualLoginTimeoutMs,
      },
    );
    const automationPort = new PlaywrightSmartStoreAutomationAdapter(
      browserSessionAdapter,
      selectorProfiles,
    );
    const batchJobStore = new FileBatchJobStore(outputPaths);
    const checkpointStore = new FileExecutionCheckpointStore(outputPaths);
    const executionControl = new FileBatchExecutionControlStore(outputPaths);
    const reportExporter = new FileRunReportExporter(outputPaths);
    const eventPublisher = options.eventPublisher ?? noopRunEventPublisher;
    const batchExecutionService = new BatchExecutionService(
      automationPort,
      batchJobStore,
      checkpointStore,
      executionControl,
      eventPublisher,
    );

    this.batchJobStore = batchJobStore;
    this.prepareLoginSessionUseCase = new PrepareLoginSessionUseCase(
      this.settingsStore,
      sessionGateway,
    );
    this.validateSessionUseCase = new ValidateSessionUseCase(
      this.settingsStore,
      sessionGateway,
    );
    this.loadProductsUseCase = new LoadProductsUseCase(
      this.settingsStore,
      sessionGateway,
      automationPort,
    );
    this.buildChangePlanUseCase = new BuildChangePlanUseCase(this.settingsStore);
    this.executeBatchChangeUseCase = new ExecuteBatchChangeUseCase(
      this.settingsStore,
      sessionGateway,
      batchExecutionService,
    );
    this.resumeBatchChangeUseCase = new ResumeBatchChangeUseCase(
      this.settingsStore,
      sessionGateway,
      batchJobStore,
      checkpointStore,
      batchExecutionService,
    );
    this.stopBatchChangeUseCase = new StopBatchChangeUseCase(
      executionControl,
      eventPublisher,
    );
    this.retryFailedItemsUseCase = new RetryFailedItemsUseCase(
      this.settingsStore,
      batchJobStore,
    );
    this.exportRunReportUseCase = new ExportRunReportUseCase(
      batchJobStore,
      reportExporter,
    );
    this.updateSettingsUseCase = new UpdateSettingsUseCase(this.settingsStore);
  }

  async prepareLoginSession(input?: { initiatedBy?: string }): Promise<LoginSession> {
    return this.prepareLoginSessionUseCase.execute(input);
  }

  async validateSession(input?: { existingSession?: LoginSession }): Promise<LoginSession> {
    return this.validateSessionUseCase.execute(input);
  }

  async loadProducts(input?: Parameters<LoadProductsUseCase['execute']>[0]): Promise<readonly Product[]> {
    return this.loadProductsUseCase.execute(input);
  }

  async buildChangePlan(
    input: Parameters<BuildChangePlanUseCase['execute']>[0],
  ): Promise<ChangePlan> {
    return this.buildChangePlanUseCase.execute(input);
  }

  async executeBatchChange(input: {
    plan: ChangePlan;
    session?: LoginSession;
  }): Promise<BatchJobResult> {
    return this.executeBatchChangeUseCase.execute(input);
  }

  async resumeBatchChange(input: {
    jobId: BatchJobId;
    session?: LoginSession;
  }): Promise<BatchJobResult> {
    return this.resumeBatchChangeUseCase.execute(input);
  }

  async stopBatchChange(input: { jobId: BatchJobId; reason?: string }): Promise<void> {
    return this.stopBatchChangeUseCase.execute(input);
  }

  async retryFailedItems(
    input: Parameters<RetryFailedItemsUseCase['execute']>[0],
  ): Promise<ChangePlan> {
    return this.retryFailedItemsUseCase.execute(input);
  }

  async exportRunReport(input: {
    jobId: BatchJobId;
    targetPath?: string;
  }): Promise<{ targetPath: string; exportedFiles: readonly string[] }> {
    return this.exportRunReportUseCase.execute(input);
  }

  async updateSettings(settings: AppSettings): Promise<AppSettings> {
    return this.updateSettingsUseCase.execute(settings);
  }

  async listRecentBatchResults(limit?: number): Promise<readonly BatchJobResult[]> {
    return this.batchJobStore.listRecentBatchResults(limit);
  }
}
