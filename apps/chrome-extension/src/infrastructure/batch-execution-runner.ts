// Path: C:\smart-store\apps\chrome-extension\src\infrastructure\batch-execution-runner.ts
import type { ProgressSnapshot, ProgressStorePort } from "../application/index.js";
import {
  DEFAULT_RUN_POLICY,
  ProductId,
  ProductProcessingState,
  type BatchExecutionCheckpoint,
  type PersistedBatchTarget,
  type PersistedProcessingResult,
  type Product,
  type RequiredOption,
  type RunPolicy,
} from "../domain/index.js";
import { normalizeRequiredOptions } from "./extension-settings.js";
import { ChromeBatchStateStore } from "./chrome-batch-state.store.js";
import { WaitStrategy } from "./wait-strategy.js";
import { ProductSearchPageParser } from "./product-search-page.parser.js";
import { ProductEditPageDriver } from "./product-edit-page.driver.js";
import { SellerCenterPageGateway } from "./seller-center-page.gateway.js";
import {
  ALL_PAGES_COMPLETED_MESSAGE,
  MAX_PAGINATION_ADVANCE_ATTEMPTS,
  appendPaginationTargets,
  buildKnownProductIds,
  completePaginationCheckpoint,
  filterNewProducts,
  stopPaginationCheckpoint,
} from "./batch-target-expansion.js";

const EDIT_NAVIGATION_TIMEOUT_MS = 3_500;
const EDIT_NAVIGATION_POLL_MS = 100;
const ROUTE_RESUME_DELAY_MS = 250;

type BatchExecutionOptions = {
  selectedProductIds?: readonly string[];
  requiredOptions?: readonly RequiredOption[];
};

export class BatchExecutionRunner {
  private isRunning = false;

  private navigationTimerId?: number;

  private resumeTimerId?: number;

  public constructor(
    private readonly parser: ProductSearchPageParser,
    private readonly driver: ProductEditPageDriver,
    private readonly progressStore: ProgressStorePort,
    private readonly batchStore: ChromeBatchStateStore,
    private readonly gateway: SellerCenterPageGateway,
    private readonly waitStrategy: WaitStrategy,
    private readonly windowRef: Window,
  ) {}

  public async start(
    policy: RunPolicy,
    options: BatchExecutionOptions = {},
  ): Promise<BatchExecutionCheckpoint> {
    this.clearScheduledNavigation();

    const parsed = await this.parser.collectBundleDeliveryTargets({
      pagination: "current-page",
    });
    if (parsed.verificationStatus !== "verified") {
      throw new Error(parsed.note);
    }

    const selectedIds = new Set(
      (options.selectedProductIds ?? []).map((productId) => productId.trim()),
    );
    const products =
      selectedIds.size > 0
        ? parsed.products.filter((product) => selectedIds.has(product.id.toString()))
        : parsed.products;

    const previous = await this.batchStore.load();
    const selectedProductIdValues =
      selectedIds.size > 0
        ? selectedIds
        : new Set(products.map((product) => product.id.toString()));
    const previousSuccessfulResults = policy.resumeFromCheckpoint
      ? (previous?.results ?? []).filter(
          (result) =>
            result.state === ProductProcessingState.SUCCEEDED &&
            selectedProductIdValues.has(result.productId),
        )
      : [];
    const successfulIds = new Set(previousSuccessfulResults.map((result) => result.productId));

    const results: PersistedProcessingResult[] = previousSuccessfulResults;
    const targets: PersistedBatchTarget[] = [];
    const requiredOptions = normalizeRequiredOptions(
      options.requiredOptions ?? policy.requiredOptions,
    );

    for (const product of products) {
      if (successfulIds.has(product.id.toString())) {
        if (policy.resumeFromCheckpoint) {
          continue;
        }
      }

      targets.push(serializeTarget(product));
    }

    const checkpoint: BatchExecutionCheckpoint = {
      status: "running",
      mode: "execute",
      searchPageUrl: this.gateway.getPageUrl(),
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      currentIndex: 0,
      stopRequested: false,
      delayMs: policy.delayMs,
      skipSucceeded: policy.resumeFromCheckpoint,
      consecutiveFailureCount: 0,
      stopOnConsecutiveFailures: policy.stopOnConsecutiveFailures,
      requiredOptions,
      selectedProductIds: selectedIds.size > 0 ? [...selectedIds] : undefined,
      targets,
      results,
    };

    await this.batchStore.save(checkpoint);
    await this.progressStore.save(
      toProgressSnapshot(checkpoint, "executing", buildNavigationMessage(checkpoint)),
    );

    if (checkpoint.targets.length === 0) {
      return this.extendFromNextResultPageOrComplete(checkpoint, policy);
    }

    this.scheduleNavigationToCurrentTarget(checkpoint, policy);
    return checkpoint;
  }

  public async stop(): Promise<BatchExecutionCheckpoint | null> {
    this.clearScheduledNavigation();

    const checkpoint = await this.batchStore.load();
    if (!checkpoint) {
      return null;
    }

    checkpoint.stopRequested = true;
    checkpoint.updatedAt = new Date().toISOString();
    if (checkpoint.status === "running") {
      checkpoint.status = "stopped";
    }

    await this.batchStore.save(checkpoint);
    await this.progressStore.save(
      toProgressSnapshot(checkpoint, "stopped", "작업이 중단되었습니다."),
    );
    return checkpoint;
  }

  public async resume(): Promise<BatchExecutionCheckpoint | null> {
    const checkpoint = await this.batchStore.load();
    if (!checkpoint) {
      return null;
    }

    checkpoint.status = "running";
    checkpoint.stopRequested = false;
    checkpoint.updatedAt = new Date().toISOString();

    this.clearScheduledNavigation();
    await this.batchStore.save(checkpoint);
    await this.progressStore.save(
      toProgressSnapshot(checkpoint, "executing", buildNavigationMessage(checkpoint)),
    );
    this.scheduleNavigationToCurrentTarget(checkpoint, DEFAULT_RUN_POLICY);
    return checkpoint;
  }

  public async continueIfNeeded(policy: RunPolicy): Promise<BatchExecutionCheckpoint | null> {
    if (this.isRunning) {
      return null;
    }

    const checkpoint = await this.batchStore.load();
    if (!checkpoint || checkpoint.status !== "running") {
      return checkpoint;
    }

    if (checkpoint.stopRequested) {
      return this.persistStoppedCheckpoint(checkpoint);
    }

    this.isRunning = true;
    try {
      await this.waitStrategy.waitForDocumentReady(8_000);

      const stoppedAfterReady = await this.stopIfRequested(checkpoint);
      if (stoppedAfterReady) {
        return stoppedAfterReady;
      }

      if (checkpoint.currentIndex >= checkpoint.targets.length) {
        return this.extendFromNextResultPageOrComplete(checkpoint, policy);
      }

      const currentTarget = checkpoint.targets[checkpoint.currentIndex];
      if (!currentTarget) {
        return this.extendFromNextResultPageOrComplete(checkpoint, policy);
      }

      const currentUrl = this.gateway.getPageUrl();
      const isOnTargetEditPage = isProductEditUrl(currentUrl);

      if (!isOnTargetEditPage) {
        checkpoint.updatedAt = new Date().toISOString();
        await this.batchStore.save(checkpoint);
        await this.progressStore.save(
          toProgressSnapshot(checkpoint, "executing", buildNavigationMessage(checkpoint)),
        );
        const stoppedBeforeNavigation = await this.stopIfRequested(checkpoint);
        if (stoppedBeforeNavigation) {
          return stoppedBeforeNavigation;
        }
        this.scheduleNavigationToCurrentTarget(checkpoint, policy);
        return checkpoint;
      }

      checkpoint.updatedAt = new Date().toISOString();
      await this.progressStore.save(
        toProgressSnapshot(
          checkpoint,
          "executing",
          `상품 설정 적용 중: ${currentTarget.productId}`,
        ),
      );

      const stoppedBeforeApply = await this.stopIfRequested(checkpoint);
      if (stoppedBeforeApply) {
        return stoppedBeforeApply;
      }

      const product = deserializeTarget(currentTarget);
      this.driver.configureRequiredOptions(
        checkpoint.requiredOptions ?? policy.requiredOptions,
      );
      const prepared = await this.driver.preparePreorderChangePlan(product, {
        ...policy,
        dryRun: false,
        requiredOptions: checkpoint.requiredOptions ?? policy.requiredOptions,
      });
      const result =
        "state" in prepared
          ? prepared
          : await this.driver.applyPreorderChangePlan(prepared);

      checkpoint.results = mergeResults(checkpoint.results, [serializeResult(result)]);
      if (result.state !== ProductProcessingState.STOPPED) {
        checkpoint.currentIndex += 1;
      }
      checkpoint.updatedAt = new Date().toISOString();
      checkpoint.consecutiveFailureCount =
        result.state === ProductProcessingState.SUCCEEDED
          ? 0
          : checkpoint.consecutiveFailureCount + 1;

      if (result.state === ProductProcessingState.STOPPED) {
        checkpoint.status = "stopped";
        checkpoint.stopRequested = true;
      }

      const stoppedAfterApply = await this.stopIfRequested(checkpoint);
      if (stoppedAfterApply) {
        return stoppedAfterApply;
      }

      if (checkpoint.consecutiveFailureCount >= checkpoint.stopOnConsecutiveFailures) {
        checkpoint.status = "stopped";
        checkpoint.stopRequested = true;
        checkpoint.results = mergeResults(checkpoint.results, [
          {
            productId: currentTarget.productId,
            state: ProductProcessingState.STOPPED,
            message: `${checkpoint.consecutiveFailureCount}건 연속으로 실패해 안전을 위해 작업을 멈췄습니다.`,
            retryable: false,
            planNotes: [],
            artifacts: [],
          },
        ]);
      } else if (checkpoint.currentIndex >= checkpoint.targets.length) {
        return this.extendFromNextResultPageOrComplete(checkpoint, policy);
      }

      await this.batchStore.save(checkpoint);
      await this.progressStore.save(
        toProgressSnapshot(
          checkpoint,
          checkpoint.status === "stopped" ? "stopped" : "executing",
        ),
      );

      if (checkpoint.status === "running" && !checkpoint.stopRequested) {
        await this.waitStrategy.throttle(checkpoint.delayMs);
        const stoppedAfterDelay = await this.stopIfRequested(checkpoint);
        if (stoppedAfterDelay) {
          return stoppedAfterDelay;
        }
        await this.progressStore.save(
          toProgressSnapshot(checkpoint, "executing", buildNavigationMessage(checkpoint)),
        );
        const stoppedBeforeNextNavigation = await this.stopIfRequested(checkpoint);
        if (stoppedBeforeNextNavigation) {
          return stoppedBeforeNextNavigation;
        }
        this.scheduleNavigationToCurrentTarget(checkpoint, policy);
      }

      return checkpoint;
    } finally {
      this.isRunning = false;
    }
  }

  private async extendFromNextResultPageOrComplete(
    checkpoint: BatchExecutionCheckpoint,
    policy: RunPolicy,
  ): Promise<BatchExecutionCheckpoint> {
    if (!isProductListUrl(this.gateway.getPageUrl(), checkpoint.searchPageUrl)) {
      this.windowRef.location.assign(checkpoint.searchPageUrl);
      this.resumeTimerId = this.windowRef.setTimeout(() => {
        this.resumeTimerId = undefined;
        void this.continueIfNeeded(policy);
      }, ROUTE_RESUME_DELAY_MS);

      const returning: BatchExecutionCheckpoint = {
        ...checkpoint,
        updatedAt: new Date().toISOString(),
      };
      await this.batchStore.save(returning);
      await this.progressStore.save(
        toProgressSnapshot(returning, "executing", "다음 페이지 확인을 위해 상품관리 목록으로 이동 중입니다."),
      );
      return returning;
    }

    const knownProductIds = buildKnownProductIds(checkpoint);

    for (let attempt = 0; attempt < MAX_PAGINATION_ADVANCE_ATTEMPTS; attempt += 1) {
      const moved = await this.parser.moveToNextResultPage();
      if (!moved.ok) {
        return this.completeAllPages(checkpoint);
      }

      await this.waitStrategy.waitForDocumentReady(8_000);
      const parsed = await this.parser.collectBundleDeliveryTargets({
        pagination: "current-page",
      });
      if (parsed.verificationStatus !== "verified") {
        return this.stopAtPaginationFailure(
          checkpoint,
          `다음 페이지로 이동했지만 상품목록을 다시 확인하지 못해 작업을 멈췄습니다. ${parsed.note}`,
        );
      }

      const nextTargets = filterSelectedProducts(
        filterNewProducts(parsed.products, knownProductIds),
        checkpoint.selectedProductIds,
      );

      if (nextTargets.length === 0) {
        await this.progressStore.save(
          toProgressSnapshot(
            checkpoint,
            "executing",
            `다음 페이지를 확인했지만 새로 변경할 상품이 없습니다. 계속 다음 페이지를 확인합니다. ${parsed.note}`,
          ),
        );
        continue;
      }

      const extended = appendPaginationTargets(
        checkpoint,
        nextTargets,
        serializeTarget,
        new Date().toISOString(),
      );

      await this.batchStore.save(extended);
      await this.progressStore.save(
        toProgressSnapshot(
          extended,
          "executing",
          `다음 페이지에서 변경 대상 ${nextTargets.length}건을 찾았습니다.`,
        ),
      );
      this.scheduleNavigationToCurrentTarget(extended, policy);
      return extended;
    }

    return this.stopAtPaginationFailure(
      checkpoint,
      "pagination을 너무 많이 넘겨 안전을 위해 작업을 멈췄습니다.",
    );
  }

  private async completeAllPages(
    checkpoint: BatchExecutionCheckpoint,
  ): Promise<BatchExecutionCheckpoint> {
    const completed = completePaginationCheckpoint(
      checkpoint,
      new Date().toISOString(),
    );

    await this.batchStore.save(completed);
    await this.progressStore.save(
      toProgressSnapshot(completed, "idle", ALL_PAGES_COMPLETED_MESSAGE),
    );
    return completed;
  }

  private async stopAtPaginationFailure(
    checkpoint: BatchExecutionCheckpoint,
    message: string,
  ): Promise<BatchExecutionCheckpoint> {
    const stopped = stopPaginationCheckpoint(
      checkpoint,
      message,
      new Date().toISOString(),
    );

    await this.batchStore.save(stopped);
    await this.progressStore.save(toProgressSnapshot(stopped, "stopped", message));
    return stopped;
  }

  private scheduleNavigationToCurrentTarget(
    checkpoint: BatchExecutionCheckpoint,
    policy: RunPolicy,
  ): void {
    const target = checkpoint.targets[checkpoint.currentIndex];
    if (!target?.productId) {
      return;
    }

    this.clearScheduledNavigation();

    this.navigationTimerId = this.windowRef.setTimeout(() => {
      this.navigationTimerId = undefined;
      void this.navigateToCurrentTargetIfStillRunning(policy);
    }, 50);
  }

  private async navigateToCurrentTargetIfStillRunning(policy: RunPolicy): Promise<void> {
    const checkpoint = await this.batchStore.load();
    if (!checkpoint || checkpoint.status !== "running" || checkpoint.stopRequested) {
      if (checkpoint?.stopRequested || checkpoint?.status === "stopped") {
        await this.persistStoppedCheckpoint(checkpoint);
      }
      return;
    }

    const target = checkpoint.targets[checkpoint.currentIndex];
    if (!target) {
      return;
    }

    if (!isProductListUrl(this.gateway.getPageUrl(), checkpoint.searchPageUrl)) {
      this.windowRef.location.assign(checkpoint.searchPageUrl);
      this.resumeTimerId = this.windowRef.setTimeout(() => {
        this.resumeTimerId = undefined;
        void this.continueIfNeeded(policy);
      }, ROUTE_RESUME_DELAY_MS);
      return;
    }

    const opened = await this.parser.openEditForProduct(target.productId);
    if (!opened) {
      await this.markCurrentTargetFailedAndContinue(
        checkpoint,
        target,
        "상품 목록에서 수정 버튼을 찾지 못했습니다. 목록 화면과 검색 결과를 다시 확인해 주세요.",
        policy,
      );
      return;
    }

    const reachedEditPage = await this.waitForEditNavigationAfterOpen();
    this.resumeTimerId = this.windowRef.setTimeout(() => {
      this.resumeTimerId = undefined;
      void this.continueIfNeeded(policy);
    }, reachedEditPage ? 50 : 500);
  }

  private async waitForEditNavigationAfterOpen(): Promise<boolean> {
    const startedAt = Date.now();

    while (Date.now() - startedAt < EDIT_NAVIGATION_TIMEOUT_MS) {
      if (isProductEditUrl(this.gateway.getPageUrl())) {
        return true;
      }

      await delay(this.windowRef, EDIT_NAVIGATION_POLL_MS);
    }

    return isProductEditUrl(this.gateway.getPageUrl());
  }

  private async markCurrentTargetFailedAndContinue(
    checkpoint: BatchExecutionCheckpoint,
    target: PersistedBatchTarget,
    message: string,
    policy: RunPolicy,
  ): Promise<void> {
    const nextCheckpoint: BatchExecutionCheckpoint = {
      ...checkpoint,
      currentIndex: checkpoint.currentIndex + 1,
      updatedAt: new Date().toISOString(),
      consecutiveFailureCount: checkpoint.consecutiveFailureCount + 1,
      results: mergeResults(checkpoint.results, [
        {
          productId: target.productId,
          state: ProductProcessingState.FAILED,
          message,
          retryable: true,
          planNotes: [],
          artifacts: [],
        },
      ]),
    };

    if (nextCheckpoint.currentIndex >= nextCheckpoint.targets.length) {
      nextCheckpoint.status = "completed";
    }

    await this.batchStore.save(nextCheckpoint);
    await this.progressStore.save(
      toProgressSnapshot(
        nextCheckpoint,
        nextCheckpoint.status === "completed" ? "idle" : "executing",
        message,
      ),
    );

    if (nextCheckpoint.status === "running") {
      await this.waitStrategy.throttle(nextCheckpoint.delayMs);
      this.scheduleNavigationToCurrentTarget(nextCheckpoint, policy);
    }
  }

  private clearScheduledNavigation(): void {
    if (this.navigationTimerId !== undefined) {
      this.windowRef.clearTimeout(this.navigationTimerId);
      this.navigationTimerId = undefined;
    }

    if (this.resumeTimerId !== undefined) {
      this.windowRef.clearTimeout(this.resumeTimerId);
      this.resumeTimerId = undefined;
    }
  }

  private async stopIfRequested(
    checkpoint: BatchExecutionCheckpoint,
  ): Promise<BatchExecutionCheckpoint | null> {
    if (checkpoint.stopRequested || checkpoint.status === "stopped") {
      return this.persistStoppedCheckpoint(checkpoint);
    }

    const latest = await this.batchStore.load();
    if (!latest?.stopRequested && latest?.status !== "stopped") {
      return null;
    }

    return this.persistStoppedCheckpoint({
      ...(latest ?? checkpoint),
      results: mergeResults(latest?.results ?? [], checkpoint.results),
      currentIndex: Math.max(latest?.currentIndex ?? 0, checkpoint.currentIndex),
      updatedAt: new Date().toISOString(),
    });
  }

  private async persistStoppedCheckpoint(
    checkpoint: BatchExecutionCheckpoint,
  ): Promise<BatchExecutionCheckpoint> {
    this.clearScheduledNavigation();

    const stopped: BatchExecutionCheckpoint = {
      ...checkpoint,
      status: "stopped",
      stopRequested: true,
      updatedAt: new Date().toISOString(),
    };

    await this.batchStore.save(stopped);
    await this.progressStore.save(
      toProgressSnapshot(stopped, "stopped", "작업이 중단되었습니다."),
    );
    return stopped;
  }
}

function serializeTarget(product: Product): PersistedBatchTarget {
  return {
    productId: product.id.toString(),
    name: product.name,
    channelProductNo: product.channelProductNo,
    originProductNo: product.originProductNo,
    editUrl: product.editUrl,
    rowTextPreview: product.rowTextPreview,
    sourceScope: product.sourceScope,
    sourceVerification: product.sourceVerification,
  };
}

function deserializeTarget(target: PersistedBatchTarget): Product {
  return {
    id: ProductId.create(target.productId),
    name: target.name,
    channelProductNo: target.channelProductNo,
    originProductNo: target.originProductNo,
    editUrl: target.editUrl,
    rowTextPreview: target.rowTextPreview,
    sourceScope: target.sourceScope,
    sourceVerification: target.sourceVerification,
  };
}

function serializeResult(result: {
  productId: ProductId;
  state: ProductProcessingState;
  message: string;
  retryable: boolean;
  plan?: { notes: string[] };
  artifacts: Array<{ kind: "screenshot" | "html" | "log"; path?: string; note: string }>;
}): PersistedProcessingResult {
  return {
    productId: result.productId.toString(),
    state: result.state,
    message: result.message,
    retryable: result.retryable,
    planNotes: result.plan?.notes ?? [],
    artifacts: result.artifacts,
  };
}

function mergeResults(
  previous: PersistedProcessingResult[],
  next: PersistedProcessingResult[],
): PersistedProcessingResult[] {
  const map = new Map(previous.map((entry) => [entry.productId, entry]));
  for (const entry of next) {
    map.set(entry.productId, entry);
  }

  return [...map.values()];
}

function filterSelectedProducts(
  products: Product[],
  selectedProductIds: readonly string[] | undefined,
): Product[] {
  if (!selectedProductIds || selectedProductIds.length === 0) {
    return products;
  }

  const selected = new Set(selectedProductIds.map((productId) => productId.trim()));
  return products.filter((product) => selected.has(product.id.toString()));
}

function toProgressSnapshot(
  checkpoint: BatchExecutionCheckpoint,
  phase: ProgressSnapshot["phase"],
  message?: string,
): ProgressSnapshot {
  const targetIds = new Set(checkpoint.targets.map((target) => target.productId));
  const skippedSucceededCount = checkpoint.results.filter(
    (result) =>
      result.state === ProductProcessingState.SUCCEEDED &&
      !targetIds.has(result.productId),
  ).length;
  const targetCount = checkpoint.targets.length + skippedSucceededCount;
  const defaultMessage = `진행 상황: ${checkpoint.currentIndex}/${checkpoint.targets.length}건 처리`;
  return {
    phase,
    updatedAt: checkpoint.updatedAt,
    targetCount,
    completedCount: checkpoint.results.filter((result) =>
      [
        ProductProcessingState.SUCCEEDED,
        ProductProcessingState.FAILED,
        ProductProcessingState.SKIPPED,
      ].includes(result.state),
    ).length,
    results: checkpoint.results.map((result) => ({
      productId: result.productId,
      state: result.state,
      message: result.message,
    })),
    logs: [
      {
        timestamp: checkpoint.updatedAt,
        level: checkpoint.status === "stopped" ? "warn" : "info",
        message: message ?? defaultMessage,
      },
    ],
  };
}

function buildNavigationMessage(checkpoint: BatchExecutionCheckpoint): string {
  const target = checkpoint.targets[checkpoint.currentIndex];
  return target
    ? `상품 수정 화면으로 이동 중: ${target.productId}`
    : `진행 상황: ${checkpoint.currentIndex}/${checkpoint.targets.length}건 처리`;
}

function isProductListUrl(currentUrl: string, searchPageUrl: string): boolean {
  const normalized = currentUrl.toLowerCase();
  if (normalized.includes("origin-list") || normalized.includes("product-list")) {
    return true;
  }

  return urlsRoughlyEqual(currentUrl, searchPageUrl);
}

function isProductEditUrl(url: string): boolean {
  const normalized = url.toLowerCase();
  return (
    normalized.includes("origin-edit") ||
    normalized.includes("product-edit") ||
    normalized.includes("/edit") ||
    normalized.includes("edit?")
  );
}

function urlsRoughlyEqual(currentUrl: string, targetUrl?: string): boolean {
  if (!targetUrl) {
    return false;
  }

  try {
    const current = new URL(currentUrl);
    const target = new URL(targetUrl, currentUrl);
    return (
      current.origin === target.origin &&
      current.pathname === target.pathname &&
      current.search === target.search &&
      (current.hash || target.hash ? current.hash === target.hash : true)
    );
  } catch {
    return currentUrl === targetUrl;
  }
}

function delay(windowRef: Window, delayMs: number): Promise<void> {
  return new Promise((resolve) => {
    windowRef.setTimeout(resolve, delayMs);
  });
}
