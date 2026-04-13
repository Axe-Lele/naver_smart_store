// File: apps/desktop-electron/src/main/runtime.ts
import path from 'node:path';

import { app, BrowserWindow, shell } from 'electron';
import type { RunEventPublisherPort, RunLogLevel } from '@smart-store/application';
import type { AppSettings } from '@smart-store/application';
import { BatchJobId, type LoginSessionSnapshot } from '@smart-store/core';
import {
  FileStorageStateRepository,
  PlaywrightBatchExecutionOrchestrator,
} from '@smart-store/infrastructure-playwright';
import type {
  BootState,
  ExecuteBatchInput,
  ExportRunReportInput,
  GetRunDetailInput,
  ListRecentRunsInput,
  LoadProductsInput,
  RetryFailedItemsInput,
  RunDetail,
  StopBatchInput,
} from '@smart-store/shared';
import type { RunEvent } from '@smart-store/application';

export class DesktopRunEventPublisher implements RunEventPublisherPort {
  private readonly history: RunEvent[] = [];

  constructor(
    private readonly onEvent?: (event: RunEvent) => void,
    private readonly historyLimit = 300,
  ) {}

  async publish(event: RunEvent): Promise<void> {
    this.history.unshift(event);
    if (this.history.length > this.historyLimit) {
      this.history.length = this.historyLimit;
    }

    this.onEvent?.(event);

    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) {
        window.webContents.send('desktop:event', event);
      }
    }
  }

  getHistory(): readonly RunEvent[] {
    return [...this.history];
  }
}

export class DesktopAppRuntime {
  private readonly dataRoot: string;

  private readonly storageStateRepository = new FileStorageStateRepository();

  private readonly eventPublisher: DesktopRunEventPublisher;

  private readonly orchestrator: PlaywrightBatchExecutionOrchestrator;

  private currentJobId?: string;

  private lastKnownSession: LoginSessionSnapshot;

  constructor() {
    this.dataRoot = app.isPackaged ? app.getPath('userData') : process.cwd();
    const authDir = path.join(
      this.dataRoot,
      app.isPackaged ? 'auth' : '.auth',
    );
    const configDir = path.join(
      this.dataRoot,
      app.isPackaged ? 'config' : '.desktop-app',
    );
    const outputDir = path.join(this.dataRoot, 'output');
    this.lastKnownSession = {
      storageStatePath: path.join(
        authDir,
        'smartstore-storage-state.json',
      ),
      status: 'UNKNOWN',
    };
    this.eventPublisher = new DesktopRunEventPublisher((event) =>
      this.handleRunEvent(event),
    );
    this.orchestrator = new PlaywrightBatchExecutionOrchestrator({
      settingsFilePath: path.join(configDir, 'settings.json'),
      defaultSettings: {
        productsUrl: 'https://sell.smartstore.naver.com/',
        loginMode: 'storageState',
        storageStatePath: path.join(
          authDir,
          'smartstore-storage-state.json',
        ),
        userDataDir: path.join(authDir, 'chrome-profile'),
        outputDir,
        headless: false,
        delayMs: 1_500,
        concurrency: 1,
        consecutiveFailureLimit: 20,
        captureScreenshotOnFailure: true,
        captureHtmlOnFailure: true,
        selectorProfileId: 'smartstore-default',
      },
      eventPublisher: this.eventPublisher,
      manualLoginTimeoutMs: 10 * 60_000,
    });
  }

  async getBootState(): Promise<BootState> {
    const settings = await this.orchestrator.settingsStore.loadSettings();
    const session = await this.storageStateRepository.loadKnownSession(
      settings.storageStatePath,
    );
    const recentRuns = await this.orchestrator.listRecentBatchResults(12);
    this.lastKnownSession = session.toSnapshot();

    return {
      settings,
      session: session.toSnapshot(),
      recentRuns: recentRuns.map((item) => item.toSnapshot()),
      eventHistory: this.eventPublisher.getHistory(),
      currentJobId: this.currentJobId,
    };
  }

  async getSettings(): Promise<AppSettings> {
    return this.orchestrator.settingsStore.loadSettings();
  }

  async saveSettings(settings: AppSettings): Promise<AppSettings> {
    const saved = await this.orchestrator.updateSettings(settings);
    await this.publishLog(
      'info',
      'Application settings were updated.',
      undefined,
      {
        productsUrl: saved.productsUrl,
        concurrency: saved.concurrency,
        delayMs: saved.delayMs,
        headless: saved.headless,
      },
    );
    return saved;
  }

  async prepareLoginSession(input?: {
    initiatedBy?: string;
  }): Promise<LoginSessionSnapshot> {
    await this.publishLog(
      'info',
      'Opening Smart Store browser window for manual login session preparation.',
    );

    try {
      const session = await this.orchestrator.prepareLoginSession(input);
      this.lastKnownSession = session.toSnapshot();
      await this.publishSessionState(
        this.lastKnownSession.status,
        `Login session saved to ${this.lastKnownSession.storageStatePath}`,
      );
      return this.lastKnownSession;
    } catch (error) {
      await this.publishSessionError(error);
      throw error;
    }
  }

  async validateSession(): Promise<LoginSessionSnapshot> {
    await this.publishLog('info', 'Validating saved Smart Store login session.');

    try {
      const session = await this.orchestrator.validateSession();
      this.lastKnownSession = session.toSnapshot();
      await this.publishSessionState(
        this.lastKnownSession.status,
        'Saved Smart Store login session is ready.',
      );
      return this.lastKnownSession;
    } catch (error) {
      await this.publishSessionError(error);
      throw error;
    }
  }

  async loadProducts(input?: LoadProductsInput) {
    const products = await this.orchestrator.loadProducts({
      query: input,
    });

    await this.publishLog(
      'info',
      `Loaded ${products.length} product rows from Smart Store.`,
      undefined,
      {
        usedSearchText: input?.searchText ?? '',
        requestedIds: input?.productIds?.length ?? 0,
      },
    );

    return products.map((product) => product.toSnapshot());
  }

  async executeBatch(input: ExecuteBatchInput) {
    const plan = await this.orchestrator.buildChangePlan({
      selectedProductIds: input.selectedProductIds,
      dryRun: input.dryRun,
      requestedBy: input.requestedBy,
    });

    this.currentJobId = plan.jobId.toString();
    await this.publishLog(
      'info',
      'Starting Smart Store batch change execution.',
      this.currentJobId,
      {
        selectedCount: plan.itemCount,
        dryRun: plan.dryRun,
      },
    );

    try {
      const result = await this.orchestrator.executeBatchChange({
        plan,
      });
      return result.toSnapshot();
    } finally {
      if (this.currentJobId === plan.jobId.toString()) {
        this.currentJobId = undefined;
      }
    }
  }

  async resumeBatch(input: { jobId: string }) {
    const jobId = BatchJobId.create(input.jobId);
    this.currentJobId = jobId.toString();
    await this.publishLog(
      'warn',
      'Resuming Smart Store batch execution from checkpoint.',
      jobId.toString(),
    );

    try {
      const result = await this.orchestrator.resumeBatchChange({
        jobId,
      });
      return result.toSnapshot();
    } finally {
      if (this.currentJobId === jobId.toString()) {
        this.currentJobId = undefined;
      }
    }
  }

  async stopBatch(input?: StopBatchInput): Promise<void> {
    const jobId = input?.jobId ?? this.currentJobId;

    if (!jobId) {
      throw new Error('There is no active batch job to stop.');
    }

    await this.orchestrator.stopBatchChange({
      jobId: BatchJobId.create(jobId),
      reason: input?.reason,
    });
  }

  async retryFailedItems(input: RetryFailedItemsInput) {
    const retryPlan = await this.orchestrator.retryFailedItems({
      jobId: BatchJobId.create(input.jobId),
      dryRun: input.dryRun,
      includeAllFailed: input.includeAllFailed,
      requestedBy: input.requestedBy,
    });

    this.currentJobId = retryPlan.jobId.toString();
    await this.publishLog(
      'warn',
      'Starting retry batch for failed Smart Store items.',
      this.currentJobId,
      {
        selectedCount: retryPlan.itemCount,
        dryRun: retryPlan.dryRun,
      },
    );

    try {
      const result = await this.orchestrator.executeBatchChange({
        plan: retryPlan,
      });
      return result.toSnapshot();
    } finally {
      if (this.currentJobId === retryPlan.jobId.toString()) {
        this.currentJobId = undefined;
      }
    }
  }

  async listRecentRuns(input?: ListRecentRunsInput) {
    const recentRuns = await this.orchestrator.listRecentBatchResults(input?.limit ?? 12);
    return recentRuns.map((item) => item.toSnapshot());
  }

  async getRunDetail(input: GetRunDetailInput): Promise<RunDetail> {
    const jobId = BatchJobId.create(input.jobId);
    const [job, result, itemResults] = await Promise.all([
      this.orchestrator.batchJobStore.loadJob(jobId),
      this.orchestrator.batchJobStore.loadBatchResult(jobId),
      this.orchestrator.batchJobStore.loadItemResults(jobId),
    ]);

    return {
      job: job?.toSnapshot() ?? null,
      result: result?.toSnapshot() ?? null,
      itemResults: itemResults.map((item) => item.toSnapshot()),
    };
  }

  async exportRunReport(input: ExportRunReportInput) {
    return this.orchestrator.exportRunReport({
      jobId: BatchJobId.create(input.jobId),
      targetPath: input.targetPath,
    });
  }

  async openPath(targetPath: string): Promise<void> {
    const errorMessage = await shell.openPath(path.resolve(targetPath));

    if (errorMessage) {
      throw new Error(errorMessage);
    }
  }

  private handleRunEvent(event: RunEvent): void {
    if (event.type === 'job-state') {
      if (event.status === 'RUNNING' || event.status === 'STOP_REQUESTED') {
        this.currentJobId = event.jobId;
      } else if (this.currentJobId === event.jobId) {
        this.currentJobId = undefined;
      }
    }
  }

  private async publishSessionState(
    status: LoginSessionSnapshot['status'],
    message: string,
  ): Promise<void> {
    await this.eventPublisher.publish({
      type: 'session-state',
      createdAt: new Date().toISOString(),
      status,
      message,
    });
  }

  private async publishSessionError(error: unknown): Promise<void> {
    const status =
      isErrorWithSessionStatus(error) && error.session.status
        ? error.session.status
        : 'INVALID';
    const message = error instanceof Error ? error.message : String(error);
    await this.publishSessionState(status, message);
  }

  private async publishLog(
    level: RunLogLevel,
    message: string,
    jobId?: string,
    context?: Readonly<Record<string, string | number | boolean | null>>,
  ): Promise<void> {
    await this.eventPublisher.publish({
      type: 'log',
      createdAt: new Date().toISOString(),
      level,
      message,
      jobId,
      context,
    });
  }
}

function isErrorWithSessionStatus(
  value: unknown,
): value is {
  session: LoginSessionSnapshot;
} {
  return (
    typeof value === 'object' &&
    value !== null &&
    'session' in value &&
    typeof (value as { session?: unknown }).session === 'object'
  );
}
