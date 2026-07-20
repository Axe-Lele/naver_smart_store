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

// 저장하기 버튼은 Angular progress-button(vm.submit)이라 content script 의 합성
// 이벤트 클릭이 무시될 수 있어, 다른 컨트롤처럼 MAIN world 에서 실제 click()을
// 실행해달라는 명령.
export type PageSaveButtonClickCommand = {
  type: "content/click-page-save-button";
};

// 배치가 실패한 상품을 건너뛰고 저장 없이 목록으로 복귀할 때, 판매자센터 SPA가
// 띄우는 "저장하지 않고 나가면 유실됩니다" confirm 이 네이티브 다이얼로그라 탭의
// JS 전체(배치 진행, 하트비트, 중지 명령)를 멈춰버린다. 이동 직전에 background 가
// MAIN world 에 잠깐 자동 승인 confirm 을 주입해 이를 막는다.
export type PageLeaveConfirmSuppressCommand = {
  type: "content/suppress-page-leave-confirm";
  /** 자동 승인 유지 시간. 기본 5초 뒤 원래 confirm 으로 복원된다. */
  durationMs?: number;
};

// 더망고 원문상품명 추출 패널의 '일괄번역' 버튼이 background 로 보내는 명령.
// 스마트스토어 판매자센터 자동화(ContentCommand)와는 별개의, 독립된 명령이다.
// 여러 상품을 한 번에 보내서 시스템 프롬프트/스키마 오버헤드를 나눠 부담한다.
export type MangoTranslateProductNamesBatchCommand = {
  type: "mango/translate-product-names-batch";
  items: Array<{ id: string; originName: string; fallbackManufacturer?: string | null }>;
  /** 패널에서 고른 OpenAI 모델(gpt-5.5 / gpt-5.4-mini). 없으면 번역기 기본값(gpt-5.5) 사용. */
  model?: string;
  /** 등록된 few-shot 예시. 매 요청마다 user/assistant 메시지 쌍으로 같이 들어간다. */
  examples?: Array<{
    originName: string;
    anime_name: string | null;
    figure_series_name: string | null;
    character_name: string | null;
    version_name: string | null;
    scale: string | null;
    manufacturer: string | null;
  }>;
};

// 확장 팝업의 '번역창 열기' 버튼이 더망고 관리자 탭의 콘텐츠 스크립트로 직접 보내는
// 명령. 패널은 기본 닫힘 상태로 마운트되고, 이 명령을 받으면 화면에 표시된다.
export type MangoOpenOriginPanelCommand = {
  type: "mango/open-origin-panel";
};

// 원문상품명 추출 패널이 각 상품의 원문사이트(아마존 재팬) 페이지에서 발매(예정)일을
// 읽어달라고 background 에 보내는 명령. 콘텐츠 스크립트는 교차 출처 fetch 를 못 하므로
// host_permissions 를 가진 background 가 대신 조회한다.
export type MangoFetchOriginReleaseDatesCommand = {
  type: "mango/fetch-origin-release-dates";
  items: Array<{ id: string; url: string }>;
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
