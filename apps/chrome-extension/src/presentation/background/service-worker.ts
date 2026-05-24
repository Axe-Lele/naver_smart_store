// Path: C:\smart-store\apps\chrome-extension\src\presentation\background\service-worker.ts
import {
  BrowserLogger,
  ChromeProgressStore,
  defaultExtensionSettings,
} from "../../infrastructure/index.js";
import type {
  CommandResponse,
  ContentCommand,
  PageChoiceOptionNameFillCommand,
  PageChoiceOptionValueFillCommand,
  PageChoiceSimpleTypeClickCommand,
  PageAfterSaleStatusOnClickCommand,
  PageOptionListApplyClickCommand,
  PageChoiceTypeOnClickCommand,
  PageDispatchCompletionCalendarClickCommand,
  PageDispatchCompletionLastEnabledDayClickCommand,
  PageDispatchCompletionMonthNextClickCommand,
  PageDispatchCompletionYearNextClickCommand,
  PageOrderEndCalendarClickCommand,
  PageOrderEndLastEnabledDayClickCommand,
  PageOrderEndLastEnabledHourClickCommand,
  PageOrderEndYearNextClickCommand,
  PageOptionMenuToggleClickCommand,
  PageOrderStartCalendarClickCommand,
  PageOrderStartCurrentDayClickCommand,
  PageOrderStartCurrentHourClickCommand,
  PagePreorderDisclosureClickCommand,
  PagePreorderEnabledClickCommand,
  PageTimeClickCommand,
  PopupCommand,
} from "../messages.js";

const logger = new BrowserLogger("extension-background");
const progressStore = new ChromeProgressStore(
  defaultExtensionSettings.progressStorageKey,
);
const SELLER_CENTER_ORIGIN = "https://sell.smartstore.naver.com/";
const CONTENT_SCRIPT_PATH = "presentation/content/content-script.js";

chrome.runtime.onInstalled.addListener(() => {
  void progressStore.reset();
  logger.info("Extension installed", {
    selectorProfileId: defaultExtensionSettings.selectorProfileId,
  });
});

chrome.runtime.onMessage.addListener(
  (
    message:
      | PopupCommand
      | PageTimeClickCommand
      | PagePreorderDisclosureClickCommand
      | PagePreorderEnabledClickCommand
      | PageOrderStartCalendarClickCommand
      | PageOrderStartCurrentDayClickCommand
      | PageOrderStartCurrentHourClickCommand
      | PageOrderEndCalendarClickCommand
      | PageOrderEndYearNextClickCommand
      | PageOrderEndLastEnabledDayClickCommand
      | PageOrderEndLastEnabledHourClickCommand
      | PageAfterSaleStatusOnClickCommand
      | PageDispatchCompletionCalendarClickCommand
      | PageDispatchCompletionYearNextClickCommand
      | PageDispatchCompletionMonthNextClickCommand
      | PageDispatchCompletionLastEnabledDayClickCommand
      | PageOptionMenuToggleClickCommand
      | PageChoiceTypeOnClickCommand
      | PageChoiceSimpleTypeClickCommand
      | PageChoiceOptionNameFillCommand
      | PageChoiceOptionValueFillCommand
      | PageOptionListApplyClickCommand,
    sender,
    sendResponse: (response: CommandResponse) => void,
  ) => {
    void handleRuntimeCommand(message, sender)
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

async function handleRuntimeCommand(
  message:
    | PopupCommand
    | PageTimeClickCommand
    | PagePreorderDisclosureClickCommand
    | PagePreorderEnabledClickCommand
    | PageOrderStartCalendarClickCommand
    | PageOrderStartCurrentDayClickCommand
    | PageOrderStartCurrentHourClickCommand
    | PageOrderEndCalendarClickCommand
    | PageOrderEndYearNextClickCommand
    | PageOrderEndLastEnabledDayClickCommand
    | PageOrderEndLastEnabledHourClickCommand
    | PageAfterSaleStatusOnClickCommand
    | PageDispatchCompletionCalendarClickCommand
    | PageDispatchCompletionYearNextClickCommand
    | PageDispatchCompletionMonthNextClickCommand
    | PageDispatchCompletionLastEnabledDayClickCommand
    | PageOptionMenuToggleClickCommand
    | PageChoiceTypeOnClickCommand
    | PageChoiceSimpleTypeClickCommand
    | PageChoiceOptionNameFillCommand
    | PageChoiceOptionValueFillCommand
    | PageOptionListApplyClickCommand,
  sender: chrome.runtime.MessageSender,
): Promise<CommandResponse> {
  if (message.type === "content/click-page-time-option") {
    return clickPageTimeOption(sender.tab?.id, message);
  }

  if (message.type === "content/click-page-preorder-disclosure") {
    return clickPagePreorderDisclosure(sender.tab?.id);
  }

  if (message.type === "content/click-page-preorder-enabled") {
    return clickPagePreorderEnabled(sender.tab?.id);
  }

  if (message.type === "content/click-page-order-start-calendar") {
    return clickPageOrderStartCalendar(sender.tab?.id);
  }

  if (message.type === "content/click-page-order-start-current-day") {
    return clickPageOrderStartCurrentDay(sender.tab?.id);
  }

  if (message.type === "content/click-page-order-start-current-hour") {
    return clickPageOrderStartCurrentHour(sender.tab?.id);
  }

  if (message.type === "content/click-page-order-end-calendar") {
    return clickPageOrderEndCalendar(sender.tab?.id);
  }

  if (message.type === "content/click-page-order-end-year-next") {
    return clickPageOrderEndYearNext(sender.tab?.id);
  }

  if (message.type === "content/click-page-order-end-last-enabled-day") {
    return clickPageOrderEndLastEnabledDay(sender.tab?.id);
  }

  if (message.type === "content/click-page-order-end-last-enabled-hour") {
    return clickPageOrderEndLastEnabledHour(sender.tab?.id);
  }

  if (message.type === "content/click-page-after-sale-status-on") {
    return clickPageAfterSaleStatusOn(sender.tab?.id);
  }

  if (message.type === "content/click-page-dispatch-completion-calendar") {
    return clickPageDispatchCompletionCalendar(sender.tab?.id);
  }

  if (message.type === "content/click-page-dispatch-completion-year-next") {
    return clickPageDispatchCompletionYearNext(sender.tab?.id);
  }

  if (message.type === "content/click-page-dispatch-completion-month-next") {
    return clickPageDispatchCompletionMonthNext(sender.tab?.id);
  }

  if (message.type === "content/click-page-dispatch-completion-last-enabled-day") {
    return clickPageDispatchCompletionLastEnabledDay(sender.tab?.id);
  }

  if (message.type === "content/click-page-option-menu-toggle") {
    return clickPageOptionMenuToggle(sender.tab?.id);
  }

  if (message.type === "content/click-page-choice-type-on") {
    return clickPageChoiceTypeOn(sender.tab?.id);
  }

  if (message.type === "content/click-page-choice-simple-type") {
    return clickPageChoiceSimpleType(sender.tab?.id);
  }

  if (message.type === "content/fill-page-choice-option-name") {
    return fillPageChoiceOptionName(sender.tab?.id, message);
  }

  if (message.type === "content/fill-page-choice-option-value") {
    return fillPageChoiceOptionValue(sender.tab?.id, message);
  }

  if (message.type === "content/click-page-option-list-apply") {
    return clickPageOptionListApply(sender.tab?.id);
  }

  return handlePopupCommand(message);
}

async function handlePopupCommand(message: PopupCommand): Promise<CommandResponse> {
  switch (message.type) {
    case "popup/get-progress":
      return {
        ok: true,
        message: "Loaded stored progress snapshot.",
        progress: await progressStore.load(),
      };
    case "popup/check-surface":
      return relayToActiveTab({ type: "content/check-surface" });
    case "popup/run-dom-inspection":
      return relayToActiveTab({ type: "content/run-dom-inspection" });
    case "popup/collect-targets":
      return relayToActiveTab({ type: "content/collect-targets" });
    case "popup/run-dry-run":
      return relayToActiveTab({ type: "content/run-dry-run" });
    case "popup/start-batch":
      return relayToActiveTab({ type: "content/start-batch" });
    case "popup/resume-batch":
      return relayToActiveTab({ type: "content/resume-batch" });
    case "popup/stop-batch":
      return relayToActiveTab({ type: "content/stop-batch" });
  }
}

async function relayToActiveTab(command: ContentCommand): Promise<CommandResponse> {
  const [tab] = await queryActiveTab();

  if (!tab?.id) {
    return {
      ok: false,
      message: "No active tab available.",
    };
  }

  if (!isSellerCenterTab(tab.url)) {
    return {
      ok: false,
      message: "판매자센터 상품 조회/수정 탭을 먼저 열고, 그 탭에서 확장 팝업을 다시 눌러 주세요.",
    };
  }

  const response = await sendTabMessageWithAutoInject(tab.id, command);

  if (response.progress) {
    await progressStore.save(response.progress);
  }

  await progressStore.appendLog({
    timestamp: new Date().toISOString(),
    level: response.ok ? "info" : "error",
    message: response.message,
  });

  return response;
}

async function queryActiveTab(): Promise<chrome.tabs.Tab[]> {
  return new Promise<chrome.tabs.Tab[]>((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      resolve(tabs);
    });
  });
}

async function sendTabMessage(
  tabId: number,
  command: ContentCommand,
): Promise<CommandResponse> {
  return new Promise<CommandResponse>((resolve) => {
    chrome.tabs.sendMessage(tabId, command, (response: CommandResponse | undefined) => {
      if (chrome.runtime.lastError) {
        resolve({
          ok: false,
          message: chrome.runtime.lastError.message ?? "Unknown runtime error.",
        });
        return;
      }

      resolve(
        response ?? {
          ok: false,
          message: "No response received from content script.",
        },
      );
    });
  });
}

async function sendTabMessageWithAutoInject(
  tabId: number,
  command: ContentCommand,
): Promise<CommandResponse> {
  const firstResponse = await sendTabMessage(tabId, command);
  if (!isMissingContentScriptMessage(firstResponse.message)) {
    return firstResponse;
  }

  const injected = await injectContentScript(tabId);
  if (!injected.ok) {
    return injected;
  }

  return sendTabMessage(tabId, command);
}

function injectContentScript(tabId: number): Promise<CommandResponse> {
  return new Promise<CommandResponse>((resolve) => {
    chrome.scripting.executeScript(
      {
        target: { tabId },
        files: [CONTENT_SCRIPT_PATH],
      },
      () => {
        if (chrome.runtime.lastError) {
          resolve({
            ok: false,
            message: [
              "판매자센터 탭에 확장을 연결하지 못했습니다.",
              "Chrome 확장 관리 화면에서 이 확장을 새로고침한 뒤 판매자센터 탭을 Ctrl+R로 새로고침해 주세요.",
              chrome.runtime.lastError.message,
            ]
              .filter(Boolean)
              .join(" "),
          });
          return;
        }

        resolve({
          ok: true,
          message: "판매자센터 탭에 확장을 연결했습니다. 같은 버튼을 다시 눌러 주세요.",
        });
      },
    );
  });
}

async function clickPagePreorderDisclosure(tabId: number | undefined): Promise<CommandResponse> {
  if (!tabId) {
    return {
      ok: false,
      message: "Preorder disclosure target tab was not available.",
    };
  }

  return new Promise<CommandResponse>((resolve) => {
    chrome.scripting.executeScript(
      {
        target: { tabId },
        world: "MAIN",
        func: triggerSmartStorePreorderDisclosure,
      },
      (results) => {
        if (chrome.runtime.lastError) {
          resolve({
            ok: false,
            message: chrome.runtime.lastError.message ?? "Unknown scripting error.",
          });
          return;
        }

        const result = results?.[0]?.result as
          | { ok: boolean; reason?: string }
          | undefined;
        resolve({
          ok: Boolean(result?.ok),
          message: result?.ok
            ? "Smart Store preorder disclosure clicked in page context."
            : `Smart Store preorder disclosure was not clicked in page context. ${result?.reason ?? ""}`,
        });
      },
    );
  });
}

function triggerSmartStorePreorderDisclosure(): { ok: boolean; reason?: string } {
  const selector =
    '[name="preOrder"] .form-section .title-line .col-lg-11.col-sm-10.col-xs-8.input-content';
  const element = document.querySelector(selector);
  const pageWindow = window as Window & {
    jQuery?: (target: string | Element) => {
      length?: number;
      trigger: (eventName: string) => void;
    };
    $?: (target: string | Element) => {
      length?: number;
      trigger: (eventName: string) => void;
    };
  };
  const jquery = pageWindow.jQuery ?? pageWindow.$;

  if (typeof jquery === "function") {
    const collection = jquery(selector);
    if ((collection.length ?? 1) > 0) {
      collection.trigger("click");
      return { ok: true };
    }
  }

  if (element instanceof HTMLElement) {
    element.click();
    return { ok: true };
  }

  return { ok: false, reason: `No element matched ${selector}.` };
}

async function clickPagePreorderEnabled(tabId: number | undefined): Promise<CommandResponse> {
  if (!tabId) {
    return {
      ok: false,
      message: "Preorder enabled target tab was not available.",
    };
  }

  return new Promise<CommandResponse>((resolve) => {
    chrome.scripting.executeScript(
      {
        target: { tabId },
        world: "MAIN",
        func: triggerSmartStorePreorderEnabled,
      },
      (results) => {
        if (chrome.runtime.lastError) {
          resolve({
            ok: false,
            message: chrome.runtime.lastError.message ?? "Unknown scripting error.",
          });
          return;
        }

        const result = results?.[0]?.result as
          | { ok: boolean; checked?: boolean; reason?: string }
          | undefined;
        resolve({
          ok: Boolean(result?.ok),
          message: result?.ok
            ? `Smart Store preorder enabled clicked in page context. checked=${String(result.checked)}`
            : `Smart Store preorder enabled was not clicked in page context. ${result?.reason ?? ""}`,
        });
      },
    );
  });
}

function triggerSmartStorePreorderEnabled(): {
  ok: boolean;
  checked?: boolean;
  reason?: string;
} {
  const selectors = [
    'input#preOrder1_1[data-nclicks-code="pro.on"]',
    "#preOrder1_1",
    'input[name="preOrder1"][value="true"]',
    'input[data-nclicks-code="pro.on"][ng-model="vm.isPreOrderOn"]',
  ];
  const pageWindow = window as Window & {
    jQuery?: (target: string | Element) => {
      length?: number;
      trigger: (eventName: string) => void;
    };
    $?: (target: string | Element) => {
      length?: number;
      trigger: (eventName: string) => void;
    };
  };
  const jquery = pageWindow.jQuery ?? pageWindow.$;

  for (const selector of selectors) {
    const input = document.querySelector(selector);
    if (input instanceof HTMLInputElement) {
      input.click();
      return { ok: true, checked: input.checked };
    }

    if (typeof jquery === "function") {
      const collection = jquery(selector);
      if ((collection.length ?? 0) > 0) {
        collection.trigger("click");
        const checkedInput = document.querySelector(selector);
        return {
          ok: true,
          checked: checkedInput instanceof HTMLInputElement ? checkedInput.checked : undefined,
        };
      }
    }
  }

  const label = document.querySelector('label[for="preOrder1_1"]');
  if (label instanceof HTMLElement) {
    label.click();
    const input = document.querySelector("#preOrder1_1");
    return { ok: true, checked: input instanceof HTMLInputElement ? input.checked : undefined };
  }

  return { ok: false, reason: `No element matched ${selectors.join(" | ")}.` };
}

async function clickPageOrderStartCalendar(tabId: number | undefined): Promise<CommandResponse> {
  if (!tabId) {
    return {
      ok: false,
      message: "Order start calendar target tab was not available.",
    };
  }

  return new Promise<CommandResponse>((resolve) => {
    chrome.scripting.executeScript(
      {
        target: { tabId },
        world: "MAIN",
        func: triggerSmartStoreOrderStartCalendar,
      },
      (results) => {
        if (chrome.runtime.lastError) {
          resolve({
            ok: false,
            message: chrome.runtime.lastError.message ?? "Unknown scripting error.",
          });
          return;
        }

        const result = results?.[0]?.result as
          | { ok: boolean; selector?: string; reason?: string }
          | undefined;
        resolve({
          ok: Boolean(result?.ok),
          message: result?.ok
            ? `Smart Store order start calendar clicked in page context. selector=${result.selector ?? ""}`
            : `Smart Store order start calendar was not clicked in page context. ${result?.reason ?? ""}`,
        });
      },
    );
  });
}

function triggerSmartStoreOrderStartCalendar(): {
  ok: boolean;
  selector?: string;
  reason?: string;
} {
  const selectors = [
    'ncp-datetime-range-picker2[data-nclicks-code="pro.period"] input[name="product.saleStartDate"] ~ span.input-group-addon a[role="button"]',
    'ncp-datetime-range-picker2[start-date-name="product.saleStartDate"] ._startDate_dropdown .input-group-addon a[role="button"]',
    'ncp-datetime-range-picker2[data-nclicks-code="pro.period"] ._startDate_dropdown .input-group-addon a[role="button"]',
    '[name="preOrder"] input[name="product.saleStartDate"] + span.input-group-addon a[role="button"]',
    '[name="preOrder"] ._startDate_dropdown .input-group-addon a[role="button"]',
    '[name="preOrder"] ncp-datetime-range-picker2 ._startDate_dropdown a[role="button"]',
    'input[name="product.saleStartDate"] ~ span.input-group-addon a[role="button"]',
    '._startDate_dropdown .input-group-addon a[role="button"]',
    'ncp-datetime-range-picker2 ._startDate_dropdown a[role="button"]',
  ];
  const pageWindow = window as Window & {
    jQuery?: (target: string | Element) => {
      length?: number;
      trigger: (eventName: string) => void;
    };
    $?: (target: string | Element) => {
      length?: number;
      trigger: (eventName: string) => void;
    };
  };
  const jquery = pageWindow.jQuery ?? pageWindow.$;

  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (typeof jquery === "function") {
      const collection = jquery(selector);
      if ((collection.length ?? 0) > 0) {
        collection.trigger("click");
        return { ok: true, selector };
      }
    }

    if (element instanceof HTMLElement) {
      element.click();
      return { ok: true, selector };
    }
  }

  const input = document.querySelector('input[name="product.saleStartDate"]');
  const scopedButton = input
    ?.closest("._startDate_dropdown, ncp-datetime-range-picker2, .form-sub-wrap")
    ?.querySelector('.input-group-addon a[role="button"]');
  if (scopedButton instanceof HTMLElement) {
    scopedButton.click();
    return {
      ok: true,
      selector: 'input[name="product.saleStartDate"] closest calendar button',
    };
  }

  return { ok: false, reason: `No element matched ${selectors.join(" | ")}.` };
}

async function clickPageOrderEndCalendar(tabId: number | undefined): Promise<CommandResponse> {
  if (!tabId) {
    return {
      ok: false,
      message: "Order end calendar target tab was not available.",
    };
  }

  return new Promise<CommandResponse>((resolve) => {
    chrome.scripting.executeScript(
      {
        target: { tabId },
        world: "MAIN",
        func: triggerSmartStoreOrderEndCalendar,
      },
      (results) => {
        if (chrome.runtime.lastError) {
          resolve({
            ok: false,
            message: chrome.runtime.lastError.message ?? "Unknown scripting error.",
          });
          return;
        }

        const result = results?.[0]?.result as
          | { ok: boolean; selector?: string; reason?: string }
          | undefined;
        resolve({
          ok: Boolean(result?.ok),
          message: result?.ok
            ? `Smart Store order end calendar clicked in page context. selector=${result.selector ?? ""}`
            : `Smart Store order end calendar was not clicked in page context. ${result?.reason ?? ""}`,
        });
      },
    );
  });
}

function triggerSmartStoreOrderEndCalendar(): {
  ok: boolean;
  selector?: string;
  reason?: string;
} {
  const selectors = [
    'ncp-datetime-range-picker2[data-nclicks-code="pro.period"] input[name="product.saleEndDate"] ~ span.input-group-addon a[role="button"]',
    'ncp-datetime-range-picker2[end-date-name="product.saleEndDate"] ._endDate_dropdown .input-group-addon a[role="button"]',
    'ncp-datetime-range-picker2[data-nclicks-code="pro.period"] ._endDate_dropdown .input-group-addon a[role="button"]',
    '[name="preOrder"] input[name="product.saleEndDate"] + span.input-group-addon a[role="button"]',
    '[name="preOrder"] ._endDate_dropdown .input-group-addon a[role="button"]',
    '[name="preOrder"] ncp-datetime-range-picker2 ._endDate_dropdown a[role="button"]',
    'input[name="product.saleEndDate"] ~ span.input-group-addon a[role="button"]',
    '._endDate_dropdown .input-group-addon a[role="button"]',
    'ncp-datetime-range-picker2 ._endDate_dropdown a[role="button"]',
  ];
  const pageWindow = window as Window & {
    jQuery?: (target: string | Element) => {
      length?: number;
      trigger: (eventName: string) => void;
    };
    $?: (target: string | Element) => {
      length?: number;
      trigger: (eventName: string) => void;
    };
  };
  const jquery = pageWindow.jQuery ?? pageWindow.$;

  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (typeof jquery === "function") {
      const collection = jquery(selector);
      if ((collection.length ?? 0) > 0) {
        collection.trigger("click");
        return { ok: true, selector };
      }
    }

    if (element instanceof HTMLElement) {
      element.click();
      return { ok: true, selector };
    }
  }

  return { ok: false, reason: `No element matched ${selectors.join(" | ")}.` };
}

async function clickPageOrderEndYearNext(tabId: number | undefined): Promise<CommandResponse> {
  if (!tabId) {
    return {
      ok: false,
      message: "Order end year-next target tab was not available.",
    };
  }

  return new Promise<CommandResponse>((resolve) => {
    chrome.scripting.executeScript(
      {
        target: { tabId },
        world: "MAIN",
        func: triggerSmartStoreOrderEndYearNext,
      },
      (results) => {
        if (chrome.runtime.lastError) {
          resolve({
            ok: false,
            message: chrome.runtime.lastError.message ?? "Unknown scripting error.",
          });
          return;
        }

        const result = results?.[0]?.result as
          | { ok: boolean; selector?: string; reason?: string }
          | undefined;
        resolve({
          ok: Boolean(result?.ok),
          message: result?.ok
            ? `Smart Store order end year-next clicked in page context. selector=${result.selector ?? ""}`
            : `Smart Store order end year-next was not clicked in page context. ${result?.reason ?? ""}`,
        });
      },
    );
  });
}

function triggerSmartStoreOrderEndYearNext(): {
  ok: boolean;
  selector?: string;
  reason?: string;
} {
  const selectors = [
    '.datetimepicker[ng-model="vm.endDateModel"] .datetimepicker-header button.right[data-ng-click="changeViewNextYear(data.rightDate, $event)"]',
    '.datetimepicker[ng-model="vm.endDateModel"] .datetimepicker-header .next button.right[data-ng-click*="changeViewNextYear"]',
    '[ng-model="vm.endDateModel"] .datetimepicker-header button.right[data-ng-click*="changeViewNextYear"]',
  ];
  const pageWindow = window as Window & {
    jQuery?: (target: string | Element) => {
      length?: number;
      trigger: (eventName: string) => void;
    };
    $?: (target: string | Element) => {
      length?: number;
      trigger: (eventName: string) => void;
    };
  };
  const jquery = pageWindow.jQuery ?? pageWindow.$;
  const isVisible = (element: Element): boolean => {
    if (!(element instanceof HTMLElement)) {
      return true;
    }

    let current: HTMLElement | null = element;
    while (current) {
      const style = window.getComputedStyle(current);
      if (
        current.hidden ||
        current.getAttribute("aria-hidden") === "true" ||
        style.display === "none" ||
        style.visibility === "hidden" ||
        Number.parseFloat(style.opacity || "1") === 0
      ) {
        return false;
      }

      current = current.parentElement;
    }

    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };

  for (const selector of selectors) {
    const element = Array.from(document.querySelectorAll(selector)).find(isVisible);
    if (typeof jquery === "function") {
      if (element) {
        jquery(element).trigger("click");
        return { ok: true, selector };
      }
    }

    if (element instanceof HTMLElement) {
      element.click();
      return { ok: true, selector };
    }
  }

  return { ok: false, reason: `No element matched ${selectors.join(" | ")}.` };
}

async function clickPageOrderEndLastEnabledDay(
  tabId: number | undefined,
): Promise<CommandResponse> {
  if (!tabId) {
    return {
      ok: false,
      message: "Order end last enabled day target tab was not available.",
    };
  }

  return new Promise<CommandResponse>((resolve) => {
    chrome.scripting.executeScript(
      {
        target: { tabId },
        world: "MAIN",
        func: triggerSmartStoreOrderEndLastEnabledDay,
      },
      (results) => {
        if (chrome.runtime.lastError) {
          resolve({
            ok: false,
            message: chrome.runtime.lastError.message ?? "Unknown scripting error.",
          });
          return;
        }

        const result = results?.[0]?.result as
          | { ok: boolean; selector?: string; label?: string; reason?: string }
          | undefined;
        resolve({
          ok: Boolean(result?.ok),
          message: result?.ok
            ? `Smart Store order end last enabled day clicked in page context. selector=${result.selector ?? ""} label=${result.label ?? ""}`
            : `Smart Store order end last enabled day was not clicked in page context. ${result?.reason ?? ""}`,
        });
      },
    );
  });
}

function triggerSmartStoreOrderEndLastEnabledDay(): {
  ok: boolean;
  selector?: string;
  label?: string;
  reason?: string;
} {
  const selector =
    '.datetimepicker[ng-model="vm.endDateModel"] .datetimepicker-body.day-view td.day:not(.disabled) span[data-ng-click]';
  const fallbackSelector =
    '[ng-model="vm.endDateModel"] .datetimepicker-body.day-view td.day:not(.disabled) span[data-ng-click]';
  const isVisible = (element: Element): boolean => {
    if (!(element instanceof HTMLElement)) {
      return true;
    }

    let current: HTMLElement | null = element;
    while (current) {
      const style = window.getComputedStyle(current);
      if (
        current.hidden ||
        current.getAttribute("aria-hidden") === "true" ||
        style.display === "none" ||
        style.visibility === "hidden" ||
        Number.parseFloat(style.opacity || "1") === 0
      ) {
        return false;
      }

      current = current.parentElement;
    }

    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };
  const candidates = Array.from(
    document.querySelectorAll(`${selector}, ${fallbackSelector}`),
  )
    .filter((element) => {
      const dayCell = element.closest("td.day");
      return Boolean(dayCell && !dayCell.classList.contains("disabled") && isVisible(element));
    });
  const element = candidates.at(-1);
  const usedSelector = selector;
  const pageWindow = window as Window & {
    jQuery?: (target: string | Element) => {
      length?: number;
      trigger: (eventName: string) => void;
    };
    $?: (target: string | Element) => {
      length?: number;
      trigger: (eventName: string) => void;
    };
  };
  const jquery = pageWindow.jQuery ?? pageWindow.$;

  if (!element) {
    return { ok: false, reason: `No enabled end-date day matched ${usedSelector}.` };
  }

  if (typeof jquery === "function") {
    jquery(element).trigger("click");
    return { ok: true, selector: usedSelector, label: element.textContent?.trim() };
  }

  if (element instanceof HTMLElement) {
    element.click();
    return { ok: true, selector: usedSelector, label: element.textContent?.trim() };
  }

  return { ok: false, reason: "Last enabled end-date day was not clickable." };
}

async function clickPageOrderEndLastEnabledHour(
  tabId: number | undefined,
): Promise<CommandResponse> {
  if (!tabId) {
    return {
      ok: false,
      message: "Order end last enabled hour target tab was not available.",
    };
  }

  return new Promise<CommandResponse>((resolve) => {
    chrome.scripting.executeScript(
      {
        target: { tabId },
        world: "MAIN",
        func: triggerSmartStoreOrderEndLastEnabledHour,
      },
      (results) => {
        if (chrome.runtime.lastError) {
          resolve({
            ok: false,
            message: chrome.runtime.lastError.message ?? "Unknown scripting error.",
          });
          return;
        }

        const result = results?.[0]?.result as
          | { ok: boolean; selector?: string; label?: string; reason?: string }
          | undefined;
        resolve({
          ok: Boolean(result?.ok),
          message: result?.ok
            ? `Smart Store order end last enabled hour clicked in page context. selector=${result.selector ?? ""} label=${result.label ?? ""}`
            : `Smart Store order end last enabled hour was not clicked in page context. ${result?.reason ?? ""}`,
        });
      },
    );
  });
}

function triggerSmartStoreOrderEndLastEnabledHour(): {
  ok: boolean;
  selector?: string;
  label?: string;
  reason?: string;
} {
  const selector =
    '.datetimepicker[ng-model="vm.endDateModel"] .datetimepicker-body.hour-view span.hour:not(.disabled) em[data-ng-click]';
  const fallbackSelector =
    '[ng-model="vm.endDateModel"] .datetimepicker-body.hour-view span.hour:not(.disabled) em[data-ng-click]';
  const isVisible = (element: Element): boolean => {
    if (!(element instanceof HTMLElement)) {
      return true;
    }

    let current: HTMLElement | null = element;
    while (current) {
      const style = window.getComputedStyle(current);
      if (
        current.hidden ||
        current.getAttribute("aria-hidden") === "true" ||
        style.display === "none" ||
        style.visibility === "hidden" ||
        Number.parseFloat(style.opacity || "1") === 0
      ) {
        return false;
      }

      current = current.parentElement;
    }

    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };
  const candidates = Array.from(
    document.querySelectorAll(`${selector}, ${fallbackSelector}`),
  )
    .filter((element) => {
      const hourCell = element.closest("span.hour");
      return Boolean(hourCell && !hourCell.classList.contains("disabled") && isVisible(element));
    });
  const element = candidates.at(-1);
  const usedSelector = selector;
  const pageWindow = window as Window & {
    jQuery?: (target: string | Element) => {
      length?: number;
      trigger: (eventName: string) => void;
    };
    $?: (target: string | Element) => {
      length?: number;
      trigger: (eventName: string) => void;
    };
  };
  const jquery = pageWindow.jQuery ?? pageWindow.$;

  if (!element) {
    return { ok: false, reason: `No enabled end-date hour matched ${usedSelector}.` };
  }

  if (typeof jquery === "function") {
    jquery(element).trigger("click");
    return { ok: true, selector: usedSelector, label: element.textContent?.trim() };
  }

  if (element instanceof HTMLElement) {
    element.click();
    return { ok: true, selector: usedSelector, label: element.textContent?.trim() };
  }

  return { ok: false, reason: "Last enabled end-date hour was not clickable." };
}

async function clickPageAfterSaleStatusOn(tabId: number | undefined): Promise<CommandResponse> {
  if (!tabId) {
    return {
      ok: false,
      message: "After-sale status on target tab was not available.",
    };
  }

  return new Promise<CommandResponse>((resolve) => {
    chrome.scripting.executeScript(
      {
        target: { tabId },
        world: "MAIN",
        func: triggerSmartStoreAfterSaleStatusOn,
      },
      (results) => {
        if (chrome.runtime.lastError) {
          resolve({
            ok: false,
            message: chrome.runtime.lastError.message ?? "Unknown scripting error.",
          });
          return;
        }

        const result = results?.[0]?.result as
          | { ok: boolean; selector?: string; checked?: boolean; reason?: string }
          | undefined;
        resolve({
          ok: Boolean(result?.ok),
          message: result?.ok
            ? `Smart Store after-sale status on clicked in page context. selector=${result.selector ?? ""} checked=${String(result.checked)}`
            : `Smart Store after-sale status on was not clicked in page context. ${result?.reason ?? ""}`,
        });
      },
    );
  });
}

function triggerSmartStoreAfterSaleStatusOn(): {
  ok: boolean;
  selector?: string;
  checked?: boolean;
  reason?: string;
} {
  const selectors = [
    "#afterSaleStatus2",
    'input[name="afterSaleStatus"][value="SALE"]',
    'input[name="afterSaleStatus"][data-nclicks-code="pro.saleon"]',
  ];
  const pageWindow = window as Window & {
    jQuery?: (target: string | Element) => {
      length?: number;
      trigger: (eventName: string) => void;
    };
    $?: (target: string | Element) => {
      length?: number;
      trigger: (eventName: string) => void;
    };
  };
  const jquery = pageWindow.jQuery ?? pageWindow.$;

  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (element instanceof HTMLInputElement) {
      element.click();
      return { ok: true, selector, checked: element.checked };
    }

    if (typeof jquery === "function") {
      const collection = jquery(selector);
      if ((collection.length ?? 0) > 0) {
        collection.trigger("click");
        const input = document.querySelector(selector);
        return {
          ok: true,
          selector,
          checked: input instanceof HTMLInputElement ? input.checked : undefined,
        };
      }
    }
  }

  return { ok: false, reason: `No element matched ${selectors.join(" | ")}.` };
}

async function clickPageDispatchCompletionCalendar(
  tabId: number | undefined,
): Promise<CommandResponse> {
  if (!tabId) {
    return {
      ok: false,
      message: "Dispatch completion calendar target tab was not available.",
    };
  }

  return new Promise<CommandResponse>((resolve) => {
    chrome.scripting.executeScript(
      {
        target: { tabId },
        world: "MAIN",
        func: triggerSmartStoreDispatchCompletionCalendar,
      },
      (results) => {
        if (chrome.runtime.lastError) {
          resolve({
            ok: false,
            message: chrome.runtime.lastError.message ?? "Unknown scripting error.",
          });
          return;
        }

        const result = results?.[0]?.result as
          | { ok: boolean; selector?: string; reason?: string }
          | undefined;
        resolve({
          ok: Boolean(result?.ok),
          message: result?.ok
            ? `Smart Store dispatch completion calendar clicked in page context. selector=${result.selector ?? ""}`
            : `Smart Store dispatch completion calendar was not clicked in page context. ${result?.reason ?? ""}`,
        });
      },
    );
  });
}

function triggerSmartStoreDispatchCompletionCalendar(): {
  ok: boolean;
  selector?: string;
  reason?: string;
} {
  const selectors = [
    'ncp-datetime-picker2[data-nclicks-code="pro.shipcompl"][date-name="product.detailAttribute.preOrderInfo.deliveryEndDate"] ._date_dropdown .input-group-addon a[role="button"]',
    'ncp-datetime-picker2[date-name="product.detailAttribute.preOrderInfo.deliveryEndDate"] ._date_dropdown .input-group-addon a[role="button"]',
    'ncp-datetime-picker2[data-nclicks-code="pro.shipcompl"] input[name="product.detailAttribute.preOrderInfo.deliveryEndDate"] ~ span.input-group-addon a[role="button"]',
    'input[name="product.detailAttribute.preOrderInfo.deliveryEndDate"] ~ span.input-group-addon a[role="button"]',
    'ncp-datetime-picker2[data-nclicks-code="pro.shipcompl"] ._date_dropdown .input-group-addon a[role="button"]',
    'ncp-datetime-picker2[data-nclicks-code="pro.shipcompl"] a[role="button"]',
    '[data-nclicks-code="pro.shipcompl"] + span.input-group-addon a[role="button"]',
  ];
  const pageWindow = window as Window & {
    jQuery?: (target: string | Element) => {
      length?: number;
      trigger: (eventName: string) => void;
    };
    $?: (target: string | Element) => {
      length?: number;
      trigger: (eventName: string) => void;
    };
  };
  const jquery = pageWindow.jQuery ?? pageWindow.$;

  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (typeof jquery === "function") {
      const collection = jquery(selector);
      if ((collection.length ?? 0) > 0) {
        collection.trigger("click");
        return { ok: true, selector };
      }
    }

    if (element instanceof HTMLElement) {
      element.click();
      return { ok: true, selector };
    }
  }

  const input = document.querySelector(
    'input[name="product.detailAttribute.preOrderInfo.deliveryEndDate"]',
  );
  const scopedButton = input
    ?.closest("._date_dropdown, ncp-datetime-picker2, .form-sub-wrap")
    ?.querySelector('.input-group-addon a[role="button"]');
  if (scopedButton instanceof HTMLElement) {
    scopedButton.click();
    return {
      ok: true,
      selector:
        'input[name="product.detailAttribute.preOrderInfo.deliveryEndDate"] closest calendar button',
    };
  }

  return { ok: false, reason: `No element matched ${selectors.join(" | ")}.` };
}

async function clickPageDispatchCompletionYearNext(
  tabId: number | undefined,
): Promise<CommandResponse> {
  if (!tabId) {
    return {
      ok: false,
      message: "Dispatch completion year-next target tab was not available.",
    };
  }

  return new Promise<CommandResponse>((resolve) => {
    chrome.scripting.executeScript(
      {
        target: { tabId },
        world: "MAIN",
        func: triggerSmartStoreDispatchCompletionYearNext,
      },
      (results) => {
        if (chrome.runtime.lastError) {
          resolve({
            ok: false,
            message: chrome.runtime.lastError.message ?? "Unknown scripting error.",
          });
          return;
        }

        const result = results?.[0]?.result as
          | { ok: boolean; selector?: string; reason?: string }
          | undefined;
        resolve({
          ok: Boolean(result?.ok),
          message: result?.ok
            ? `Smart Store dispatch completion year-next clicked in page context. selector=${result.selector ?? ""}`
            : `Smart Store dispatch completion year-next was not clicked in page context. ${result?.reason ?? ""}`,
        });
      },
    );
  });
}

function triggerSmartStoreDispatchCompletionYearNext(): {
  ok: boolean;
  selector?: string;
  reason?: string;
} {
  const selectors = [
    'ncp-datetime-picker2[data-nclicks-code="pro.shipcompl"] .datetimepicker[ng-model="vm.dateModel"] .datetimepicker-header .next button.right[data-ng-click="changeViewNextYear(data.rightDate, $event)"]',
    'ncp-datetime-picker2[date-name="product.detailAttribute.preOrderInfo.deliveryEndDate"] .datetimepicker[ng-model="vm.dateModel"] .datetimepicker-header .next button.right[data-ng-click*="changeViewNextYear"]',
    '.datetimepicker[ng-model="vm.dateModel"] .datetimepicker-header .next button.right[data-ng-click="changeViewNextYear(data.rightDate, $event)"]',
    '.datetimepicker[ng-model="vm.dateModel"] .datetimepicker-header .next button.right[data-ng-click*="changeViewNextYear"]',
    '[ng-model="vm.dateModel"] .datetimepicker-header .next button.right[data-ng-click*="changeViewNextYear"]',
  ];
  const pageWindow = window as Window & {
    jQuery?: (target: string | Element) => {
      length?: number;
      trigger: (eventName: string) => void;
    };
    $?: (target: string | Element) => {
      length?: number;
      trigger: (eventName: string) => void;
    };
  };
  const jquery = pageWindow.jQuery ?? pageWindow.$;
  const isVisible = (element: Element): boolean => {
    if (!(element instanceof HTMLElement)) {
      return true;
    }

    let current: HTMLElement | null = element;
    while (current) {
      const style = window.getComputedStyle(current);
      if (
        current.hidden ||
        current.getAttribute("aria-hidden") === "true" ||
        style.display === "none" ||
        style.visibility === "hidden" ||
        Number.parseFloat(style.opacity || "1") === 0
      ) {
        return false;
      }

      current = current.parentElement;
    }

    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };

  for (const selector of selectors) {
    const element = Array.from(document.querySelectorAll(selector)).find(isVisible);
    if (typeof jquery === "function") {
      if (element) {
        jquery(element).trigger("click");
        return { ok: true, selector };
      }
    }

    if (element instanceof HTMLElement) {
      element.click();
      return { ok: true, selector };
    }
  }

  return { ok: false, reason: `No element matched ${selectors.join(" | ")}.` };
}

async function clickPageDispatchCompletionMonthNext(
  tabId: number | undefined,
): Promise<CommandResponse> {
  if (!tabId) {
    return {
      ok: false,
      message: "Dispatch completion month-next target tab was not available.",
    };
  }

  return new Promise<CommandResponse>((resolve) => {
    chrome.scripting.executeScript(
      {
        target: { tabId },
        world: "MAIN",
        func: triggerSmartStoreDispatchCompletionMonthNext,
      },
      (results) => {
        if (chrome.runtime.lastError) {
          resolve({
            ok: false,
            message: chrome.runtime.lastError.message ?? "Unknown scripting error.",
          });
          return;
        }

        const result = results?.[0]?.result as
          | { ok: boolean; selector?: string; reason?: string }
          | undefined;
        resolve({
          ok: Boolean(result?.ok),
          message: result?.ok
            ? `Smart Store dispatch completion month-next clicked in page context. selector=${result.selector ?? ""}`
            : `Smart Store dispatch completion month-next was not clicked in page context. ${result?.reason ?? ""}`,
        });
      },
    );
  });
}

function triggerSmartStoreDispatchCompletionMonthNext(): {
  ok: boolean;
  selector?: string;
  reason?: string;
} {
  const selectors = [
    'ncp-datetime-picker2[data-nclicks-code="pro.shipcompl"] .datetimepicker[ng-model="vm.dateModel"] .datetimepicker-header .next button.right[data-ng-click="changeView(data.currentView, data.rightDate, $event)"]',
    'ncp-datetime-picker2[date-name="product.detailAttribute.preOrderInfo.deliveryEndDate"] .datetimepicker[ng-model="vm.dateModel"] .datetimepicker-header .next button.right[data-ng-click*="changeView(data.currentView"]',
    '.datetimepicker[ng-model="vm.dateModel"] .datetimepicker-header .next button.right[data-ng-click="changeView(data.currentView, data.rightDate, $event)"]',
    '.datetimepicker[ng-model="vm.dateModel"] .datetimepicker-header .next button.right[data-ng-click*="changeView(data.currentView"]',
    '[ng-model="vm.dateModel"] .datetimepicker-header .next button.right[data-ng-click*="changeView(data.currentView"]',
  ];
  const pageWindow = window as Window & {
    jQuery?: (target: string | Element) => {
      length?: number;
      trigger: (eventName: string) => void;
    };
    $?: (target: string | Element) => {
      length?: number;
      trigger: (eventName: string) => void;
    };
  };
  const jquery = pageWindow.jQuery ?? pageWindow.$;
  const isVisible = (element: Element): boolean => {
    if (!(element instanceof HTMLElement)) {
      return true;
    }

    let current: HTMLElement | null = element;
    while (current) {
      const style = window.getComputedStyle(current);
      if (
        current.hidden ||
        current.getAttribute("aria-hidden") === "true" ||
        style.display === "none" ||
        style.visibility === "hidden" ||
        Number.parseFloat(style.opacity || "1") === 0
      ) {
        return false;
      }

      current = current.parentElement;
    }

    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };

  for (const selector of selectors) {
    const element = Array.from(document.querySelectorAll(selector)).find(isVisible);
    if (typeof jquery === "function") {
      if (element) {
        jquery(element).trigger("click");
        return { ok: true, selector };
      }
    }

    if (element instanceof HTMLElement) {
      element.click();
      return { ok: true, selector };
    }
  }

  return { ok: false, reason: `No element matched ${selectors.join(" | ")}.` };
}

async function clickPageDispatchCompletionLastEnabledDay(
  tabId: number | undefined,
): Promise<CommandResponse> {
  if (!tabId) {
    return {
      ok: false,
      message: "Dispatch completion last enabled day target tab was not available.",
    };
  }

  return new Promise<CommandResponse>((resolve) => {
    chrome.scripting.executeScript(
      {
        target: { tabId },
        world: "MAIN",
        func: triggerSmartStoreDispatchCompletionLastEnabledDay,
      },
      (results) => {
        if (chrome.runtime.lastError) {
          resolve({
            ok: false,
            message: chrome.runtime.lastError.message ?? "Unknown scripting error.",
          });
          return;
        }

        const result = results?.[0]?.result as
          | { ok: boolean; selector?: string; label?: string; reason?: string }
          | undefined;
        resolve({
          ok: Boolean(result?.ok),
          message: result?.ok
            ? `Smart Store dispatch completion last enabled day clicked in page context. selector=${result.selector ?? ""} label=${result.label ?? ""}`
            : `Smart Store dispatch completion last enabled day was not clicked in page context. ${result?.reason ?? ""}`,
        });
      },
    );
  });
}

function triggerSmartStoreDispatchCompletionLastEnabledDay(): {
  ok: boolean;
  selector?: string;
  label?: string;
  reason?: string;
} {
  const selector =
    'ncp-datetime-picker2[data-nclicks-code="pro.shipcompl"] .datetimepicker[ng-model="vm.dateModel"] .datetimepicker-body.day-view td.day:not(.disabled) span[data-ng-click]';
  const scopedDateNameSelector =
    'ncp-datetime-picker2[date-name="product.detailAttribute.preOrderInfo.deliveryEndDate"] .datetimepicker[ng-model="vm.dateModel"] .datetimepicker-body.day-view td.day:not(.disabled) span[data-ng-click]';
  const fallbackSelector =
    '.datetimepicker[ng-model="vm.dateModel"] .datetimepicker-body.day-view td.day:not(.disabled) span[data-ng-click]';
  const broadFallbackSelector =
    '[ng-model="vm.dateModel"] .datetimepicker-body.day-view td.day:not(.disabled) span[data-ng-click]';
  const isVisible = (element: Element): boolean => {
    if (!(element instanceof HTMLElement)) {
      return true;
    }

    let current: HTMLElement | null = element;
    while (current) {
      const style = window.getComputedStyle(current);
      if (
        current.hidden ||
        current.getAttribute("aria-hidden") === "true" ||
        style.display === "none" ||
        style.visibility === "hidden" ||
        Number.parseFloat(style.opacity || "1") === 0
      ) {
        return false;
      }

      current = current.parentElement;
    }

    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };
  const candidates = Array.from(
    document.querySelectorAll(
      `${selector}, ${scopedDateNameSelector}, ${fallbackSelector}, ${broadFallbackSelector}`,
    ),
  )
    .filter((element) => {
      const dayCell = element.closest("td.day");
      return Boolean(dayCell && !dayCell.classList.contains("disabled") && isVisible(element));
    });
  const element = candidates.at(-1);
  const usedSelector = selector;
  const pageWindow = window as Window & {
    jQuery?: (target: string | Element) => {
      length?: number;
      trigger: (eventName: string) => void;
    };
    $?: (target: string | Element) => {
      length?: number;
      trigger: (eventName: string) => void;
    };
  };
  const jquery = pageWindow.jQuery ?? pageWindow.$;

  if (!element) {
    return {
      ok: false,
      reason: `No enabled dispatch completion day matched ${usedSelector}.`,
    };
  }

  if (typeof jquery === "function") {
    jquery(element).trigger("click");
    return { ok: true, selector: usedSelector, label: element.textContent?.trim() };
  }

  if (element instanceof HTMLElement) {
    element.click();
    return { ok: true, selector: usedSelector, label: element.textContent?.trim() };
  }

  return { ok: false, reason: "Last enabled dispatch completion day was not clickable." };
}

async function clickPageOptionMenuToggle(tabId: number | undefined): Promise<CommandResponse> {
  if (!tabId) {
    return {
      ok: false,
      message: "Option menu toggle target tab was not available.",
    };
  }

  return new Promise<CommandResponse>((resolve) => {
    chrome.scripting.executeScript(
      {
        target: { tabId },
        world: "MAIN",
        func: triggerSmartStoreOptionMenuToggle,
      },
      (results) => {
        if (chrome.runtime.lastError) {
          resolve({
            ok: false,
            message: chrome.runtime.lastError.message ?? "Unknown scripting error.",
          });
          return;
        }

        const result = results?.[0]?.result as
          | { ok: boolean; selector?: string; reason?: string }
          | undefined;
        resolve({
          ok: Boolean(result?.ok),
          message: result?.ok
            ? `Smart Store option menu toggle clicked in page context. selector=${result.selector ?? ""}`
            : `Smart Store option menu toggle was not clicked in page context. ${result?.reason ?? ""}`,
        });
      },
    );
  });
}

function triggerSmartStoreOptionMenuToggle(): {
  ok: boolean;
  selector?: string;
  reason?: string;
} {
  const selector = 'a.btn.btn-default[ng-class*="vm.isMenuOpen"]';
  const fallbackSelector = 'a[ng-class*="vm.isMenuOpen"]';
  const openOptionControlsSelector = [
    'input#option_choice_type_true',
    'input[type="radio"][ng-model="vm.isChoiceType"]',
    'input#choice_option_name0',
    'input#choice_option_value0',
  ].join(", ");
  const isVisible = (element: Element): boolean => {
    if (!(element instanceof HTMLElement)) {
      return true;
    }

    let current: HTMLElement | null = element;
    while (current) {
      const style = window.getComputedStyle(current);
      if (
        current.hidden ||
        current.getAttribute("aria-hidden") === "true" ||
        style.display === "none" ||
        style.visibility === "hidden" ||
        Number.parseFloat(style.opacity || "1") === 0
      ) {
        return false;
      }

      current = current.parentElement;
    }

    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };

  if (Array.from(document.querySelectorAll(openOptionControlsSelector)).some(isVisible)) {
    return { ok: true, selector: "option controls already visible" };
  }

  const candidates = Array.from(document.querySelectorAll(`${selector}, ${fallbackSelector}`))
    .filter((element): element is HTMLElement => element instanceof HTMLElement)
    .filter((element) => {
      const text = `${element.textContent ?? ""} ${element.getAttribute("aria-label") ?? ""}`;
      return text.includes("메뉴토글") && isVisible(element);
    });
  const textMatches = (element: Element, hints: readonly string[]): boolean => {
    const text = (element.textContent ?? "").replace(/\s+/g, " ").trim();
    return hints.some((hint) => text.includes(hint));
  };
  const findToggleNearOptionHeading = (): HTMLElement | undefined => {
    const headingHints = ["옵션", "옵션 설정"];
    const possibleHeadings = Array.from(
      document.querySelectorAll("h1,h2,h3,h4,h5,strong,dt,label,span,div"),
    )
      .filter((element) => isVisible(element))
      .filter((element) => {
        const text = (element.textContent ?? "").replace(/\s+/g, " ").trim();
        return headingHints.includes(text);
      });

    for (const heading of possibleHeadings) {
      let current = heading.parentElement;
      for (let depth = 0; current && depth < 7; depth += 1, current = current.parentElement) {
        const text = (current.textContent ?? "").replace(/\s+/g, " ").trim();
        const rect = current.getBoundingClientRect();
        if (text.length > 2_000 || rect.height > window.innerHeight * 2) {
          continue;
        }

        const toggle = candidates.find((candidate) => current?.contains(candidate));
        if (toggle) {
          return toggle;
        }
      }
    }

    return undefined;
  };
  const scoreCandidate = (candidate: HTMLElement): number => {
    let score = candidate.classList.contains("active") ? -25 : 0;
    let current = candidate.parentElement;

    for (let depth = 0; current && depth < 8; depth += 1, current = current.parentElement) {
      const text = (current.textContent ?? "").replace(/\s+/g, " ").trim();
      const rect = current.getBoundingClientRect();
      const tooBroad = text.length > 2_000 || rect.height > window.innerHeight * 2;
      if (tooBroad) {
        continue;
      }

      if (textMatches(current, ["옵션 설정", "옵션"])) {
        score += 120 - depth * 8;
      }

      if (textMatches(current, ["선택형", "옵션 구성타입", "옵션명", "옵션값"])) {
        score += 70 - depth * 6;
      }
    }

    return score;
  };
  const headingMatched = findToggleNearOptionHeading();
  const scored =
    headingMatched ??
    candidates
      .map((candidate) => ({ candidate, score: scoreCandidate(candidate) }))
      .filter((entry) => entry.score > 0)
      .sort((left, right) => right.score - left.score)[0]?.candidate;
  const element = scored;

  if (!element) {
    return {
      ok: false,
      reason: `No option-scoped visible menu toggle matched ${selector}. candidates=${candidates.length}`,
    };
  }

  element.click();
  return {
    ok: true,
    selector: element.matches(selector) ? selector : fallbackSelector,
  };
}

async function clickPageChoiceTypeOn(tabId: number | undefined): Promise<CommandResponse> {
  if (!tabId) {
    return {
      ok: false,
      message: "Choice type on target tab was not available.",
    };
  }

  return new Promise<CommandResponse>((resolve) => {
    chrome.scripting.executeScript(
      {
        target: { tabId },
        world: "MAIN",
        func: triggerSmartStoreChoiceTypeOn,
      },
      (results) => {
        if (chrome.runtime.lastError) {
          resolve({
            ok: false,
            message: chrome.runtime.lastError.message ?? "Unknown scripting error.",
          });
          return;
        }

        const result = results?.[0]?.result as
          | { ok: boolean; selector?: string; reason?: string }
          | undefined;
        resolve({
          ok: Boolean(result?.ok),
          message: result?.ok
            ? `Smart Store choice type on input clicked in page context. selector=${result.selector ?? ""}`
            : `Smart Store choice type on input was not clicked in page context. ${result?.reason ?? ""}`,
        });
      },
    );
  });
}

function triggerSmartStoreChoiceTypeOn(): {
  ok: boolean;
  selector?: string;
  reason?: string;
} {
  const selectors = [
    'input#option_choice_type_true[type="radio"]',
    'input[type="radio"][ng-model="vm.isChoiceType"][value="true"]',
    'input[type="radio"][data-nclicks-code="opt*c.on"]',
    'input[type="radio"][ng-click*="changeIsChoiceAndCustom"][value="true"]',
  ];
  const element = selectors
    .map((selector) => ({
      selector,
      element: document.querySelector(selector),
    }))
    .find((entry): entry is { selector: string; element: HTMLInputElement } =>
      entry.element instanceof HTMLInputElement,
    );

  if (!element) {
    return { ok: false, reason: `No choice type on input matched ${selectors.join(", ")}.` };
  }

  element.element.click();
  return {
    ok: true,
    selector: element.selector,
  };
}

async function clickPageChoiceSimpleType(tabId: number | undefined): Promise<CommandResponse> {
  if (!tabId) {
    return {
      ok: false,
      message: "Choice simple type target tab was not available.",
    };
  }

  return new Promise<CommandResponse>((resolve) => {
    chrome.scripting.executeScript(
      {
        target: { tabId },
        world: "MAIN",
        func: triggerSmartStoreChoiceSimpleType,
      },
      (results) => {
        if (chrome.runtime.lastError) {
          resolve({
            ok: false,
            message: chrome.runtime.lastError.message ?? "Unknown scripting error.",
          });
          return;
        }

        const result = results?.[0]?.result as
          | { ok: boolean; selector?: string; reason?: string }
          | undefined;
        resolve({
          ok: Boolean(result?.ok),
          message: result?.ok
            ? `Smart Store choice simple type input clicked in page context. selector=${result.selector ?? ""}`
            : `Smart Store choice simple type input was not clicked in page context. ${result?.reason ?? ""}`,
        });
      },
    );
  });
}

function triggerSmartStoreChoiceSimpleType(): {
  ok: boolean;
  selector?: string;
  reason?: string;
} {
  const selectors = [
    'input[type="radio"][ng-model="vm.choiceType"][value="SIMPLE"]',
    'input[type="radio"][data-nclicks-code="opt*c.single"]',
    'input[type="radio"][ng-value="::vm.CHOICE_TYPE.SIMPLE"]',
  ];
  const isVisible = (element: Element): boolean => {
    if (!(element instanceof HTMLElement)) {
      return true;
    }

    let current: HTMLElement | null = element;
    while (current) {
      const style = window.getComputedStyle(current);
      if (
        current.hidden ||
        current.getAttribute("aria-hidden") === "true" ||
        style.display === "none" ||
        style.visibility === "hidden" ||
        Number.parseFloat(style.opacity || "1") === 0
      ) {
        return false;
      }

      current = current.parentElement;
    }

    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };
  const element = selectors
    .flatMap((selector) =>
      Array.from(document.querySelectorAll(selector)).map((candidate) => ({
        selector,
        candidate,
      })),
    )
    .find((entry): entry is { selector: string; candidate: HTMLInputElement } =>
      entry.candidate instanceof HTMLInputElement &&
      entry.candidate.type === "radio" &&
      isVisible(entry.candidate),
    );

  if (!element) {
    return { ok: false, reason: `No visible choice simple type input matched ${selectors.join(", ")}.` };
  }

  if (element.candidate.disabled) {
    return { ok: false, reason: `Choice simple type input matched ${element.selector} but was disabled.` };
  }

  element.candidate.click();
  return {
    ok: true,
    selector: element.selector,
  };
}

async function fillPageChoiceOptionName(
  tabId: number | undefined,
  command: PageChoiceOptionNameFillCommand,
): Promise<CommandResponse> {
  if (!tabId) {
    return {
      ok: false,
      message: "Choice option name target tab was not available.",
    };
  }

  return new Promise<CommandResponse>((resolve) => {
    chrome.scripting.executeScript(
      {
        target: { tabId },
        world: "MAIN",
        func: triggerSmartStoreChoiceOptionNameFill,
        args: [command.value],
      },
      (results) => {
        if (chrome.runtime.lastError) {
          resolve({
            ok: false,
            message: chrome.runtime.lastError.message ?? "Unknown scripting error.",
          });
          return;
        }

        const result = results?.[0]?.result as
          | { ok: boolean; selector?: string; reason?: string }
          | undefined;
        resolve({
          ok: Boolean(result?.ok),
          message: result?.ok
            ? `Smart Store choice option name filled in page context. selector=${result.selector ?? ""}`
            : `Smart Store choice option name was not filled in page context. ${result?.reason ?? ""}`,
        });
      },
    );
  });
}

function triggerSmartStoreChoiceOptionNameFill(value: string): {
  ok: boolean;
  selector?: string;
  reason?: string;
} {
  const selectors = [
    'input#choice_option_name0[type="text"]',
    'input[type="text"][ng-model="choiceOptionInput.groupName"]',
    '.option-wrap input[id^="choice_option_name"][type="text"]',
    'input[type="text"][placeholder="예시:컬러"]',
  ];
  const isVisible = (element: Element): boolean => {
    if (!(element instanceof HTMLElement)) {
      return true;
    }

    let current: HTMLElement | null = element;
    while (current) {
      const style = window.getComputedStyle(current);
      if (
        current.hidden ||
        current.getAttribute("aria-hidden") === "true" ||
        style.display === "none" ||
        style.visibility === "hidden" ||
        Number.parseFloat(style.opacity || "1") === 0
      ) {
        return false;
      }

      current = current.parentElement;
    }

    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };
  const target = selectors
    .flatMap((selector) =>
      Array.from(document.querySelectorAll(selector)).map((candidate) => ({
        selector,
        candidate,
      })),
    )
    .find((entry): entry is { selector: string; candidate: HTMLInputElement } =>
      entry.candidate instanceof HTMLInputElement &&
      !entry.candidate.disabled &&
      !entry.candidate.readOnly &&
      isVisible(entry.candidate),
    );

  if (!target) {
    return { ok: false, reason: `No editable choice option name input matched ${selectors.join(", ")}.` };
  }

  target.candidate.scrollIntoView({ block: "center", inline: "center" });
  target.candidate.focus();
  target.candidate.click();

  const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  if (valueSetter) {
    valueSetter.call(target.candidate, value);
  } else {
    target.candidate.value = value;
  }

  target.candidate.dispatchEvent(new Event("input", { bubbles: true }));
  target.candidate.dispatchEvent(new Event("change", { bubbles: true }));
  target.candidate.dispatchEvent(new Event("blur", { bubbles: true }));

  return {
    ok: true,
    selector: target.selector,
  };
}

async function fillPageChoiceOptionValue(
  tabId: number | undefined,
  command: PageChoiceOptionValueFillCommand,
): Promise<CommandResponse> {
  if (!tabId) {
    return {
      ok: false,
      message: "Choice option value target tab was not available.",
    };
  }

  return new Promise<CommandResponse>((resolve) => {
    chrome.scripting.executeScript(
      {
        target: { tabId },
        world: "MAIN",
        func: triggerSmartStoreChoiceOptionValueFill,
        args: [command.value],
      },
      (results) => {
        if (chrome.runtime.lastError) {
          resolve({
            ok: false,
            message: chrome.runtime.lastError.message ?? "Unknown scripting error.",
          });
          return;
        }

        const result = results?.[0]?.result as
          | { ok: boolean; selector?: string; reason?: string }
          | undefined;
        resolve({
          ok: Boolean(result?.ok),
          message: result?.ok
            ? `Smart Store choice option value filled in page context. selector=${result.selector ?? ""}`
            : `Smart Store choice option value was not filled in page context. ${result?.reason ?? ""}`,
        });
      },
    );
  });
}

function triggerSmartStoreChoiceOptionValueFill(value: string): {
  ok: boolean;
  selector?: string;
  reason?: string;
} {
  const selectors = [
    'input#choice_option_value0[type="text"]',
    'input[type="text"][ng-model="choiceOptionInput.name"]',
    '.option-wrap input[id^="choice_option_value"][type="text"]',
    'input[type="text"][placeholder*="빨강"]',
  ];
  const isVisible = (element: Element): boolean => {
    if (!(element instanceof HTMLElement)) {
      return true;
    }

    let current: HTMLElement | null = element;
    while (current) {
      const style = window.getComputedStyle(current);
      if (
        current.hidden ||
        current.getAttribute("aria-hidden") === "true" ||
        style.display === "none" ||
        style.visibility === "hidden" ||
        Number.parseFloat(style.opacity || "1") === 0
      ) {
        return false;
      }

      current = current.parentElement;
    }

    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };
  const target = selectors
    .flatMap((selector) =>
      Array.from(document.querySelectorAll(selector)).map((candidate) => ({
        selector,
        candidate,
      })),
    )
    .find((entry): entry is { selector: string; candidate: HTMLInputElement } =>
      entry.candidate instanceof HTMLInputElement &&
      !entry.candidate.disabled &&
      !entry.candidate.readOnly &&
      isVisible(entry.candidate),
    );

  if (!target) {
    return { ok: false, reason: `No editable choice option value input matched ${selectors.join(", ")}.` };
  }

  target.candidate.scrollIntoView({ block: "center", inline: "center" });
  target.candidate.focus();
  target.candidate.click();

  const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  if (valueSetter) {
    valueSetter.call(target.candidate, value);
  } else {
    target.candidate.value = value;
  }

  target.candidate.dispatchEvent(new Event("input", { bubbles: true }));
  target.candidate.dispatchEvent(new Event("change", { bubbles: true }));
  target.candidate.dispatchEvent(new Event("blur", { bubbles: true }));

  return {
    ok: true,
    selector: target.selector,
  };
}

async function clickPageOptionListApply(tabId: number | undefined): Promise<CommandResponse> {
  if (!tabId) {
    return {
      ok: false,
      message: "Option list apply target tab was not available.",
    };
  }

  return new Promise<CommandResponse>((resolve) => {
    chrome.scripting.executeScript(
      {
        target: { tabId },
        world: "MAIN",
        func: triggerSmartStoreOptionListApply,
      },
      (results) => {
        if (chrome.runtime.lastError) {
          resolve({
            ok: false,
            message: chrome.runtime.lastError.message ?? "Unknown scripting error.",
          });
          return;
        }

        const result = results?.[0]?.result as
          | { ok: boolean; selector?: string; reason?: string }
          | undefined;
        resolve({
          ok: Boolean(result?.ok),
          message: result?.ok
            ? `Smart Store option list apply clicked in page context. selector=${result.selector ?? ""}`
            : `Smart Store option list apply was not clicked in page context. ${result?.reason ?? ""}`,
        });
      },
    );
  });
}

function triggerSmartStoreOptionListApply(): {
  ok: boolean;
  selector?: string;
  reason?: string;
} {
  const selectors = [
    'a.btn.btn-primary.btn-block[ng-click*="submitToGrid"]',
    'a[role="button"][ng-click*="submitToGrid"]',
    'a.btn-primary[ng-click*="openSubscriptionModifyAlert"]',
  ];
  const isVisible = (element: Element): boolean => {
    if (!(element instanceof HTMLElement)) {
      return true;
    }

    let current: HTMLElement | null = element;
    while (current) {
      const style = window.getComputedStyle(current);
      if (
        current.hidden ||
        current.getAttribute("aria-hidden") === "true" ||
        style.display === "none" ||
        style.visibility === "hidden" ||
        Number.parseFloat(style.opacity || "1") === 0
      ) {
        return false;
      }

      current = current.parentElement;
    }

    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };
  const target = selectors
    .flatMap((selector) =>
      Array.from(document.querySelectorAll(selector)).map((candidate) => ({
        selector,
        candidate,
      })),
    )
    .find((entry): entry is { selector: string; candidate: HTMLElement } => {
      if (!(entry.candidate instanceof HTMLElement)) {
        return false;
      }

      const text = entry.candidate.textContent?.replace(/\s+/g, " ").trim() ?? "";
      return (
        isVisible(entry.candidate) &&
        !entry.candidate.classList.contains("disabled") &&
        entry.candidate.getAttribute("aria-disabled") !== "true" &&
        (text.includes("옵션목록으로 적용") || text.includes("옵션 목록으로 적용"))
      );
    });

  if (!target) {
    return { ok: false, reason: `No visible option list apply button matched ${selectors.join(", ")}.` };
  }

  target.candidate.scrollIntoView({ block: "center", inline: "center" });
  target.candidate.click();
  return {
    ok: true,
    selector: target.selector,
  };
}

async function clickPageOrderStartCurrentDay(tabId: number | undefined): Promise<CommandResponse> {
  if (!tabId) {
    return {
      ok: false,
      message: "Order start current day target tab was not available.",
    };
  }

  return new Promise<CommandResponse>((resolve) => {
    chrome.scripting.executeScript(
      {
        target: { tabId },
        world: "MAIN",
        func: triggerSmartStoreOrderStartCurrentDay,
      },
      (results) => {
        if (chrome.runtime.lastError) {
          resolve({
            ok: false,
            message: chrome.runtime.lastError.message ?? "Unknown scripting error.",
          });
          return;
        }

        const result = results?.[0]?.result as
          | { ok: boolean; selector?: string; label?: string; reason?: string }
          | undefined;
        resolve({
          ok: Boolean(result?.ok),
          message: result?.ok
            ? `Smart Store order start current day clicked in page context. selector=${result.selector ?? ""} label=${result.label ?? ""}`
            : `Smart Store order start current day was not clicked in page context. ${result?.reason ?? ""}`,
        });
      },
    );
  });
}

function triggerSmartStoreOrderStartCurrentDay(): {
  ok: boolean;
  selector?: string;
  label?: string;
  reason?: string;
} {
  const selectors = [
    '.datetimepicker[ng-model="vm.startDateModel"] td.day.current:not(.disabled) span[data-ng-click]',
    '.datetimepicker[ng-model="vm.startDateModel"] td.day.current span[data-ng-click]',
    '[ng-model="vm.startDateModel"] .datetimepicker-body.day-view td.day.current:not(.disabled) span[data-ng-click]',
    '[ng-model="vm.startDateModel"] .datetimepicker-body.day-view td.day.current span[data-ng-click]',
  ];
  const pageWindow = window as Window & {
    jQuery?: (target: string | Element) => {
      length?: number;
      first?: () => { trigger: (eventName: string) => void };
      trigger: (eventName: string) => void;
    };
    $?: (target: string | Element) => {
      length?: number;
      first?: () => { trigger: (eventName: string) => void };
      trigger: (eventName: string) => void;
    };
  };
  const jquery = pageWindow.jQuery ?? pageWindow.$;
  const isVisible = (element: Element): boolean => {
    if (!(element instanceof HTMLElement)) {
      return true;
    }

    let current: HTMLElement | null = element;
    while (current) {
      const style = window.getComputedStyle(current);
      if (
        current.hidden ||
        current.getAttribute("aria-hidden") === "true" ||
        style.display === "none" ||
        style.visibility === "hidden" ||
        Number.parseFloat(style.opacity || "1") === 0
      ) {
        return false;
      }

      current = current.parentElement;
    }

    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };

  for (const selector of selectors) {
    const element = Array.from(document.querySelectorAll(selector)).find(isVisible);
    if (typeof jquery === "function") {
      if (element) {
        jquery(element).trigger("click");
        return { ok: true, selector, label: element.textContent?.trim() };
      }
    }

    if (element instanceof HTMLElement) {
      element.click();
      return { ok: true, selector, label: element.textContent?.trim() };
    }
  }

  return { ok: false, reason: `No element matched ${selectors.join(" | ")}.` };
}

async function clickPageOrderStartCurrentHour(tabId: number | undefined): Promise<CommandResponse> {
  if (!tabId) {
    return {
      ok: false,
      message: "Order start current hour target tab was not available.",
    };
  }

  return new Promise<CommandResponse>((resolve) => {
    chrome.scripting.executeScript(
      {
        target: { tabId },
        world: "MAIN",
        func: triggerSmartStoreOrderStartCurrentHour,
      },
      (results) => {
        if (chrome.runtime.lastError) {
          resolve({
            ok: false,
            message: chrome.runtime.lastError.message ?? "Unknown scripting error.",
          });
          return;
        }

        const result = results?.[0]?.result as
          | { ok: boolean; selector?: string; label?: string; reason?: string }
          | undefined;
        resolve({
          ok: Boolean(result?.ok),
          message: result?.ok
            ? `Smart Store order start current hour clicked in page context. selector=${result.selector ?? ""} label=${result.label ?? ""}`
            : `Smart Store order start current hour was not clicked in page context. ${result?.reason ?? ""}`,
        });
      },
    );
  });
}

function triggerSmartStoreOrderStartCurrentHour(): {
  ok: boolean;
  selector?: string;
  label?: string;
  reason?: string;
} {
  const selectors = [
    '.datetimepicker[ng-model="vm.startDateModel"] span.hour.current:not(.disabled) em[data-ng-click]',
    '.datetimepicker[ng-model="vm.startDateModel"] .datetimepicker-body.hour-view span.hour.current:not(.disabled) em[data-ng-click]',
    '[ng-model="vm.startDateModel"] .datetimepicker-body.hour-view span.hour.current:not(.disabled) em[data-ng-click]',
    '.datetimepicker[ng-model="vm.startDateModel"] span.hour.current em[data-ng-click]',
    '[ng-model="vm.startDateModel"] span.hour.current em[data-ng-click]',
  ];
  const pageWindow = window as Window & {
    jQuery?: (target: string | Element) => {
      length?: number;
      first?: () => { trigger: (eventName: string) => void };
      trigger: (eventName: string) => void;
    };
    $?: (target: string | Element) => {
      length?: number;
      first?: () => { trigger: (eventName: string) => void };
      trigger: (eventName: string) => void;
    };
  };
  const jquery = pageWindow.jQuery ?? pageWindow.$;
  const isVisible = (element: Element): boolean => {
    if (!(element instanceof HTMLElement)) {
      return true;
    }

    let current: HTMLElement | null = element;
    while (current) {
      const style = window.getComputedStyle(current);
      if (
        current.hidden ||
        current.getAttribute("aria-hidden") === "true" ||
        style.display === "none" ||
        style.visibility === "hidden" ||
        Number.parseFloat(style.opacity || "1") === 0
      ) {
        return false;
      }

      current = current.parentElement;
    }

    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };

  for (const selector of selectors) {
    const element = Array.from(document.querySelectorAll(selector)).find(isVisible);
    if (typeof jquery === "function") {
      if (element) {
        jquery(element).trigger("click");
        return { ok: true, selector, label: element.textContent?.trim() };
      }
    }

    if (element instanceof HTMLElement) {
      element.click();
      return { ok: true, selector, label: element.textContent?.trim() };
    }
  }

  return { ok: false, reason: `No element matched ${selectors.join(" | ")}.` };
}

async function clickPageTimeOption(
  tabId: number | undefined,
  command: PageTimeClickCommand,
): Promise<CommandResponse> {
  if (!tabId) {
    return {
      ok: false,
      message: "Time click target tab was not available.",
    };
  }

  return new Promise<CommandResponse>((resolve) => {
    chrome.scripting.executeScript(
      {
        target: { tabId },
        world: "MAIN",
        func: triggerSmartStoreTimeOption,
        args: [
          {
            label: command.label,
            preference: command.preference,
          },
        ],
      },
      (results) => {
        if (chrome.runtime.lastError) {
          resolve({
            ok: false,
            message: chrome.runtime.lastError.message ?? "Unknown scripting error.",
          });
          return;
        }

        const result = results?.[0]?.result as
          | { ok: boolean; label?: string; reason?: string }
          | undefined;
        resolve({
          ok: Boolean(result?.ok),
          message: result?.ok
            ? `Smart Store time option clicked in page context: ${result.label ?? command.label}.`
            : `Smart Store time option was not clicked in page context. ${result?.reason ?? ""}`,
        });
      },
    );
  });
}

function triggerSmartStoreTimeOption(input: {
  label: string;
  preference: "earliest" | "latest";
}): { ok: boolean; label?: string; reason?: string } {
  const normalize = (value: string | null | undefined): string =>
    String(value ?? "").replace(/\s+/g, " ").trim();
  const toMinutes = (value: string): number => {
    const match = normalize(value).match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
    return match ? Number(match[1]) * 60 + Number(match[2]) : Number.NaN;
  };
  const normalizedTarget = normalize(input.label);
  const paddedTarget = normalizedTarget.replace(/^(\d):/, "0$1:");
  const isVisible = (element: Element): boolean => {
    if (!(element instanceof HTMLElement)) {
      return true;
    }

    let current: HTMLElement | null = element;
    while (current) {
      const style = window.getComputedStyle(current);
      if (
        current.hidden ||
        current.getAttribute("aria-hidden") === "true" ||
        style.display === "none" ||
        style.visibility === "hidden" ||
        Number.parseFloat(style.opacity || "1") === 0
      ) {
        return false;
      }

      current = current.parentElement;
    }

    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };

  const candidates = Array.from(
    document.querySelectorAll(".hour.current em[data-ng-click]"),
  )
    .filter(isVisible)
    .map((element) => ({
      element,
      label: normalize(element.textContent),
      minutes: toMinutes(normalize(element.textContent)),
    }))
    .filter((candidate) => !Number.isNaN(candidate.minutes));

  if (candidates.length === 0) {
    return { ok: false, reason: "No .hour.current em[data-ng-click] candidates." };
  }

  const target =
    candidates.find(
      (candidate) =>
        candidate.label === normalizedTarget ||
        candidate.label === paddedTarget ||
        candidate.label.replace(/^0/, "") === normalizedTarget.replace(/^0/, ""),
    ) ??
    candidates.sort((left, right) =>
      input.preference === "earliest"
        ? left.minutes - right.minutes
        : right.minutes - left.minutes,
    )[0];

  if (!target) {
    return { ok: false, reason: "No matching time candidate." };
  }

  const pageWindow = window as Window & {
    jQuery?: (element: Element) => { trigger: (eventName: string) => void };
    $?: (element: Element) => { trigger: (eventName: string) => void };
  };
  const jquery = pageWindow.jQuery ?? pageWindow.$;
  if (typeof jquery === "function") {
    jquery(target.element).trigger("click");
  } else if (target.element instanceof HTMLElement) {
    target.element.click();
  } else {
    target.element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  }

  return { ok: true, label: target.label };
}

function isMissingContentScriptMessage(message: string): boolean {
  return (
    message.includes("Receiving end does not exist") ||
    message.includes("Could not establish connection") ||
    message.includes("No response received from content script")
  );
}

function isSellerCenterTab(url?: string): boolean {
  return typeof url === "string" && url.startsWith(SELLER_CENTER_ORIGIN);
}
