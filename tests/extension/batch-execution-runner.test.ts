import { describe, expect, it, vi } from "vitest";

import type { ProgressSnapshot, ProgressStorePort } from "../../apps/chrome-extension/src/application/index.js";
import {
  DEFAULT_RUN_POLICY,
  ProductId,
  ProductProcessingState,
  type BatchExecutionCheckpoint,
  type Product,
} from "../../apps/chrome-extension/src/domain/index.js";
import {
  BatchExecutionRunner,
  type ChromeBatchStateStore,
  type ProductEditPageDriver,
  type ProductSearchPageParser,
  type SellerCenterPageGateway,
  type WaitStrategy,
} from "../../apps/chrome-extension/src/infrastructure/index.js";

describe("BatchExecutionRunner failure recovery", () => {
  it("returns to the product list and refreshes bundle-delivery targets after a stopped edit flow", async () => {
    const listUrl = "https://sell.smartstore.naver.com/#/products/origin-list";
    let currentUrl = "https://sell.smartstore.naver.com/#/products/origin-edit/111";
    const assignedUrls: string[] = [];
    let checkpoint = createCheckpoint(listUrl);
    let latestProgress: ProgressSnapshot | undefined;

    const parser = {
      prepareBundleDeliverySearchFilters: vi.fn(async () => ({
        changed: false,
        note: "test filters",
      })),
      collectBundleDeliveryTargets: vi.fn(async () => ({
        products: [createProduct("111"), createProduct("222")],
        verificationStatus: "verified" as const,
        note: "verified test products",
      })),
      openEditForProduct: vi.fn(async () => true),
    } as unknown as ProductSearchPageParser;

    const driver = {
      configureRequiredOptions: vi.fn(),
      preparePreorderChangePlan: vi.fn(async () => ({
        productId: ProductId.create("111"),
        dryRun: false,
        targetScope: "bundle-delivery-search-result" as const,
        requestedChanges: {
          productType: "PREORDER" as const,
          orderPeriodEnd: "2027-01-01",
          postPreorderSaleStatus: "ON_SALE" as const,
          dispatchCompletionDueDate: "2027-01-01",
          requiredOption: {
            enabled: true as const,
            type: "SINGLE" as const,
            name: "해외 유통구조상 예약캔슬 불가",
            value: "동의합니다.",
          },
        },
        notes: [],
      })),
      applyPreorderChangePlan: vi.fn(async () => ({
        productId: ProductId.create("111"),
        state: ProductProcessingState.STOPPED,
        message: "저장 완료 후 상품관리 복귀 실패",
        retryable: false,
        artifacts: [],
      })),
    } as unknown as ProductEditPageDriver;

    const progressStore: ProgressStorePort = {
      async load() {
        return latestProgress ?? createEmptyProgress();
      },
      async save(snapshot) {
        latestProgress = snapshot;
      },
      async appendLog() {},
      async reset() {
        latestProgress = createEmptyProgress();
      },
    };

    const batchStore = {
      async load() {
        return checkpoint;
      },
      async save(next: BatchExecutionCheckpoint) {
        checkpoint = next;
      },
      async clear() {
        checkpoint = null as unknown as BatchExecutionCheckpoint;
      },
    } as unknown as ChromeBatchStateStore;

    const gateway = {
      getPageUrl: () => currentUrl,
    } as unknown as SellerCenterPageGateway;

    const waitStrategy = {
      waitForDocumentReady: vi.fn(async () => {}),
      throttle: vi.fn(async () => {}),
    } as unknown as WaitStrategy;

    const windowRef = {
      location: {
        assign: vi.fn((url: string) => {
          assignedUrls.push(url);
          currentUrl = url;
        }),
      },
      setTimeout: vi.fn(() => 1),
      clearTimeout: vi.fn(),
    } as unknown as Window;

    const runner = new BatchExecutionRunner(
      parser,
      driver,
      progressStore,
      batchStore,
      gateway,
      waitStrategy,
      windowRef,
    );

    await runner.continueIfNeeded(DEFAULT_RUN_POLICY);

    expect(checkpoint.status).toBe("running");
    expect(checkpoint.refreshTargetsOnList).toBe(true);
    expect(checkpoint.currentIndex).toBe(1);
    expect(checkpoint.results).toMatchObject([
      {
        productId: "111",
        state: ProductProcessingState.FAILED,
        retryable: true,
      },
    ]);
    expect(assignedUrls).toEqual([listUrl]);

    await runner.continueIfNeeded(DEFAULT_RUN_POLICY);

    expect(parser.prepareBundleDeliverySearchFilters).toHaveBeenCalledTimes(1);
    expect(parser.collectBundleDeliveryTargets).toHaveBeenCalledWith({
      pagination: "current-page",
    });
    expect(checkpoint.refreshTargetsOnList).toBe(false);
    expect(checkpoint.currentIndex).toBe(1);
    expect(checkpoint.targets.map((target) => target.productId)).toEqual(["111", "222"]);
    expect(latestProgress?.logs.at(-1)?.message).toContain("묶음배송 대상 1건을 다시 수집");
  });
});

function createCheckpoint(searchPageUrl: string): BatchExecutionCheckpoint {
  return {
    status: "running",
    mode: "execute",
    searchPageUrl,
    startedAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    currentIndex: 0,
    stopRequested: false,
    delayMs: 0,
    skipSucceeded: true,
    consecutiveFailureCount: 0,
    stopOnConsecutiveFailures: 10,
    targets: [createTarget("111"), createTarget("222")],
    results: [],
  };
}

function createTarget(productId: string) {
  return {
    productId,
    name: `상품 ${productId}`,
    editUrl: `https://sell.smartstore.naver.com/#/products/origin-edit/${productId}`,
    sourceScope: "bundle-delivery-search-result" as const,
    sourceVerification: "verified" as const,
  };
}

function createProduct(productId: string): Product {
  return {
    id: ProductId.create(productId),
    name: `상품 ${productId}`,
    editUrl: `https://sell.smartstore.naver.com/#/products/origin-edit/${productId}`,
    sourceScope: "bundle-delivery-search-result",
    sourceVerification: "verified",
  };
}

function createEmptyProgress(): ProgressSnapshot {
  return {
    phase: "idle",
    updatedAt: new Date(0).toISOString(),
    targetCount: 0,
    completedCount: 0,
    results: [],
    logs: [],
  };
}
