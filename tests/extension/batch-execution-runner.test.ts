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

  // 비정상 중단(탭 강제 종료 등)으로 running 상태가 남은 오래된 체크포인트는,
  // 작업 브라우저를 새로 여는 순간 자동으로 이어지면 안 된다.
  it("does not auto-resume a stale running checkpoint when maxResumeAgeMs is set", async () => {
    const listUrl = "https://sell.smartstore.naver.com/#/products/origin-list";
    // updatedAt이 1970년(대과거)인 running 체크포인트.
    let checkpoint = createCheckpoint(listUrl);
    let latestProgress: ProgressSnapshot | undefined;

    const parser = {
      openEditForProduct: vi.fn(async () => true),
    } as unknown as ProductSearchPageParser;
    const driver = {
      configureRequiredOptions: vi.fn(),
    } as unknown as ProductEditPageDriver;
    const progressStore: ProgressStorePort = {
      async load() {
        return latestProgress ?? createEmptyProgress();
      },
      async save(snapshot) {
        latestProgress = snapshot;
      },
      async appendLog() {},
      async reset() {},
    };
    const batchStore = {
      async load() {
        return checkpoint;
      },
      async save(next: BatchExecutionCheckpoint) {
        checkpoint = next;
      },
      async clear() {},
    } as unknown as ChromeBatchStateStore;
    const gateway = {
      getPageUrl: () => listUrl,
    } as unknown as SellerCenterPageGateway;
    const waitStrategy = {
      waitForDocumentReady: vi.fn(async () => {}),
      throttle: vi.fn(async () => {}),
    } as unknown as WaitStrategy;
    const windowRef = {
      location: { assign: vi.fn() },
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

    const result = await runner.continueIfNeeded(DEFAULT_RUN_POLICY, {
      maxResumeAgeMs: 10 * 60_000,
    });

    expect(result?.status).toBe("stopped");
    expect(checkpoint.status).toBe("stopped");
    expect(waitStrategy.waitForDocumentReady).not.toHaveBeenCalled();
    expect(latestProgress?.phase).toBe("stopped");
    expect(latestProgress?.logs.at(-1)?.message).toContain("자동으로 이어가지 않았습니다");

    // 신선도 제한이 없으면(배치 진행 중 페이지 이동) 기존 동작을 유지해야 하므로,
    // 방금 갱신된 체크포인트는 제한이 있어도 이어서 실행돼야 한다.
    checkpoint = { ...createCheckpoint(listUrl), updatedAt: new Date().toISOString() };
    const resumed = await runner.continueIfNeeded(DEFAULT_RUN_POLICY, {
      maxResumeAgeMs: 10 * 60_000,
    });
    expect(resumed?.status).toBe("running");
  });

  // 브라우저(탭)를 껐다 켜면 세션 마커가 사라지므로, 신선한 running 체크포인트라도
  // 자동으로 이어가면 안 된다. 마커가 살아 있는(같은 세션) 경우에만 이어간다.
  it("does not auto-resume after a browser restart when requireActiveSession is set", async () => {
    const listUrl = "https://sell.smartstore.naver.com/#/products/origin-list";
    let sessionMarker: string | null = null;
    let checkpoint: BatchExecutionCheckpoint = {
      ...createCheckpoint(listUrl),
      updatedAt: new Date().toISOString(),
    };
    let latestProgress: ProgressSnapshot | undefined;

    const parser = {
      openEditForProduct: vi.fn(async () => true),
    } as unknown as ProductSearchPageParser;
    const driver = {
      configureRequiredOptions: vi.fn(),
    } as unknown as ProductEditPageDriver;
    const progressStore: ProgressStorePort = {
      async load() {
        return latestProgress ?? createEmptyProgress();
      },
      async save(snapshot) {
        latestProgress = snapshot;
      },
      async appendLog() {},
      async reset() {},
    };
    const batchStore = {
      async load() {
        return checkpoint;
      },
      async save(next: BatchExecutionCheckpoint) {
        checkpoint = next;
      },
      async clear() {},
    } as unknown as ChromeBatchStateStore;
    const gateway = {
      getPageUrl: () => listUrl,
    } as unknown as SellerCenterPageGateway;
    const waitStrategy = {
      waitForDocumentReady: vi.fn(async () => {}),
      throttle: vi.fn(async () => {}),
    } as unknown as WaitStrategy;
    const windowRef = {
      location: { assign: vi.fn() },
      setTimeout: vi.fn(() => 1),
      clearTimeout: vi.fn(),
      sessionStorage: {
        getItem: vi.fn(() => sessionMarker),
        setItem: vi.fn((_key: string, value: string) => {
          sessionMarker = value;
        }),
      },
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

    // 새로 연 브라우저: 마커 없음 → 신선한 체크포인트여도 자동 이어하기 금지.
    const blocked = await runner.continueIfNeeded(DEFAULT_RUN_POLICY, {
      maxResumeAgeMs: 10 * 60_000,
      requireActiveSession: true,
    });
    expect(blocked?.status).toBe("stopped");
    expect(latestProgress?.logs.at(-1)?.message).toContain("브라우저를 새로 연 상태");

    // 같은 세션에서 배치가 진행 중(마커 있음)이면 이어서 실행돼야 한다.
    sessionMarker = new Date().toISOString();
    checkpoint = { ...createCheckpoint(listUrl), updatedAt: new Date().toISOString() };
    const resumed = await runner.continueIfNeeded(DEFAULT_RUN_POLICY, {
      maxResumeAgeMs: 10 * 60_000,
      requireActiveSession: true,
    });
    expect(resumed?.status).toBe("running");
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
