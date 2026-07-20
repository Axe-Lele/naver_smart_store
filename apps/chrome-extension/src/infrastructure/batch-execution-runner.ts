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
  PAGINATION_STOP_PRODUCT_ID,
  MAX_PAGINATION_ADVANCE_ATTEMPTS,
  appendPaginationTargets,
  buildKnownProductIds,
  completePaginationCheckpoint,
  filterNewProducts,
  stopPaginationCheckpoint,
} from "./batch-target-expansion.js";
import { suppressPageLeaveConfirmQuietly } from "./page-leave-confirm-suppressor.js";

// 같은 브라우저 탭 세션 안에서 배치가 실제로 돌고 있음을 나타내는 마커 키.
// sessionStorage 는 탭/브라우저를 닫으면 비워지므로, 배치 진행 중의 페이지 이동
// (마커 있음)과 브라우저를 껐다 켠 경우(마커 없음)를 구분하는 기준이 된다.
const BATCH_SESSION_MARKER_KEY = "wishfigure.batch-session-active";

const EDIT_NAVIGATION_TIMEOUT_MS = 3_500;
const EDIT_NAVIGATION_POLL_MS = 100;
const ROUTE_RESUME_DELAY_MS = 250;

type BatchExecutionOptions = {
  selectedProductIds?: readonly string[];
  requiredOptions?: readonly RequiredOption[];
};

export class BatchExecutionRunner {
  // 이 runner는 확장 프로그램 안에서 동작하는 배치 실행기입니다.
  // 상품목록 DOM을 읽고, 수정 버튼을 누르고, 수정 페이지에서 예약구매를 적용합니다.
  // 브라우저 탭 이동이 섞이기 때문에 매 단계마다 checkpoint를 저장해 중지/새로고침/실패 복구가 가능하게 합니다.
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
    // 운영자가 명시적으로 시작한 배치임을 이 탭 세션에 기록한다.
    this.markBatchSessionActive();

    // 시작 시점에는 반드시 현재 상품목록 화면에서 묶음배송 조건이 검증된 상품만 수집합니다.
    // 여기서 검증에 실패하면 전체 상품을 잘못 건드릴 수 있으므로 실행 자체를 막습니다.
    const parsed = await this.parser.collectBundleDeliveryTargets({
      pagination: "current-page",
    });
    if (parsed.verificationStatus !== "verified") {
      throw new Error(
        `[시작 실패: 상품목록 검증] 실행을 시작하기 전에 현재 상품목록 화면을 검증하지 못했습니다. 검증 결과: ${parsed.note}`,
      );
    }

    const selectedIds = new Set(
      (options.selectedProductIds ?? []).map((productId) => productId.trim()),
    );
    // 운영자가 상품을 직접 선택했다면 선택한 상품만 대상으로 삼고, 아니면 현재 검색 결과 전체를 사용합니다.
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

    // 이어하기 모드에서는 이미 성공한 상품을 targets에 다시 넣지 않습니다.
    // 결과 기록은 보존해서 진행률과 중복 처리 방지에 계속 사용합니다.
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
      // 실패 복구와 다음 페이지 확인은 이 URL을 기준으로 상품관리 목록에 다시 진입합니다.
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
    // 운영자가 명시적으로 이어하기를 실행한 것이므로 이 탭 세션을 활성으로 기록한다.
    this.markBatchSessionActive();
    await this.batchStore.save(checkpoint);
    await this.progressStore.save(
      toProgressSnapshot(checkpoint, "executing", buildNavigationMessage(checkpoint)),
    );
    this.scheduleNavigationToCurrentTarget(checkpoint, DEFAULT_RUN_POLICY);
    return checkpoint;
  }

  public async continueIfNeeded(
    policy: RunPolicy,
    options: { maxResumeAgeMs?: number; requireActiveSession?: boolean } = {},
  ): Promise<BatchExecutionCheckpoint | null> {
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

    // 브라우저(탭)를 껐다 켠 경우에는 이전 작업을 자동으로 이어가지 않는다.
    // 배치 진행 중의 페이지 이동은 같은 탭 세션이라 마커가 남아 있고,
    // 새로 연 브라우저에는 마커가 없다.
    if (options.requireActiveSession && !this.hasActiveBatchSession()) {
      return this.stopWithoutAutoResume(
        checkpoint,
        "브라우저를 새로 연 상태라 이전 예약구매 작업을 자동으로 이어가지 않았습니다. 이어서 하려면 실행 버튼으로 다시 시작해 주세요.",
      );
    }

    // 페이지 로드 시점의 자동 이어하기(autoResumeBatch)에는 신선도 제한도 둔다.
    // 배치가 실제로 돌고 있으면 체크포인트가 몇 초 간격으로 갱신되므로, 오래된
    // running 체크포인트는 비정상 중단(탭 강제 종료, 다이얼로그 멈춤 등)의 잔재다.
    if (options.maxResumeAgeMs !== undefined) {
      const ageMs = Date.now() - Date.parse(checkpoint.updatedAt);
      if (!Number.isFinite(ageMs) || ageMs > options.maxResumeAgeMs) {
        return this.stopWithoutAutoResume(
          checkpoint,
          `이전 예약구매 작업이 약 ${Math.max(1, Math.round(ageMs / 60_000))}분 전 상태로 남아 있어 자동으로 이어가지 않았습니다. 이어서 하려면 실행 버튼으로 다시 시작해 주세요.`,
        );
      }
    }

    this.isRunning = true;
    // 정상적으로 이어가는 경우 세션 마커를 갱신해 다음 페이지 이동에서도 유지되게 한다.
    this.markBatchSessionActive();
    try {
      // Smart Store 화면은 Angular/AG Grid 렌더링이 늦을 수 있어 DOM 준비를 먼저 기다립니다.
      await this.waitStrategy.waitForDocumentReady(8_000);

      const stoppedAfterReady = await this.stopIfRequested(checkpoint);
      if (stoppedAfterReady) {
        return stoppedAfterReady;
      }

      if (checkpoint.refreshTargetsOnList) {
        // 이전 수정/저장 흐름이 목록을 벗어난 상태에서 실패한 경우입니다.
        // AG Grid row-index나 수정 버튼 위치는 화면 이동 후 쉽게 바뀌므로, 기존 위치를 믿지 않고 목록에서 다시 수집합니다.
        return this.refreshTargetsFromCurrentListOrNavigate(checkpoint, policy);
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
        // 아직 수정 페이지가 아니라면 현재 상품의 수정 버튼을 다시 누르도록 예약합니다.
        // 직접 즉시 호출하지 않고 timer를 쓰는 이유는 SPA 라우팅과 DOM 갱신 사이에 한 틱 여유를 주기 위해서입니다.
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
      // 수정 페이지 driver가 실제 예약구매 변경 계획을 만들고, execute 모드에서는 곧바로 적용합니다.
      // 여기서 STOPPED가 나오면 저장 완료/목록 복귀 확인 실패처럼 상품별 복구가 필요한 상태로 봅니다.
      const prepared = await this.driver.preparePreorderChangePlan(product, {
        ...policy,
        dryRun: false,
        requiredOptions: checkpoint.requiredOptions ?? policy.requiredOptions,
      });
      const result =
        "state" in prepared
          ? prepared
          : await this.driver.applyPreorderChangePlan(prepared);

      if (result.state === ProductProcessingState.STOPPED) {
        return this.recoverFromStoppedTarget(checkpoint, currentTarget, result, policy);
      }

      checkpoint.results = mergeResults(checkpoint.results, [serializeResult(result)]);
      checkpoint.currentIndex += 1;
      checkpoint.updatedAt = new Date().toISOString();
      checkpoint.consecutiveFailureCount =
        result.state === ProductProcessingState.SUCCEEDED
          ? 0
          : checkpoint.consecutiveFailureCount + 1;

      const stoppedAfterApply = await this.stopIfRequested(checkpoint);
      if (stoppedAfterApply) {
        return stoppedAfterApply;
      }

      let consecutiveStopMessage: string | undefined;
      if (checkpoint.consecutiveFailureCount >= checkpoint.stopOnConsecutiveFailures) {
        // 같은 유형의 실패가 계속 반복되면 셀렉터 문제나 로그인/권한 문제일 가능성이 높습니다.
        // 이때는 계속 다음 상품으로 넘어가지 않고 운영자가 확인할 수 있게 배치를 멈춥니다.
        checkpoint.status = "stopped";
        checkpoint.stopRequested = true;
        consecutiveStopMessage =
          `[중단: 연속 실패 한도(적용 단계)] ${checkpoint.consecutiveFailureCount}건 연속으로 실패해 작업을 멈췄습니다. ` +
          `마지막 실패 상품: ${currentTarget.productId} / 사유: ${result.message} ${this.describeCurrentPage()}`;
        checkpoint.results = mergeResults(checkpoint.results, [
          {
            productId: currentTarget.productId,
            state: ProductProcessingState.STOPPED,
            message: consecutiveStopMessage,
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
          consecutiveStopMessage,
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

  private async recoverFromStoppedTarget(
    checkpoint: BatchExecutionCheckpoint,
    target: PersistedBatchTarget,
    result: {
      productId: ProductId;
      state: ProductProcessingState;
      message: string;
      retryable: boolean;
      plan?: { notes: string[] };
      artifacts: Array<{ kind: "screenshot" | "html" | "log"; path?: string; note: string }>;
    },
    policy: RunPolicy,
  ): Promise<BatchExecutionCheckpoint> {
    // 상품 하나의 수정/저장/목록복귀 단계가 STOPPED로 끝난 경우의 복구 경로입니다.
    // 전체 배치를 즉시 끝내지 않고 해당 상품은 실패 처리한 뒤, 원래 상품목록 URL로 돌아가 남은 묶음배송 대상을 다시 수집합니다.
    // 단, 이 복구도 연속 실패 횟수에 포함해 최대 10회 이상 반복되지 않게 합니다.
    const recovered: BatchExecutionCheckpoint = {
      ...checkpoint,
      status: "running",
      stopRequested: false,
      refreshTargetsOnList: true,
      currentIndex: checkpoint.currentIndex + 1,
      updatedAt: new Date().toISOString(),
      consecutiveFailureCount: checkpoint.consecutiveFailureCount + 1,
      results: mergeResults(checkpoint.results, [
        {
          ...serializeResult(result),
          state: ProductProcessingState.FAILED,
          retryable: true,
          message: `${result.message} 실패 상품은 건너뛰고 상품목록에서 묶음배송 대상을 다시 수집합니다.`,
        },
      ]),
    };

    // 복구 경로의 중단 메시지에는 어떤 실패가 반복됐는지(마지막 사유)와 당시 화면을
    // 같이 남긴다. "연속 실패" 문구만으로는 적용 단계 중단과 구분이 안 되기 때문.
    const recoveryStopMessage =
      `[중단: 연속 실패 한도(복구 단계)] ${recovered.consecutiveFailureCount}건 연속으로 실패해 작업을 멈췄습니다. ` +
      `마지막 실패 상품: ${target.productId} / 사유: ${result.message} ${this.describeCurrentPage()}`;

    if (recovered.consecutiveFailureCount >= recovered.stopOnConsecutiveFailures) {
      // 복구 가능한 실패라도 지정 횟수를 넘으면 자동화가 같은 화면에서 헤매고 있다는 뜻입니다.
      // refreshTargetsOnList를 끄고 stopped로 저장해 다음 resume이 다시 루프를 만들지 않게 합니다.
      recovered.status = "stopped";
      recovered.stopRequested = true;
      recovered.refreshTargetsOnList = false;
      recovered.results = mergeResults(recovered.results, [
        {
          productId: target.productId,
          state: ProductProcessingState.STOPPED,
          message: recoveryStopMessage,
          retryable: false,
          planNotes: [],
          artifacts: [],
        },
      ]);
    }

    await this.batchStore.save(recovered);
    await this.progressStore.save(
      toProgressSnapshot(
        recovered,
        recovered.status === "stopped" ? "stopped" : "executing",
        recovered.status === "stopped"
          ? recoveryStopMessage
          : `상품 ${target.productId} 처리에 실패했습니다(사유: ${result.message}). 상품목록에서 묶음배송 대상을 다시 수집합니다.`,
      ),
    );

    if (recovered.status === "stopped") {
      return recovered;
    }

    return this.refreshTargetsFromCurrentListOrNavigate(recovered, policy);
  }

  private async refreshTargetsFromCurrentListOrNavigate(
    checkpoint: BatchExecutionCheckpoint,
    policy: RunPolicy,
  ): Promise<BatchExecutionCheckpoint> {
    if (!isProductListUrl(this.gateway.getPageUrl(), checkpoint.searchPageUrl)) {
      // 저장 후 확인 또는 상품관리 복귀가 실패하면 탭은 여전히 수정 페이지에 남아 있을 수 있습니다.
      // 다음 상품을 처리하기 전에 시작 당시 저장해 둔 상품목록 URL로 다시 들어가 안전한 기준점을 회복합니다.
      // 이 복구 이동은 저장 없이 수정 화면을 떠나는 경우라, SPA 이탈 confirm("상세설명
      // 내용이 유실됩니다")이 떠서 탭 전체가 멈출 수 있습니다. 이동 전에 먼저 억제합니다.
      await suppressPageLeaveConfirmQuietly();
      this.windowRef.location.assign(checkpoint.searchPageUrl);
      this.resumeTimerId = this.windowRef.setTimeout(() => {
        this.resumeTimerId = undefined;
        void this.continueIfNeeded(policy);
      }, ROUTE_RESUME_DELAY_MS);

      const returning: BatchExecutionCheckpoint = {
        ...checkpoint,
        refreshTargetsOnList: true,
        updatedAt: new Date().toISOString(),
      };
      await this.batchStore.save(returning);
      await this.progressStore.save(
        toProgressSnapshot(
          returning,
          "executing",
          "실패 후 상품관리 목록으로 돌아가 묶음배송 대상을 다시 수집합니다.",
        ),
      );
      return returning;
    }

    // 상품목록으로 돌아온 뒤에는 날짜/상세검색/묶음배송 가능 조건을 다시 맞춥니다.
    // 필터가 풀린 상태에서 수집하면 전체 상품을 처리할 위험이 있으므로, 검증 실패 시 중단합니다.
    await this.parser.prepareBundleDeliverySearchFilters();
    const parsed = await this.parser.collectBundleDeliveryTargets({
      pagination: "current-page",
    });
    if (parsed.verificationStatus !== "verified") {
      return this.stopAtPaginationFailure(
        checkpoint,
        `[중단: 실패 복구 중 목록 재확인 실패] 실패 후 상품목록으로 돌아왔지만 묶음배송 대상을 다시 확인하지 못해 작업을 멈췄습니다. 검증 결과: ${parsed.note} ${this.describeCurrentPage()}`,
      );
    }

    const processedProductIds = new Set(
      checkpoint.results.map((result) => result.productId),
    );
    // currentIndex 이전 target은 이미 처리했거나 실패 처리한 대상입니다.
    // 재수집 결과에 다시 나타나도 targets 뒤에 중복으로 붙이지 않습니다.
    const processedTargets = checkpoint.targets.slice(0, checkpoint.currentIndex);
    const processedTargetIds = new Set(
      processedTargets.map((target) => target.productId),
    );
    const refreshedTargets = filterSelectedProducts(
      parsed.products,
      checkpoint.selectedProductIds,
    )
      .filter((product) => !processedProductIds.has(product.id.toString()))
      .filter((product) => !processedTargetIds.has(product.id.toString()))
      .map((product) => serializeTarget(product));

    const refreshed: BatchExecutionCheckpoint = {
      ...checkpoint,
      status: "running",
      stopRequested: false,
      refreshTargetsOnList: false,
      currentIndex: processedTargets.length,
      targets: [...processedTargets, ...refreshedTargets],
      updatedAt: new Date().toISOString(),
    };

    await this.batchStore.save(refreshed);
    await this.progressStore.save(
      toProgressSnapshot(
        refreshed,
        "executing",
        refreshedTargets.length > 0
          ? `상품목록에서 묶음배송 대상 ${refreshedTargets.length}건을 다시 수집했습니다.`
          : "상품목록에서 새 묶음배송 대상이 없어 다음 페이지를 확인합니다.",
      ),
    );

    if (refreshed.currentIndex >= refreshed.targets.length) {
      return this.extendFromNextResultPageOrComplete(refreshed, policy);
    }

    this.scheduleNavigationToCurrentTarget(refreshed, policy);
    return refreshed;
  }

  private async extendFromNextResultPageOrComplete(
    checkpoint: BatchExecutionCheckpoint,
    policy: RunPolicy,
  ): Promise<BatchExecutionCheckpoint> {
    if (!isProductListUrl(this.gateway.getPageUrl(), checkpoint.searchPageUrl)) {
      // 현재 페이지의 대상이 끝났는데 수정 화면에 남아 있다면, 다음 페이지 버튼을 누르기 전에 목록으로 돌아갑니다.
      // 저장하지 않은 수정 화면이면 SPA 이탈 confirm 이 탭을 멈출 수 있어 먼저 억제합니다.
      await suppressPageLeaveConfirmQuietly();
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

    // 현재 페이지에서 더 처리할 상품이 없으면 AG Grid pagination의 다음 페이지를 확인합니다.
    // 페이지 이동이 비정상적으로 반복되는 상황을 막기 위해 batch-target-expansion의 제한 횟수까지만 시도합니다.
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
          `[중단: 다음 페이지 확인 실패] 다음 페이지(${attempt + 1}번째 넘김)로 이동했지만 상품목록을 다시 확인하지 못해 작업을 멈췄습니다. 검증 결과: ${parsed.note} ${this.describeCurrentPage()}`,
        );
      }

      const nextTargets = filterSelectedProducts(
        filterNewProducts(parsed.products, knownProductIds),
        checkpoint.selectedProductIds,
      );

      if (nextTargets.length === 0) {
        // 다음 페이지가 있어도 이미 처리한 상품뿐이면 계속 넘깁니다.
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
      `[중단: 페이지 넘김 한도] 새로 변경할 상품 없이 다음 페이지를 ${MAX_PAGINATION_ADVANCE_ATTEMPTS}번 연속 넘겨 안전을 위해 작업을 멈췄습니다. 선택한 상품이 검색 결과에 더 이상 없거나, 이미 모두 처리된 상태일 수 있습니다. ${this.describeCurrentPage()}`,
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
      toProgressSnapshot(completed, "idle", buildCompletionMessage(completed)),
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

    // 수정 버튼 클릭은 DOM 갱신 직후 바로 실행하면 실패할 수 있어 짧은 timer 뒤에 수행합니다.
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
      // 수정 페이지나 다른 라우트에 있다면 먼저 목록 URL로 복귀하고, 복귀 후 continueIfNeeded가 다시 이어갑니다.
      // 저장하지 않은 수정 화면일 수 있어 SPA 이탈 confirm 을 먼저 억제합니다.
      await suppressPageLeaveConfirmQuietly();
      this.windowRef.location.assign(checkpoint.searchPageUrl);
      this.resumeTimerId = this.windowRef.setTimeout(() => {
        this.resumeTimerId = undefined;
        void this.continueIfNeeded(policy);
      }, ROUTE_RESUME_DELAY_MS);
      return;
    }

    const opened = await this.parser.openEditForProduct(target.productId);
    if (!opened) {
      // 목록에는 왔지만 해당 상품의 수정 버튼을 못 찾은 경우입니다.
      // 검색 조건/권한/페이지 렌더링 문제일 수 있어 해당 상품만 실패 처리하고 다음 대상으로 넘어갑니다.
      await this.markCurrentTargetFailedAndContinue(
        checkpoint,
        target,
        `[실패: 수정 버튼 찾기] 상품 ${target.productId}의 수정 버튼을 상품 목록에서 찾지 못했습니다. 목록 화면과 검색 결과를 다시 확인해 주세요. ${this.describeCurrentPage()}`,
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

    // 수정 버튼 클릭 후 SPA 라우팅이 완료될 때까지 짧은 간격으로 URL을 확인합니다.
    // timeout 후에도 수정 URL이 아니면 continueIfNeeded가 다시 현재 상태를 보고 복구합니다.
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
    // 상품목록에서 수정 버튼을 못 여는 실패는 저장 실패와 달리 목록 기준점이 이미 유지된 상태입니다.
    // 그래서 목록 재수집 대신 현재 target만 실패로 기록하고 다음 target으로 이동합니다.
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

  // 중단/실패 메시지 끝에 붙여, 실패한 순간 탭이 어떤 화면에 있었는지 바로 알 수 있게 한다.
  // 장시간 배치 중 세션이 만료되면 로그인 화면으로 튕기는데, 그 경우를 URL로 구분해준다.
  // 배치가 이 탭 세션에서 실제로 시작/진행 중임을 기록한다. 탭을 닫으면 사라진다.
  private markBatchSessionActive(): void {
    try {
      this.windowRef.sessionStorage.setItem(
        BATCH_SESSION_MARKER_KEY,
        new Date().toISOString(),
      );
    } catch {
      // sessionStorage 접근이 막힌 환경이면 마커 없이 동작한다(자동 이어하기 안 함).
    }
  }

  private hasActiveBatchSession(): boolean {
    try {
      return this.windowRef.sessionStorage.getItem(BATCH_SESSION_MARKER_KEY) !== null;
    } catch {
      return false;
    }
  }

  // 자동 이어하기를 하지 않기로 판단한 running 체크포인트를 중단 상태로 정리한다.
  private async stopWithoutAutoResume(
    checkpoint: BatchExecutionCheckpoint,
    message: string,
  ): Promise<BatchExecutionCheckpoint> {
    const stopped: BatchExecutionCheckpoint = {
      ...checkpoint,
      status: "stopped",
      stopRequested: true,
      updatedAt: new Date().toISOString(),
    };
    await this.batchStore.save(stopped);
    await this.progressStore.save(toProgressSnapshot(stopped, "stopped", message));
    return stopped;
  }

  private describeCurrentPage(): string {
    const url = this.gateway.getPageUrl();
    const looksLikeLoginPage = /login|logout|auth|nid\.naver|sso/i.test(url);
    return looksLikeLoginPage
      ? `(당시 화면: ${url} — 로그인 화면으로 보입니다. 세션이 만료되었을 가능성이 높습니다. 다시 로그인한 뒤 이어하기를 눌러 주세요.)`
      : `(당시 화면: ${url})`;
  }

  private clearScheduledNavigation(): void {
    // 중지/재시작/복구 시 이전 timer가 남아 있으면 같은 상품을 두 번 열 수 있어 항상 정리합니다.
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
    // 실행 중 사용자가 중지 버튼을 누르면 storage의 최신 checkpoint와 현재 메모리 상태를 합쳐 저장합니다.
    // 이렇게 해야 버튼을 누른 직후 처리된 결과가 사라지지 않습니다.
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

// 완료 요약 메시지. 실패한 상품이 있으면 "다 바꿨습니다"라고 말하지 않고,
// 실패 건수와 상품번호를 그대로 보여준다. 실패 상품은 같은 조건으로 다시 실행하면
// (성공한 상품은 체크포인트 덕에 건너뛰므로) 실패분만 재시도된다.
function buildCompletionMessage(checkpoint: BatchExecutionCheckpoint): string {
  const productResults = checkpoint.results.filter(
    (result) => result.productId !== PAGINATION_STOP_PRODUCT_ID,
  );
  const succeededCount = productResults.filter(
    (result) => result.state === ProductProcessingState.SUCCEEDED,
  ).length;
  const failedResults = productResults.filter(
    (result) =>
      result.state === ProductProcessingState.FAILED ||
      result.state === ProductProcessingState.STOPPED,
  );

  if (failedResults.length === 0) {
    return ALL_PAGES_COMPLETED_MESSAGE;
  }

  const failedIdsPreview = failedResults
    .slice(0, 10)
    .map((result) => result.productId)
    .join(", ");
  const overflowNote = failedResults.length > 10 ? ` 외 ${failedResults.length - 10}건` : "";
  return (
    `모든 페이지를 확인했지만 ${failedResults.length}건은 변경하지 못했습니다 (성공 ${succeededCount}건). ` +
    `실패 상품번호: ${failedIdsPreview}${overflowNote}. ` +
    `같은 조건으로 다시 실행하면 성공한 상품은 건너뛰고 실패한 상품만 재시도합니다.`
  );
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
  // 진행률 분모(전체 대상 수):
  // - 운영자가 상품을 선택해 시작한 배치면 "선택한 전체 건수"가 분모다.
  //   targets 는 페이지를 넘기며 점진적으로 늘어나므로(첫 페이지 100건씩),
  //   targets 길이를 그대로 쓰면 1,039건 선택에도 "4/100 · 남은 96" 처럼 보인다.
  // - 선택 없이 시작한 배치(검색 결과 전체)는 끝까지 가봐야 총량을 알 수 있어
  //   기존처럼 지금까지 수집된 targets 기준으로 표시한다.
  const targetCount = checkpoint.selectedProductIds?.length
    ? checkpoint.selectedProductIds.length
    : checkpoint.targets.length + skippedSucceededCount;
  const completedCount = checkpoint.results.filter((result) =>
    [
      ProductProcessingState.SUCCEEDED,
      ProductProcessingState.FAILED,
      ProductProcessingState.SKIPPED,
    ].includes(result.state),
  ).length;
  const defaultMessage = `진행 상황: 전체 ${targetCount}건 중 ${completedCount}건 완료`;
  return {
    phase,
    updatedAt: checkpoint.updatedAt,
    targetCount,
    completedCount,
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
  const totalCount = checkpoint.selectedProductIds?.length
    ? checkpoint.selectedProductIds.length
    : checkpoint.targets.length;
  const completedCount = checkpoint.results.filter((result) =>
    [
      ProductProcessingState.SUCCEEDED,
      ProductProcessingState.FAILED,
      ProductProcessingState.SKIPPED,
    ].includes(result.state),
  ).length;
  return target
    ? `상품 수정 화면으로 이동 중: ${target.productId} (전체 ${totalCount}건 중 ${completedCount}건 완료)`
    : `진행 상황: 전체 ${totalCount}건 중 ${completedCount}건 완료`;
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
