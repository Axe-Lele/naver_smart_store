// Path: C:\smart-store\apps\chrome-extension\src\presentation\content\content-script.ts
import {
  CollectTargetProductsUseCase,
  ExecuteDryRunUseCase,
  InspectDomUseCase,
  type ProgressSnapshot,
} from "../../application/index.js";
import {
  BatchExecutionRunner,
  BrowserLogger,
  buildExtensionSettings,
  ChromeBatchStateStore,
  ChromeProgressStore,
  CurrentPageTypeDetector,
  defaultExtensionSettings,
  DomExplorer,
  ElectronBridgeClient,
  InMemorySelectorRegistry,
  ProductEditPageDriver,
  ProductEditPageParser,
  ProductSearchPageParser,
  SellerCenterPageGateway,
  SelectorInspectionReporter,
  UiMaxDateResolver,
  WaitStrategy,
  toRunPolicy,
} from "../../infrastructure/index.js";
import {
  isWorkBrowserProfile,
  markWorkBrowserProfile,
} from "../../infrastructure/work-browser-flag.store.js";
import type { RequiredOption } from "../../domain/index.js";
import type { CommandResponse, ContentCommand } from "../messages.js";

const logger = new BrowserLogger("extension-content");
const progressStore = new ChromeProgressStore(
  defaultExtensionSettings.progressStorageKey,
);
const batchStore = new ChromeBatchStateStore(
  defaultExtensionSettings.batchStorageKey,
);
const selectorRegistry = new InMemorySelectorRegistry();
const gateway = new SellerCenterPageGateway(window, document);
const explorer = new DomExplorer(document);
const detector = new CurrentPageTypeDetector(gateway);
const waitStrategy = new WaitStrategy(window, document);
const dateResolver = new UiMaxDateResolver(selectorRegistry, document, window);
const parser = new ProductSearchPageParser(
  gateway,
  selectorRegistry,
  explorer,
  document,
  window,
);
const editParser = new ProductEditPageParser(explorer, selectorRegistry);
const driver = new ProductEditPageDriver(
  gateway,
  selectorRegistry,
  dateResolver,
  document,
  window,
  undefined,
  requestPageTimeClick,
  requestPagePreorderDisclosureClick,
  requestPagePreorderEnabledClick,
  requestPageOrderStartCalendarClick,
  requestPageOrderStartCurrentDayClick,
  requestPageOrderStartCurrentHourClick,
  requestPageOrderEndCalendarClick,
  requestPageOrderEndYearNextClick,
  requestPageOrderEndLastEnabledDayClick,
  requestPageOrderEndLastEnabledHourClick,
  requestPageAfterSaleStatusOnClick,
  requestPageDispatchCompletionCalendarClick,
  requestPageDispatchCompletionYearNextClick,
  requestPageDispatchCompletionMonthNextClick,
  requestPageDispatchCompletionLastEnabledDayClick,
  requestPageOptionMenuToggleClick,
  requestPageChoiceTypeOnClick,
  requestPageChoiceSimpleTypeClick,
  requestPageChoiceOptionNameFill,
  requestPageChoiceOptionValueFill,
  requestPageOptionListApplyClick,
  requestPageSaveButtonClick,
);
const reportReader = new SelectorInspectionReporter(
  gateway,
  selectorRegistry,
  explorer,
);
const collector = new CollectTargetProductsUseCase(parser, logger);
const dryRun = new ExecuteDryRunUseCase(collector, progressStore, logger);
const inspectDom = new InspectDomUseCase(
  detector,
  parser,
  editParser,
  reportReader,
  progressStore,
  logger,
);
const batchRunner = new BatchExecutionRunner(
  parser,
  driver,
  progressStore,
  batchStore,
  gateway,
  waitStrategy,
  window,
);
const bridgeClient = new ElectronBridgeClient(
  defaultExtensionSettings.hybridBridgeUrl,
  gateway,
  progressStore,
  logger,
  (type, payload) => executeBridgeCommand(type, payload),
  window,
  isWorkBrowserProfile,
);

type BridgeCommandPayload = {
  selectedProductIds?: readonly string[];
  preorderRequiredOptions?: readonly RequiredOption[];
};

function settingsFromPayload(payload?: BridgeCommandPayload) {
  return buildExtensionSettings({
    requiredOptions: payload?.preorderRequiredOptions
      ? [...payload.preorderRequiredOptions]
      : defaultExtensionSettings.requiredOptions,
  });
}

chrome.runtime.onMessage.addListener(
  (message: ContentCommand, _sender, sendResponse: (response: CommandResponse) => void) => {
    void handleContentCommand(message)
      .then(sendResponse)
      .catch((error: unknown) => {
        const description = error instanceof Error ? error.message : "Unknown error";
        sendResponse({
          ok: false,
          message: description,
        });
      });

    return true;
  },
);

// 데스크톱이 띄운 작업용 브라우저 표식(wfWorkBrowser=1)을 확인하면 이 프로필을
// 작업용으로 영구 기록한다. 개인 크롬에는 이 마커가 갈 일이 없으므로, 개인 크롬의
// 판매자센터 탭이 하이브리드 브리지에 붙어 상품을 긁어오는 사고를 막는다.
if (new URLSearchParams(window.location.search).get("wfWorkBrowser") === "1") {
  void markWorkBrowserProfile();
}

bridgeClient.start();
window.addEventListener("pagehide", () => bridgeClient.stop(), { once: true });
void autoResumeBatch();

// 수집(collect-targets)이 진행 중인지 여부. 최소화 자동 복원 판단에 쓴다.
let collectInProgress = false;

// 작업(수집/배치) 중 창이 최소화되면 페이지가 hidden 상태가 되어 AG Grid 렌더링과
// requestAnimationFrame 이 멈추고 자동화가 조용히 실패한다. 백그라운드 스로틀링
// 방지 플래그로도 '최소화'만은 못 막으므로, 감지 즉시 background 에 창 복원을
// 요청한다 (포커스는 빼앗지 않는다). 작업이 없을 때의 최소화는 그대로 둔다.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "hidden") {
    return;
  }

  void (async () => {
    try {
      if (!collectInProgress) {
        const checkpoint = await batchStore.load();
        if (checkpoint?.status !== "running") {
          return;
        }
      }
      const response = await chrome.runtime.sendMessage({
        type: "content/restore-batch-window",
      });
      if (response?.ok) {
        logger.info("작업 중 최소화를 감지해 작업 창을 복원했습니다.");
      }
    } catch (error) {
      logger.debug("작업 창 복원 요청을 보내지 못했습니다.", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  })();
});

async function handleContentCommand(
  message: ContentCommand,
): Promise<CommandResponse> {
  const response = await executeBridgeCommand(toBridgeCommandType(message));
  await flushBridgeQuietly();
  return response;
}

async function buildSnapshot(
  targetCount: number,
  message: string,
): Promise<ProgressSnapshot> {
  const updatedAt = new Date().toISOString();
  return {
    phase: "collecting",
    updatedAt,
    targetCount,
    completedCount: 0,
    results: [],
    logs: [
      {
        timestamp: updatedAt,
        level: "info" as const,
        message,
      },
    ],
  };
}

async function requestPageTimeClick(input: {
  label: string;
  preference: "earliest" | "latest";
}): Promise<boolean> {
  const response = await chrome.runtime.sendMessage({
    type: "content/click-page-time-option",
    label: input.label,
    preference: input.preference,
  });

  return Boolean(response?.ok);
}

async function requestPagePreorderDisclosureClick(): Promise<boolean> {
  const response = await chrome.runtime.sendMessage({
    type: "content/click-page-preorder-disclosure",
  });

  return Boolean(response?.ok);
}

async function requestPagePreorderEnabledClick(): Promise<boolean> {
  const response = await chrome.runtime.sendMessage({
    type: "content/click-page-preorder-enabled",
  });

  return Boolean(response?.ok);
}

async function requestPageOrderStartCalendarClick(): Promise<boolean> {
  const response = await chrome.runtime.sendMessage({
    type: "content/click-page-order-start-calendar",
  });

  return Boolean(response?.ok);
}

async function requestPageOrderStartCurrentDayClick(): Promise<boolean> {
  const response = await chrome.runtime.sendMessage({
    type: "content/click-page-order-start-current-day",
  });

  return Boolean(response?.ok);
}

async function requestPageOrderStartCurrentHourClick(): Promise<boolean> {
  const response = await chrome.runtime.sendMessage({
    type: "content/click-page-order-start-current-hour",
  });

  return Boolean(response?.ok);
}

async function requestPageOrderEndCalendarClick(): Promise<boolean> {
  const response = await chrome.runtime.sendMessage({
    type: "content/click-page-order-end-calendar",
  });

  return Boolean(response?.ok);
}

async function requestPageOrderEndYearNextClick(): Promise<boolean> {
  const response = await chrome.runtime.sendMessage({
    type: "content/click-page-order-end-year-next",
  });

  return Boolean(response?.ok);
}

async function requestPageOrderEndLastEnabledDayClick(): Promise<boolean> {
  const response = await chrome.runtime.sendMessage({
    type: "content/click-page-order-end-last-enabled-day",
  });

  return Boolean(response?.ok);
}

async function requestPageOrderEndLastEnabledHourClick(): Promise<boolean> {
  const response = await chrome.runtime.sendMessage({
    type: "content/click-page-order-end-last-enabled-hour",
  });

  return Boolean(response?.ok);
}

async function requestPageAfterSaleStatusOnClick(): Promise<boolean> {
  const response = await chrome.runtime.sendMessage({
    type: "content/click-page-after-sale-status-on",
  });

  return Boolean(response?.ok);
}

async function requestPageDispatchCompletionCalendarClick(): Promise<boolean> {
  const response = await chrome.runtime.sendMessage({
    type: "content/click-page-dispatch-completion-calendar",
  });

  return Boolean(response?.ok);
}

async function requestPageDispatchCompletionYearNextClick(): Promise<boolean> {
  const response = await chrome.runtime.sendMessage({
    type: "content/click-page-dispatch-completion-year-next",
  });

  return Boolean(response?.ok);
}

async function requestPageDispatchCompletionMonthNextClick(): Promise<boolean> {
  const response = await chrome.runtime.sendMessage({
    type: "content/click-page-dispatch-completion-month-next",
  });

  return Boolean(response?.ok);
}

async function requestPageDispatchCompletionLastEnabledDayClick(): Promise<boolean> {
  const response = await chrome.runtime.sendMessage({
    type: "content/click-page-dispatch-completion-last-enabled-day",
  });

  return Boolean(response?.ok);
}

async function requestPageOptionMenuToggleClick(): Promise<boolean> {
  const response = await chrome.runtime.sendMessage({
    type: "content/click-page-option-menu-toggle",
  });

  return Boolean(response?.ok);
}

async function requestPageChoiceTypeOnClick(): Promise<boolean> {
  const response = await chrome.runtime.sendMessage({
    type: "content/click-page-choice-type-on",
  });

  return Boolean(response?.ok);
}

async function requestPageChoiceSimpleTypeClick(): Promise<boolean> {
  const response = await chrome.runtime.sendMessage({
    type: "content/click-page-choice-simple-type",
  });

  return Boolean(response?.ok);
}

async function requestPageChoiceOptionNameFill(input: {
  value: string;
  index: number;
}): Promise<boolean> {
  const response = await chrome.runtime.sendMessage({
    type: "content/fill-page-choice-option-name",
    value: input.value,
    index: input.index,
  });

  return Boolean(response?.ok);
}

async function requestPageChoiceOptionValueFill(input: {
  value: string;
  index: number;
}): Promise<boolean> {
  const response = await chrome.runtime.sendMessage({
    type: "content/fill-page-choice-option-value",
    value: input.value,
    index: input.index,
  });

  return Boolean(response?.ok);
}

async function requestPageOptionListApplyClick(): Promise<boolean> {
  const response = await chrome.runtime.sendMessage({
    type: "content/click-page-option-list-apply",
  });

  return Boolean(response?.ok);
}

async function requestPageSaveButtonClick(): Promise<boolean> {
  const response = await chrome.runtime.sendMessage({
    type: "content/click-page-save-button",
  });

  return Boolean(response?.ok);
}

// 페이지 로드 시 자동 이어하기가 허용되는 체크포인트 최대 나이.
// 배치 실행 중에는 체크포인트가 몇 초 간격으로 갱신되므로 10분이면 충분히 여유 있다.
// 이보다 오래된 running 체크포인트는 비정상 중단의 잔재로 보고 자동 재개하지 않는다.
const AUTO_RESUME_MAX_AGE_MS = 10 * 60_000;

async function autoResumeBatch(): Promise<void> {
  try {
    await batchRunner.continueIfNeeded(toRunPolicy(defaultExtensionSettings, false), {
      maxResumeAgeMs: AUTO_RESUME_MAX_AGE_MS,
      // 브라우저(탭)를 껐다 켠 경우에는 이전 작업을 자동으로 이어가지 않는다.
      requireActiveSession: true,
    });
  } catch (error) {
    logger.error("Automatic batch resume failed", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }

  await flushBridgeQuietly();
}

// background 가 응답을 아예 안 주면(구버전 service worker 가 새 명령을 몰라서
// undefined 를 반환하는 경우가 대표적) 그 정황을 그대로 알려준다. 언팩 확장은
// content script 는 디스크에서 새로 읽지만 service worker 는 브라우저를 재시작해야
// 갱신되기 때문에, 파일만 교체된 상태에서 신·구버전이 섞일 수 있다.
function describeWindowCommandFailure(response: { message?: string } | undefined): string {
  if (response?.message) {
    return response.message;
  }
  return "브라우저 확장이 아직 이전 버전으로 실행 중일 수 있습니다. 데스크톱 앱의 '작업용 브라우저 열기'로 브라우저를 다시 시작해 주세요.";
}

// Chromium 전용 확장 속성(availLeft/availTop). 표준 DOM 타입에는 없어 직접 캐스팅한다.
type ChromiumScreen = Screen & { availLeft?: number; availTop?: number };

// 보조 모니터의 원점(availLeft/availTop)을 읽는다. 화면 좌표는 모니터 여러 대가
// 이어붙은 절대 좌표계라 보조 모니터는 원점이 (0,0)이 아닐 수 있다. 이 값 없이
// availWidth/availHeight 만으로 계산하면 주 모니터 기준 좌표가 나와 버려서
// chrome.windows.update 가 "50% 이상 보이지 않는 bounds" 로 거부한다.
function screenOrigin(windowRef: Window): { left: number; top: number } {
  const screen = windowRef.screen as ChromiumScreen;
  return {
    left: screen.availLeft ?? 0,
    top: screen.availTop ?? 0,
  };
}

// 축소 창 크기: 화면 우측 하단에 붙는 420×320. 보이는 상태를 유지해 자동화가 계속 돈다.
function computeShrunkWindowBounds(windowRef: Window): {
  left: number;
  top: number;
  width: number;
  height: number;
} {
  const width = 420;
  const height = 320;
  const origin = screenOrigin(windowRef);
  return {
    width,
    height,
    left: origin.left + Math.max(0, (windowRef.screen.availWidth || width) - width - 16),
    top: origin.top + Math.max(0, (windowRef.screen.availHeight || height) - height - 16),
  };
}

// 복원 크기: 데스크톱이 처음 띄우는 컴팩트 작업 창(1000×750)을 화면 중앙에 되돌린다.
function computeRestoredWindowBounds(windowRef: Window): {
  left: number;
  top: number;
  width: number;
  height: number;
} {
  const width = 1000;
  const height = 750;
  const origin = screenOrigin(windowRef);
  return {
    width,
    height,
    left: origin.left + Math.max(0, Math.round(((windowRef.screen.availWidth || width) - width) / 2)),
    top: origin.top + Math.max(0, Math.round(((windowRef.screen.availHeight || height) - height) / 2)),
  };
}

async function flushBridgeQuietly(): Promise<void> {
  try {
    await bridgeClient.flush();
  } catch (error) {
    logger.debug("Desktop bridge sync skipped.", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function executeBridgeCommand(
  type:
    | "check-surface"
    | "run-dom-inspection"
    | "collect-targets"
    | "run-dry-run"
    | "start-batch"
    | "resume-batch"
    | "stop-batch"
    | "shrink-work-window"
    | "restore-work-window",
  payload?: BridgeCommandPayload,
): Promise<CommandResponse> {
  switch (type) {
    case "check-surface":
      return {
        ok: gateway.isSellerCenterSurface(),
        message: gateway.isSellerCenterSurface()
          ? "판매자센터 상품 화면이 연결되었습니다."
          : "Chrome에서 스마트스토어 판매자센터 상품 조회/수정 화면을 열어 주세요.",
        details: {
          url: gateway.getPageUrl(),
          title: gateway.getPageTitle(),
        },
      };
    case "run-dom-inspection": {
      const inspection = await inspectDom.execute();
      return {
        ok: true,
        message: "현재 화면 구조 점검을 완료했습니다.",
        progress: inspection.progress,
        selectorReport: inspection.report,
        selectorReportText: inspection.reportText,
        pageDraft: inspection.pageDraft,
        details: {
          detection: inspection.detection,
        },
      };
    }
    case "collect-targets": {
      // 이전 수집/작업의 진행 스냅샷이 남아 있으면 새 수집 시작 직후 잘못된 건수가
      // 보일 수 있어, 0건 상태로 초기화하고 바로 알린다.
      await progressStore.save(await buildSnapshot(0, "상품 수집을 시작합니다."));
      await flushBridgeQuietly();
      collectInProgress = true;
      let collected!: Awaited<ReturnType<typeof collector.execute>>;
      try {
        collected = await collector.execute({
        // 페이지 하나를 읽을 때마다 progress 저장소에 누적 건수를 남긴다.
        // 실행 중 하트비트가 이 스냅샷을 데스크톱에 실어 보내 "몇 건 읽었는지"가
        // 불러오기 모달에 실시간으로 표시된다.
        onPageCollected: async ({ pageIndex, collectedCount }) => {
          const updatedAt = new Date().toISOString();
          await progressStore.save({
            phase: "collecting",
            updatedAt,
            targetCount: 0,
            completedCount: collectedCount,
            results: [],
            logs: [
              {
                timestamp: updatedAt,
                level: "info",
                message: `${pageIndex}페이지까지 상품 ${collectedCount}건을 읽었습니다.`,
              },
            ],
          });
          // 10초 주기 하트비트를 기다리지 않고 바로 한 번 보내 실시간으로 반영한다.
          await flushBridgeQuietly();
        },
        });
      } finally {
        collectInProgress = false;
      }
      const progress = await buildSnapshot(collected.products.length, collected.note);
      return {
        ok: !collected.verificationRequired,
        message: collected.verificationRequired
          ? collected.note
          : `전체 페이지에서 상품 ${collected.products.length}건을 불러왔습니다.`,
        progress,
        details: {
          targetCount: collected.products.length,
          products: collected.products.map((product) => ({
            productId: product.id.toString(),
            name: product.name,
            editUrl: product.editUrl,
            channelProductNo: product.channelProductNo,
            originProductNo: product.originProductNo,
            rowTextPreview: product.rowTextPreview,
            sourceScope: product.sourceScope,
            sourceVerification: product.sourceVerification,
          })),
          sample: collected.products.slice(0, 5).map((product) => ({
            productId: product.id.toString(),
            name: product.name,
            editUrl: product.editUrl,
          })),
        },
      };
    }
    case "run-dry-run": {
      const progress = await dryRun.execute(toRunPolicy(settingsFromPayload(payload), true));
      return {
        ok: progress.phase !== "verification-required",
        message:
          progress.phase === "verification-required"
            ? "화면 구조 확인이 더 필요해서 미리보기를 멈췄습니다."
            : "저장 없이 미리보기를 완료했습니다.",
        progress,
        details: {
          sample: progress.results.slice(0, 5),
        },
      };
    }
    case "start-batch": {
      const settings = settingsFromPayload(payload);
      const checkpoint = await batchRunner.start(
        toRunPolicy(settings, false),
        {
          selectedProductIds: payload?.selectedProductIds,
          requiredOptions: settings.requiredOptions,
        },
      );
      return {
        ok: true,
        message: `선택한 상품 ${checkpoint.targets.length}건의 예약구매 설정을 시작했습니다.`,
        checkpoint,
        progress: await progressStore.load(),
      };
    }
    case "resume-batch": {
      const checkpoint = await batchRunner.resume();
      return {
        ok: Boolean(checkpoint),
        message: checkpoint
          ? "중단된 작업을 이어서 시작했습니다."
          : "이어갈 작업이 없습니다.",
        checkpoint,
        progress: await progressStore.load(),
      };
    }
    // 최소화 대신 쓰는 작업 창 축소/복원. 최소화는 페이지를 hidden 으로 만들어
    // 자동화가 멈추지만, 화면 구석의 작은 창은 계속 렌더링되어 작업이 이어진다.
    case "shrink-work-window": {
      const response = await chrome.runtime.sendMessage({
        type: "content/set-work-window-bounds",
        bounds: computeShrunkWindowBounds(window),
      });
      return {
        ok: Boolean(response?.ok),
        message: response?.ok
          ? "작업 창을 화면 우측 하단의 작은 창으로 축소했습니다. 최소화와 달리 작업은 계속 진행됩니다."
          : `작업 창 축소에 실패했습니다. ${describeWindowCommandFailure(response)}`,
      };
    }
    case "restore-work-window": {
      const response = await chrome.runtime.sendMessage({
        type: "content/set-work-window-bounds",
        bounds: computeRestoredWindowBounds(window),
      });
      return {
        ok: Boolean(response?.ok),
        message: response?.ok
          ? "작업 창 크기를 원래대로 되돌렸습니다."
          : `작업 창 복원에 실패했습니다. ${describeWindowCommandFailure(response)}`,
      };
    }
    case "stop-batch": {
      const checkpoint = await batchRunner.stop();
      return {
        ok: Boolean(checkpoint),
        message: checkpoint ? "현재 작업 중단을 요청했습니다." : "진행 중인 작업이 없습니다.",
        checkpoint,
        progress: await progressStore.load(),
      };
    }
  }
}

function toBridgeCommandType(
  message: ContentCommand,
):
  | "check-surface"
  | "run-dom-inspection"
  | "collect-targets"
  | "run-dry-run"
  | "start-batch"
  | "resume-batch"
  | "stop-batch" {
  switch (message.type) {
    case "content/check-surface":
      return "check-surface";
    case "content/run-dom-inspection":
      return "run-dom-inspection";
    case "content/collect-targets":
      return "collect-targets";
    case "content/run-dry-run":
      return "run-dry-run";
    case "content/start-batch":
      return "start-batch";
    case "content/resume-batch":
      return "resume-batch";
    case "content/stop-batch":
      return "stop-batch";
  }
}
