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

bridgeClient.start();
window.addEventListener("pagehide", () => bridgeClient.stop(), { once: true });
void autoResumeBatch();

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

async function autoResumeBatch(): Promise<void> {
  try {
    await batchRunner.continueIfNeeded(toRunPolicy(defaultExtensionSettings, false));
  } catch (error) {
    logger.error("Automatic batch resume failed", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }

  await flushBridgeQuietly();
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
    | "stop-batch",
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
      const collected = await collector.execute();
      const progress = await buildSnapshot(collected.products.length, collected.note);
      return {
        ok: !collected.verificationRequired,
        message: collected.verificationRequired
          ? collected.note
          : `상품 ${collected.products.length}건을 불러왔습니다.`,
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
