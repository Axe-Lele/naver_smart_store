// Path: C:\smart-store\apps\chrome-extension\src\presentation\messages.ts
import type {
  ProductEditPageDraft,
  ProductListPageDraft,
  SelectorInspectionReport,
} from "../application/index.js";
import type { BatchExecutionCheckpoint } from "../domain/index.js";
import type { ProgressSnapshot } from "../application/index.js";

export type PopupCommand =
  | { type: "popup/check-surface" }
  | { type: "popup/run-dom-inspection" }
  | { type: "popup/collect-targets" }
  | { type: "popup/run-dry-run" }
  | { type: "popup/start-batch" }
  | { type: "popup/stop-batch" }
  | { type: "popup/resume-batch" }
  | { type: "popup/get-progress" };

export type ContentCommand =
  | { type: "content/check-surface" }
  | { type: "content/run-dom-inspection" }
  | { type: "content/collect-targets" }
  | { type: "content/run-dry-run" }
  | { type: "content/start-batch" }
  | { type: "content/stop-batch" }
  | { type: "content/resume-batch" };

export type PageTimeClickCommand = {
  type: "content/click-page-time-option";
  label: string;
  preference: "earliest" | "latest";
};

export type PagePreorderDisclosureClickCommand = {
  type: "content/click-page-preorder-disclosure";
};

export type PagePreorderEnabledClickCommand = {
  type: "content/click-page-preorder-enabled";
};

export type PageOrderStartCalendarClickCommand = {
  type: "content/click-page-order-start-calendar";
};

export type PageOrderStartCurrentDayClickCommand = {
  type: "content/click-page-order-start-current-day";
};

export type PageOrderStartCurrentHourClickCommand = {
  type: "content/click-page-order-start-current-hour";
};

export type PageOrderEndCalendarClickCommand = {
  type: "content/click-page-order-end-calendar";
};

export type PageOrderEndYearNextClickCommand = {
  type: "content/click-page-order-end-year-next";
};

export type PageOrderEndLastEnabledDayClickCommand = {
  type: "content/click-page-order-end-last-enabled-day";
};

export type PageOrderEndLastEnabledHourClickCommand = {
  type: "content/click-page-order-end-last-enabled-hour";
};

export type PageAfterSaleStatusOnClickCommand = {
  type: "content/click-page-after-sale-status-on";
};

export type PageDispatchCompletionCalendarClickCommand = {
  type: "content/click-page-dispatch-completion-calendar";
};

export type PageDispatchCompletionYearNextClickCommand = {
  type: "content/click-page-dispatch-completion-year-next";
};

export type PageDispatchCompletionMonthNextClickCommand = {
  type: "content/click-page-dispatch-completion-month-next";
};

export type PageDispatchCompletionLastEnabledDayClickCommand = {
  type: "content/click-page-dispatch-completion-last-enabled-day";
};

export type PageOptionMenuToggleClickCommand = {
  type: "content/click-page-option-menu-toggle";
};

export type PageChoiceTypeOnClickCommand = {
  type: "content/click-page-choice-type-on";
};

export type PageChoiceSimpleTypeClickCommand = {
  type: "content/click-page-choice-simple-type";
};

export type PageChoiceOptionNameFillCommand = {
  type: "content/fill-page-choice-option-name";
  value: string;
  index: number;
};

export type PageChoiceOptionValueFillCommand = {
  type: "content/fill-page-choice-option-value";
  value: string;
  index: number;
};

export type PageOptionListApplyClickCommand = {
  type: "content/click-page-option-list-apply";
};

export type CommandResponse = {
  ok: boolean;
  message: string;
  progress?: ProgressSnapshot;
  checkpoint?: BatchExecutionCheckpoint | null;
  selectorReport?: SelectorInspectionReport;
  selectorReportText?: string;
  pageDraft?: ProductListPageDraft | ProductEditPageDraft | null;
  details?: Record<string, unknown>;
};
