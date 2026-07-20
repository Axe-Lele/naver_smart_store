// File: apps/desktop-electron/src/main/runtime.ts
import path from 'node:path';
import { cpSync, existsSync, mkdirSync, readdirSync } from 'node:fs';

import { app, BrowserWindow, clipboard, screen, shell } from 'electron';
import type { RunEventPublisherPort, RunLogLevel } from '@smart-store/application';
import {
  DEFAULT_SMARTSTORE_PRODUCTS_URL,
  DEFAULT_PREORDER_REQUIRED_OPTIONS,
  GenerateProductNameTranslationsUseCase,
  LookupAmazonProductsUseCase,
  type AppSettings,
} from '@smart-store/application';
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
  HybridBridgeCommandState,
  HybridBridgeState,
  HybridSendCommandInput,
  ListRecentRunsInput,
  LookupAmazonProductsDesktopInput,
  LoadProductsInput,
  RetryFailedItemsInput,
  RunDetail,
  StopBatchInput,
  ProductNameTranslationsInput,
} from '@smart-store/shared';
import type { RunEvent } from '@smart-store/application';

import { AmazonPaApiProductLookup } from './amazon-paapi-product-lookup.js';
import { type ChromeLaunchOptions, openUrlInChrome } from './chrome-launcher.js';
import { HybridBridgeServer } from './hybrid-bridge-server.js';
import { OpenAiProductNameTranslator } from './openai-product-name-translator.js';

const COMPACT_CHROME_WINDOW_SIZE = {
  width: 1000,
  height: 750,
} as const;

const COMPACT_CHROME_WINDOW_MARGIN = 24;
const DEDICATED_CHROME_PROFILE_DIRECTORY = 'Default';

const CAFE24_ADMIN_LOGIN_URL = 'https://tmg023.cafe24.com/mall/admin/admin_login.php';
const PLAYWRIGHT_CHROMIUM_EXECUTABLE_SEGMENTS = [
  'chrome-win64',
  'chrome.exe',
] as const;

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

  private readonly authDir: string;

  private readonly bundledExtensionBuildPath: string;

  private readonly extensionBuildPath: string;

  private readonly workBrowserExecutablePath: string | undefined;

  private readonly storageStateRepository = new FileStorageStateRepository();

  private readonly eventPublisher: DesktopRunEventPublisher;

  private readonly orchestrator: PlaywrightBatchExecutionOrchestrator;

  private readonly hybridBridgeServer: HybridBridgeServer;

  private readonly productNameTranslations: GenerateProductNameTranslationsUseCase;

  private readonly amazonProductLookup: LookupAmazonProductsUseCase;

  private currentJobId?: string;

  private lastKnownSession: LoginSessionSnapshot;

  constructor() {
    this.dataRoot = app.isPackaged ? app.getPath('userData') : process.cwd();
    this.authDir = path.join(
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
        this.authDir,
        'smartstore-storage-state.json',
      ),
      status: 'UNKNOWN',
    };
    this.eventPublisher = new DesktopRunEventPublisher((event) =>
      this.handleRunEvent(event),
    );
    this.bundledExtensionBuildPath = app.isPackaged
      ? path.join(process.resourcesPath, 'chrome-extension')
      : path.join(process.cwd(), 'dist', 'apps', 'chrome-extension');
    this.extensionBuildPath = this.prepareRuntimeChromeExtensionPath();
    this.workBrowserExecutablePath = this.resolveBundledChromiumExecutablePath();
    this.hybridBridgeServer = new HybridBridgeServer({
      extensionBuildPath: this.extensionBuildPath,
      chromeExtensionsUrl: 'chrome://extensions',
      sellerCenterUrl: DEFAULT_SMARTSTORE_PRODUCTS_URL,
    });
    this.productNameTranslations = new GenerateProductNameTranslationsUseCase(
      new OpenAiProductNameTranslator({
        apiKey: process.env.OPENAI_API_KEY,
        model: process.env.OPENAI_PRODUCT_NAME_MODEL ?? process.env.OPENAI_MODEL,
      }),
    );
    this.amazonProductLookup = new LookupAmazonProductsUseCase(
      new AmazonPaApiProductLookup({
        accessKey: process.env.AMAZON_PA_API_ACCESS_KEY,
        secretKey: process.env.AMAZON_PA_API_SECRET_KEY,
        partnerTag: process.env.AMAZON_PA_API_PARTNER_TAG,
        host: process.env.AMAZON_PA_API_HOST,
        marketplace: process.env.AMAZON_PA_API_MARKETPLACE,
        region: process.env.AMAZON_PA_API_REGION,
      }),
    );
    this.orchestrator = new PlaywrightBatchExecutionOrchestrator({
      settingsFilePath: path.join(configDir, 'settings.json'),
      defaultSettings: {
        productsUrl: DEFAULT_SMARTSTORE_PRODUCTS_URL,
        loginMode: 'storageState',
        storageStatePath: path.join(
          this.authDir,
          'smartstore-storage-state.json',
        ),
        userDataDir: this.getDefaultWorkBrowserUserDataDir(),
        outputDir,
        headless: false,
        delayMs: 1_500,
        concurrency: 1,
        consecutiveFailureLimit: 10,
        captureScreenshotOnFailure: true,
        captureHtmlOnFailure: true,
        selectorProfileId: 'smartstore-default',
        preorderRequiredOptions: DEFAULT_PREORDER_REQUIRED_OPTIONS,
      },
      eventPublisher: this.eventPublisher,
      manualLoginTimeoutMs: 10 * 60_000,
    });
  }

  async getBootState(): Promise<BootState> {
    await this.ensureHybridBridgeStarted(false);
    const settings = await this.orchestrator.settingsStore.loadSettings();
    const session = await this.storageStateRepository.loadKnownSession(
      settings.storageStatePath,
    );
    const recentRuns = await this.orchestrator.listRecentBatchResults(12);
    this.lastKnownSession = session.toSnapshot();

    return {
      appInfo: {
        name: app.getName(),
        version: app.getVersion(),
        packaged: app.isPackaged,
      },
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

  async getHybridBridgeState(): Promise<HybridBridgeState> {
    await this.ensureHybridBridgeStarted(false);
    return this.hybridBridgeServer.getState();
  }

  async sendHybridCommand(
    input: HybridSendCommandInput,
  ): Promise<HybridBridgeCommandState> {
    await this.ensureHybridBridgeStarted(true);
    const command = this.hybridBridgeServer.enqueueCommand(
      input.type,
      input.payload,
    );
    await this.publishLog(
      'info',
      `Queued extension command: ${input.type}`,
      undefined,
      {
        commandId: command.commandId,
        targetClientId: command.targetClientId ?? null,
        selectedProductCount: input.payload?.selectedProductIds?.length ?? 0,
      },
    );
    return command;
  }

  async openChromeExtensions(): Promise<void> {
    const executablePath = this.requireWorkBrowserExecutablePath();
    await this.openChromeTarget(
      'chrome://extensions',
      '작업용 브라우저 실행 파일을 찾지 못했습니다. 설치 파일을 다시 설치해 주세요.',
      this.createChromeLaunchOptions({
        newWindow: false,
        executablePath,
        userDataDir: this.getDefaultWorkBrowserUserDataDir(),
        profileDirectory: DEDICATED_CHROME_PROFILE_DIRECTORY,
        extensionPath: this.getChromeExtensionPath(),
        restartExistingUserDataDir: true,
      }),
    );
  }

  async openSellerCenter(): Promise<void> {
    const settings = await this.orchestrator.settingsStore.loadSettings();
    const executablePath = this.requireWorkBrowserExecutablePath();
    await this.openChromeTarget(
      settings.productsUrl || DEFAULT_SMARTSTORE_PRODUCTS_URL,
      '작업용 브라우저 실행 파일을 찾지 못했습니다. 설치 파일을 다시 설치해 주세요.',
      this.createChromeLaunchOptions({
        compactWorkWindow: true,
        executablePath,
        userDataDir: this.getDefaultWorkBrowserUserDataDir(),
        profileDirectory: DEDICATED_CHROME_PROFILE_DIRECTORY,
        extensionPath: this.getChromeExtensionPath(),
        restartExistingUserDataDir: true,
      }),
    );
  }

  async openCafe24Admin(): Promise<void> {
    const executablePath = this.requireWorkBrowserExecutablePath();
    await this.openChromeTarget(
      CAFE24_ADMIN_LOGIN_URL,
      '작업용 브라우저 실행 파일을 찾지 못했습니다. 설치 파일을 다시 설치해 주세요.',
      this.createChromeLaunchOptions({
        compactWorkWindow: true,
        executablePath,
        userDataDir: this.getDefaultWorkBrowserUserDataDir(),
        profileDirectory: DEDICATED_CHROME_PROFILE_DIRECTORY,
        extensionPath: this.getChromeExtensionPath(),
        restartExistingUserDataDir: true,
      }),
    );
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

  async translateProductNames(input: ProductNameTranslationsInput) {
    const result = await this.productNameTranslations.execute(input);
    await this.publishLog(
      'info',
      'Generated Korean product name candidates.',
      undefined,
      {
        itemCount: result.items.length,
        model: result.model ?? null,
      },
    );
    return result;
  }

  async lookupAmazonProducts(input: LookupAmazonProductsDesktopInput) {
    const result = await this.amazonProductLookup.execute(input);
    await this.publishLog(
      'info',
      'Loaded Amazon product source data.',
      undefined,
      {
        itemCount: result.items.length,
        readyCount: result.items.filter((item) => item.status === 'READY').length,
      },
    );
    return result;
  }

  async openPath(targetPath: string): Promise<void> {
    const errorMessage = await shell.openPath(path.resolve(targetPath));

    if (errorMessage) {
      throw new Error(errorMessage);
    }
  }

  async copyText(text: string): Promise<void> {
    clipboard.writeText(text);
  }

  private async ensureHybridBridgeStarted(throwOnFailure: boolean): Promise<void> {
    try {
      await this.hybridBridgeServer.start();
    } catch (error) {
      await this.publishLog(
        'error',
        'Electron hybrid bridge could not start.',
        undefined,
        {
          error: error instanceof Error ? error.message : String(error),
        },
      );

      if (throwOnFailure) {
        throw error;
      }
    }
  }

  private async openChromeTarget(
    target: string,
    fallbackMessage: string,
    options: ChromeLaunchOptions = {},
  ): Promise<void> {
    // 판매자센터 URL에는 '작업용 브라우저' 짝짓기 마커를 붙인다. 확장이 이 마커를
    // 보고 해당 프로필을 작업용으로 기록하며, 마커를 본 적 없는 개인 크롬의 확장은
    // 하이브리드 브리지에 연결하지 않는다 (개인 크롬 탭에서 상품을 긁어오는 사고 방지).
    target = appendWorkBrowserMarker(target);
    let chromePath: string | null;
    try {
      chromePath = await openUrlInChrome(target, options);
    } catch (error) {
      throw new Error(
        `작업용 브라우저 실행에 실패했습니다.${error instanceof Error ? `\n\n${error.message}` : ''}`,
      );
    }

    if (chromePath) {
      await this.publishLog(
        'info',
        'Opened work browser workspace.',
        undefined,
        {
          chromePath,
          target,
          userDataDir: options.userDataDir ?? null,
          profileDirectory: options.profileDirectory ?? null,
          extensionPath: options.extensionPath ?? null,
          extensionLoaded: Boolean(options.extensionPath),
          windowSize: formatChromeWindowSize(options.windowSize),
          windowPosition: formatChromeWindowPosition(options.windowPosition),
        },
      );
      return;
    }

    await this.publishLog(
      'error',
      'Could not resolve a work browser executable. Browser was not opened.',
      undefined,
      {
        target,
        userDataDir: options.userDataDir ?? null,
        profileDirectory: options.profileDirectory ?? null,
        extensionPath: options.extensionPath ?? null,
        windowSize: formatChromeWindowSize(options.windowSize),
        windowPosition: formatChromeWindowPosition(options.windowPosition),
      },
    );

    throw new Error(fallbackMessage);
  }

  private createChromeLaunchOptions(
    options: Pick<
      ChromeLaunchOptions,
      | 'executablePath'
      | 'keepBackgroundActive'
      | 'newWindow'
      | 'userDataDir'
      | 'profileDirectory'
      | 'extensionPath'
      | 'restartExistingUserDataDir'
    > & {
      compactWorkWindow?: boolean;
    } = {},
  ): ChromeLaunchOptions {
    const launchOptions: ChromeLaunchOptions = {
      newWindow: options.newWindow,
      executablePath: options.executablePath,
      keepBackgroundActive: options.keepBackgroundActive,
      userDataDir: options.userDataDir,
      profileDirectory: options.profileDirectory,
      extensionPath: options.extensionPath,
      restartExistingUserDataDir: options.restartExistingUserDataDir,
    };

    if (options.compactWorkWindow) {
      launchOptions.keepBackgroundActive = true;
      const bounds = this.getCompactChromeWindowBounds();
      launchOptions.windowSize = {
        width: bounds.width,
        height: bounds.height,
      };
      launchOptions.windowPosition = {
        x: bounds.x,
        y: bounds.y,
      };
    }

    return launchOptions;
  }

  private getDefaultWorkBrowserUserDataDir(): string {
    return path.join(this.authDir, 'work-browser-profile');
  }

  private getChromeExtensionPath(): string | undefined {
    return existsSync(path.join(this.extensionBuildPath, 'manifest.json'))
      ? this.extensionBuildPath
      : undefined;
  }

  private prepareRuntimeChromeExtensionPath(): string {
    const runtimeExtensionPath = path.join(
      this.dataRoot,
      app.isPackaged ? 'chrome-extension' : '.desktop-app/chrome-extension',
    );

    if (!existsSync(path.join(this.bundledExtensionBuildPath, 'manifest.json'))) {
      return this.bundledExtensionBuildPath;
    }

    try {
      mkdirSync(path.dirname(runtimeExtensionPath), { recursive: true });
      cpSync(this.bundledExtensionBuildPath, runtimeExtensionPath, {
        recursive: true,
        force: true,
      });
      return runtimeExtensionPath;
    } catch {
      return this.bundledExtensionBuildPath;
    }
  }

  private resolveBundledChromiumExecutablePath(): string | undefined {
    const runtimeRoot = app.isPackaged
      ? path.join(process.resourcesPath, 'playwright-runtime')
      : path.join(process.cwd(), '.playwright-browsers');

    if (!existsSync(runtimeRoot)) {
      return undefined;
    }

    const chromiumDirs = readdirSync(runtimeRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name.startsWith('chromium-'))
      .map((entry) => entry.name)
      .sort()
      .reverse();

    for (const directoryName of chromiumDirs) {
      const executablePath = path.join(
        runtimeRoot,
        directoryName,
        ...PLAYWRIGHT_CHROMIUM_EXECUTABLE_SEGMENTS,
      );

      if (existsSync(executablePath)) {
        return executablePath;
      }
    }

    return undefined;
  }

  private requireWorkBrowserExecutablePath(): string {
    if (!this.workBrowserExecutablePath) {
      throw new Error(
        '작업용 브라우저 실행 파일을 찾지 못했습니다. 설치 파일을 다시 설치해 주세요.',
      );
    }

    return this.workBrowserExecutablePath;
  }

  private getCompactChromeWindowBounds(): {
    width: number;
    height: number;
    x: number;
    y: number;
  } {
    const workArea = screen.getPrimaryDisplay().workArea;
    const width = Math.min(COMPACT_CHROME_WINDOW_SIZE.width, workArea.width);
    const height = Math.min(COMPACT_CHROME_WINDOW_SIZE.height, workArea.height);

    return {
      width,
      height,
      x:
        workArea.x +
        Math.max(0, workArea.width - width - COMPACT_CHROME_WINDOW_MARGIN),
      y:
        workArea.y +
        Math.max(0, workArea.height - height - COMPACT_CHROME_WINDOW_MARGIN),
    };
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

function formatChromeWindowSize(
  value: ChromeLaunchOptions['windowSize'],
): string | null {
  return value ? `${value.width}x${value.height}` : null;
}

function formatChromeWindowPosition(
  value: ChromeLaunchOptions['windowPosition'],
): string | null {
  return value ? `${value.x},${value.y}` : null;
}

// 판매자센터 URL에 작업용 브라우저 짝짓기 마커를 붙인다. 다른 도메인은 그대로 둔다.
function appendWorkBrowserMarker(target: string): string {
  try {
    const url = new URL(target);
    if (!url.hostname.endsWith('sell.smartstore.naver.com')) {
      return target;
    }
    url.searchParams.set('wfWorkBrowser', '1');
    return url.toString();
  } catch {
    return target;
  }
}
