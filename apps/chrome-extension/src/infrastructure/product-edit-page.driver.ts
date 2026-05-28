import type {
  DateResolverPort,
  ProductEditPageDriverPort,
  SelectorKey,
  SelectorRegistryPort,
  SellerCenterPageGatewayPort,
} from "../application/index.js";
import {
  DEFAULT_REQUIRED_OPTIONS,
  ProductProcessingState,
  type PreorderChangePlan,
  type ProcessingResult,
  type Product,
  type RequiredOption,
  type RunPolicy,
} from "../domain/index.js";
import { DomExplorer } from "./dom-explorer.js";
import { ElementLocator } from "./element-locator.js";
import {
  createPreorderEditClickFlowUnits,
  runProductEditClickFlow,
  type ProductEditClickFlowActions,
  type UiOperationResult,
} from "./product-edit-click-flow.js";
import { WaitStrategy } from "./wait-strategy.js";

const PREORDER_HINTS = ["예약구매", "예약 구매", "예약상품", "예약 상품"];
const NORMAL_HINTS = ["일반상품", "일반 상품"];
const PREORDER_ENABLED_HINTS = ["설정함", "사용함"];
const PREORDER_DISABLED_HINTS = ["설정안함", "설정 안함", "사용안함", "사용 안함"];
const NON_PREORDER_SETTING_HINTS = [
  "정기구독",
  "정기 구독",
  "구독 설정",
  "구독설정",
];
const PRODUCT_TYPE_SECTION_HINTS = [
  "판매유형",
  "판매 유형",
  "상품유형",
  "상품 유형",
  ...PREORDER_HINTS,
];
const LOCK_HINTS = ["주문", "시작", "변경", "불가", "수정", "잠김", "제한"];
const SAVE_HINTS = ["저장", "저장하기", "수정완료", "수정 완료"];
const CONFIRM_HINTS = ["확인", "예", "저장"];
const ON_SALE_HINTS = ["판매중", "판매 중"];
const ORDER_PERIOD_HINTS = ["주문기간", "주문 기간"];
const CALENDAR_BUTTON_HINTS = ["달력", "캘린더", "calendar", "datepicker", "date-picker"];
const OPTION_SECTION_HINTS = ["옵션", "옵션 설정"];
const OPTION_ENABLED_HINTS = ["설정함", "사용함", "옵션 사용", "옵션 설정함"];
const OPTION_DISABLED_HINTS = ["설정안함", "설정 안함", "사용안함", "사용 안함"];
const SELECTABLE_OPTION_HINTS = ["선택형", "선택 형"];
const OPTION_TYPE_SINGLE_HINTS = ["단독형"];
const OPTION_NAME_HINTS = ["옵션명", "옵션 명"];
const OPTION_VALUE_HINTS = ["옵션값", "옵션 값"];
const OPTION_APPLY_HINTS = ["옵션목록으로 적용", "옵션 목록으로 적용"];
const TEMP_STOP_AFTER_PREORDER_DISCLOSURE_CLICK = true;
const TEMP_STOP_AFTER_ORDER_PERIOD_END_TIME_CLICK = true;
const TEMP_PREORDER_FLOW_SUCCESS_MESSAGE =
  "예약구매 설정을 저장하고 상품관리 목록으로 복귀했습니다.";
const FAST_HUMAN_ACTION_DELAY_MS = 120;
const PAGE_ACTION_RETRY_ATTEMPTS = 3;
const PAGE_ACTION_RETRY_DELAY_MS = 120;
const PAGE_ACTION_CONFIRM_TIMEOUT_MS = 500;
const EDIT_SURFACE_READY_TIMEOUT_MS = 3_500;
const PREORDER_EXPAND_READY_TIMEOUT_MS = 1_200;
const PREORDER_ENABLED_READY_TIMEOUT_MS = 1_200;
const SAVE_COMPLETION_TIMEOUT_MS = 20_000;
const PRODUCT_MANAGEMENT_NAVIGATION_TIMEOUT_MS = 15_000;
const FAST_POLL_MS = 80;
const SAVE_FLOW_POLL_MS = 100;

interface ConversionSurface {
  section?: Element;
  preorderOption?: Element;
  normalOption?: Element;
  notes: string[];
}

type UiStepResult = string | { note: string };

interface LocalDateParts {
  year: number;
  month: number;
  day: number;
  isoDate: string;
}

interface TimeOptionCandidate {
  element: Element;
  textElement: Element;
  label: string;
  minutes: number;
}

type TimeSelectionPreference = "earliest" | "latest";

type TrustedClickPort = (point: { x: number; y: number }) => Promise<boolean>;
type PageTimeClickPort = (input: {
  label: string;
  preference: TimeSelectionPreference;
}) => Promise<boolean>;
type PagePreorderDisclosureClickPort = () => Promise<boolean>;
type PagePreorderEnabledClickPort = () => Promise<boolean>;
type PageOrderStartCalendarClickPort = () => Promise<boolean>;
type PageOrderStartCurrentDayClickPort = () => Promise<boolean>;
type PageOrderStartCurrentHourClickPort = () => Promise<boolean>;
type PageOrderEndCalendarClickPort = () => Promise<boolean>;
type PageOrderEndYearNextClickPort = () => Promise<boolean>;
type PageOrderEndLastEnabledDayClickPort = () => Promise<boolean>;
type PageOrderEndLastEnabledHourClickPort = () => Promise<boolean>;
type PageAfterSaleStatusOnClickPort = () => Promise<boolean>;
type PageDispatchCompletionCalendarClickPort = () => Promise<boolean>;
type PageDispatchCompletionYearNextClickPort = () => Promise<boolean>;
type PageDispatchCompletionMonthNextClickPort = () => Promise<boolean>;
type PageDispatchCompletionLastEnabledDayClickPort = () => Promise<boolean>;
type PageOptionMenuToggleClickPort = () => Promise<boolean>;
type PageChoiceTypeOnClickPort = () => Promise<boolean>;
type PageChoiceSimpleTypeClickPort = () => Promise<boolean>;
type PageChoiceOptionNameFillPort = (input: {
  value: string;
  index: number;
}) => Promise<boolean>;
type PageChoiceOptionValueFillPort = (input: {
  value: string;
  index: number;
}) => Promise<boolean>;
type PageOptionListApplyClickPort = () => Promise<boolean>;

interface RetriablePageActionInput {
  action?: () => Promise<boolean>;
  missingNote: string;
  failedNote: string;
  successNote: string;
  isSatisfied?: () => boolean;
}

export class ProductEditPageDriver implements ProductEditPageDriverPort {
  private readonly explorer: DomExplorer;
  private readonly locator: ElementLocator;
  private readonly waitStrategy: WaitStrategy;
  private requiredOptions: RequiredOption[] = normalizeRequiredOptions();

  public constructor(
    private readonly gateway: SellerCenterPageGatewayPort,
    private readonly selectorRegistry: SelectorRegistryPort,
    private readonly dateResolver: DateResolverPort,
    private readonly documentRef: Document = document,
    private readonly windowRef: Window = window,
    private readonly trustedClick?: TrustedClickPort,
    private readonly pageTimeClick?: PageTimeClickPort,
    private readonly pagePreorderDisclosureClick?: PagePreorderDisclosureClickPort,
    private readonly pagePreorderEnabledClick?: PagePreorderEnabledClickPort,
    private readonly pageOrderStartCalendarClick?: PageOrderStartCalendarClickPort,
    private readonly pageOrderStartCurrentDayClick?: PageOrderStartCurrentDayClickPort,
    private readonly pageOrderStartCurrentHourClick?: PageOrderStartCurrentHourClickPort,
    private readonly pageOrderEndCalendarClick?: PageOrderEndCalendarClickPort,
    private readonly pageOrderEndYearNextClick?: PageOrderEndYearNextClickPort,
    private readonly pageOrderEndLastEnabledDayClick?: PageOrderEndLastEnabledDayClickPort,
    private readonly pageOrderEndLastEnabledHourClick?: PageOrderEndLastEnabledHourClickPort,
    private readonly pageAfterSaleStatusOnClick?: PageAfterSaleStatusOnClickPort,
    private readonly pageDispatchCompletionCalendarClick?: PageDispatchCompletionCalendarClickPort,
    private readonly pageDispatchCompletionYearNextClick?: PageDispatchCompletionYearNextClickPort,
    private readonly pageDispatchCompletionMonthNextClick?: PageDispatchCompletionMonthNextClickPort,
    private readonly pageDispatchCompletionLastEnabledDayClick?: PageDispatchCompletionLastEnabledDayClickPort,
    private readonly pageOptionMenuToggleClick?: PageOptionMenuToggleClickPort,
    private readonly pageChoiceTypeOnClick?: PageChoiceTypeOnClickPort,
    private readonly pageChoiceSimpleTypeClick?: PageChoiceSimpleTypeClickPort,
    private readonly pageChoiceOptionNameFill?: PageChoiceOptionNameFillPort,
    private readonly pageChoiceOptionValueFill?: PageChoiceOptionValueFillPort,
    private readonly pageOptionListApplyClick?: PageOptionListApplyClickPort,
  ) {
    this.explorer = new DomExplorer(this.documentRef);
    this.locator = new ElementLocator(this.selectorRegistry, this.explorer);
    this.waitStrategy = new WaitStrategy(this.windowRef, this.documentRef);
  }

  public configureRequiredOptions(options?: readonly RequiredOption[] | null): void {
    this.requiredOptions = normalizeRequiredOptions(options);
  }

  private async waitForFastHumanAction(): Promise<void> {
    await this.waitStrategy.throttle(FAST_HUMAN_ACTION_DELAY_MS);
  }

  private async runRetriablePageAction(
    input: RetriablePageActionInput,
  ): Promise<UiOperationResult> {
    if (!input.action) {
      return { ok: false, note: input.missingNote };
    }

    let clickedAtLeastOnce = false;
    for (let attempt = 1; attempt <= PAGE_ACTION_RETRY_ATTEMPTS; attempt += 1) {
      if (await input.action()) {
        clickedAtLeastOnce = true;
        await this.waitForFastHumanAction();

        if (
          !input.isSatisfied ||
          input.isSatisfied() ||
          await this.waitUntil(
            input.isSatisfied,
            PAGE_ACTION_CONFIRM_TIMEOUT_MS,
            FAST_POLL_MS,
          )
        ) {
          return { ok: true, note: input.successNote };
        }
      }

      if (attempt < PAGE_ACTION_RETRY_ATTEMPTS) {
        await this.waitStrategy.throttle(PAGE_ACTION_RETRY_DELAY_MS);
      }
    }

    return {
      ok: false,
      note:
        `${input.failedNote}` +
        `${clickedAtLeastOnce ? " 클릭은 실행됐지만 상태 확인에 실패했습니다." : ""}` +
        ` (${PAGE_ACTION_RETRY_ATTEMPTS}회 시도)`,
    };
  }

  private async waitForProductEditSurfaceReady(): Promise<void> {
    await this.waitStrategy.waitForDocumentReady(8_000);

    if (hasProductEditAutomationSurface(this.documentRef)) {
      return;
    }

    const surfaceReady = await this.waitUntil(
      () => hasProductEditAutomationSurface(this.documentRef),
      EDIT_SURFACE_READY_TIMEOUT_MS,
    );
    if (surfaceReady) {
      return;
    }

    await this.waitStrategy.waitForReady({ timeoutMs: 3_000, retries: 0 });
  }

  private async waitForPreorderSectionExpanded(): Promise<boolean> {
    if (findExpandedPreorderSection(this.documentRef)) {
      return true;
    }

    return this.waitUntil(
      () => Boolean(findExpandedPreorderSection(this.documentRef)),
      PREORDER_EXPAND_READY_TIMEOUT_MS,
    );
  }

  private async waitForPreorderEnabledConfirmed(): Promise<boolean> {
    if (isPreorderEnabledConfirmed(this.resolveConversionSurface(), true)) {
      return true;
    }

    return this.waitUntil(
      () => isPreorderEnabledConfirmed(this.resolveConversionSurface(), true),
      PREORDER_ENABLED_READY_TIMEOUT_MS,
    );
  }

  private async waitUntil(
    predicate: () => boolean,
    timeoutMs: number,
    pollMs = FAST_POLL_MS,
  ): Promise<boolean> {
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
      if (predicate()) {
        return true;
      }

      await new Promise<void>((resolve) => {
        this.windowRef.setTimeout(resolve, pollMs);
      });
    }

    return predicate();
  }

  public async preparePreorderChangePlan(
    product: Product,
    policy: RunPolicy,
  ): Promise<PreorderChangePlan | ProcessingResult> {
    await this.waitForProductEditSurfaceReady();

    if (!this.gateway.isSellerCenterSurface()) {
      return failureResult(
        product,
        ProductProcessingState.VERIFICATION_REQUIRED,
        "현재 탭이 Smart Store 판매자센터 상품 수정 화면인지 확인할 수 없습니다.",
        this.gateway,
        false,
      );
    }

    if (isProductDetailPageUrl(this.gateway.getPageUrl())) {
      return failureResult(
        product,
        ProductProcessingState.VERIFICATION_REQUIRED,
        "상품 상세보기 화면이 열려 있어 작업을 중단했습니다. 상품 목록에서 수정 버튼으로 다시 실행해 주세요.",
        this.gateway,
        true,
      );
    }

    if (TEMP_STOP_AFTER_PREORDER_DISCLOSURE_CLICK) {
      return this.saveAfterTemporaryPreorderFlow(
        product,
        await this.runTemporaryPreorderClickFlow(),
      );
    }

    const disclosure = await this.openPreorderDisclosureFirst();
    if (!disclosure.ok) {
      return failureResult(
        product,
        ProductProcessingState.VERIFICATION_REQUIRED,
        disclosure.note,
        this.gateway,
        true,
      );
    }

    let surface = this.resolveConversionSurface();
    if (!surface.section) {
      return failureResult(
        product,
        ProductProcessingState.VERIFICATION_REQUIRED,
        `예약구매 설정 영역을 찾지 못했습니다. ${surface.notes.join(" | ")}`,
        this.gateway,
        true,
      );
    }

    const expanded = await this.ensurePreorderSectionExpanded(surface);
    if (!expanded.ok) {
      return failureResult(
        product,
        ProductProcessingState.VERIFICATION_REQUIRED,
        expanded.note,
        this.gateway,
        true,
      );
    }
    surface = this.resolveConversionSurface();

    if (!surface.preorderOption) {
      return failureResult(
        product,
        ProductProcessingState.VERIFICATION_REQUIRED,
        `예약구매 선택지를 찾지 못했습니다. ${surface.notes.join(" | ")}`,
        this.gateway,
        true,
      );
    }

    if (
      !isOptionSelected(surface.preorderOption) &&
      surface.normalOption &&
      !isOptionSelected(surface.normalOption) &&
      (!surface.section || !isPreorderSettingToggleSection(surface.section))
    ) {
      return failureResult(
        product,
        ProductProcessingState.VERIFICATION_REQUIRED,
        [
          "현재 상품이 일반상품 또는 예약상품 중 어떤 상태인지 확정할 수 없어 예약 설정을 멈췄습니다.",
          "잘못된 상품을 예약상품으로 바꾸지 않기 위한 확인 단계입니다.",
          ...surface.notes,
        ].join(" | "),
        this.gateway,
        false,
      );
    }

    if (this.isConversionLocked(surface)) {
      return skippedResult(
        product,
        "예약구매 전환 영역이 비활성화되어 있거나 주문/정책 제한 문구가 보여 예약 설정을 건너뛰었습니다.",
        surface.notes,
      );
    }

    if (TEMP_STOP_AFTER_ORDER_PERIOD_END_TIME_CLICK) {
      const preorderActivationNote = await this.ensurePreorderEnabled(surface);
      if (typeof preorderActivationNote !== "string") {
        return stoppedResult(
          product,
          `임시 점검: 예약구매 설정함 버튼을 찾거나 클릭하지 못했습니다. ${preorderActivationNote.note}`,
        );
      }

      const calendarNote = await this.selectOrderPeriodStartTodayOnly();
      return stoppedResult(
        product,
        typeof calendarNote === "string"
          ? `임시 점검: ${disclosure.note} ${expanded.note} ${preorderActivationNote} ${calendarNote} 여기서 멈췄습니다.`
          : `임시 점검: 주문기간 달력 작업을 완료하지 못했습니다. ${calendarNote.note}`,
      );
    }

    const preorderActivationNote = policy.dryRun
      ? "Dry-run에서는 예약구매 설정함 버튼을 클릭하지 않았습니다."
      : await this.ensurePreorderEnabled(surface);
    if (typeof preorderActivationNote !== "string") {
      return failureResult(
        product,
        ProductProcessingState.FAILED,
        preorderActivationNote.note,
        this.gateway,
      );
    }
    surface = this.resolveConversionSurface();

    const orderCalendarNote = policy.dryRun
      ? "Dry-run에서는 주문기간 달력을 열지 않았습니다."
      : await this.openOrderPeriodStartCalendar();
    if (typeof orderCalendarNote !== "string") {
      return failureResult(
        product,
        ProductProcessingState.FAILED,
        orderCalendarNote.note,
        this.gateway,
      );
    }

    const orderPeriodEnd = await this.resolveRequiredMaxDate(
      "editor.orderPeriodControl",
      policy,
      product,
      "주문기간",
    );
    if ("state" in orderPeriodEnd) {
      return orderPeriodEnd;
    }

    const dispatchCompletionDueDate = await this.resolveRequiredMaxDate(
      "editor.dispatchCompletionDateControl",
      policy,
      product,
      "발송완료일",
    );
    if ("state" in dispatchCompletionDueDate) {
      return dispatchCompletionDueDate;
    }

    const requiredOptions = this.getRequiredOptions(policy);
    const primaryRequiredOption = requiredOptions[0] ?? DEFAULT_REQUIRED_OPTIONS[0];

    return {
      productId: product.id,
      dryRun: policy.dryRun,
      targetScope: "bundle-delivery-search-result",
      requestedChanges: {
        productType: "PREORDER",
        orderPeriodEnd: orderPeriodEnd.value,
        postPreorderSaleStatus: "ON_SALE",
        dispatchCompletionDueDate: dispatchCompletionDueDate.value,
        requiredOption: {
          enabled: true,
          type: "SINGLE",
          name: primaryRequiredOption.name,
          value: primaryRequiredOption.value,
        },
        requiredOptions,
      },
      notes: [
        "묶음배송 검색 결과로 확인된 상품만 예약구매 시스템 상품으로 설정합니다.",
        surface.preorderOption && isOptionSelected(surface.preorderOption)
          ? "이미 예약구매가 선택되어 있어 기간/상태/옵션 값을 갱신합니다."
          : "일반상품에서 예약구매로 전환할 수 있는 상태를 확인했습니다.",
        disclosure.note,
        expanded.note,
        preorderActivationNote,
        orderCalendarNote,
        orderPeriodEnd.note,
        dispatchCompletionDueDate.note,
        ...surface.notes,
      ],
    };
  }

  public async applyPreorderChangePlan(
    plan: PreorderChangePlan,
  ): Promise<ProcessingResult> {
    await this.waitForProductEditSurfaceReady();

    const product = {
      id: plan.productId,
      sourceScope: "bundle-delivery-search-result",
      sourceVerification: "verification_required",
    } satisfies Product;

    if (TEMP_STOP_AFTER_PREORDER_DISCLOSURE_CLICK) {
      return this.saveAfterTemporaryPreorderFlow(
        product,
        await this.runTemporaryPreorderClickFlow(),
        plan,
      );
    }

    const disclosure = await this.openPreorderDisclosureFirst();
    if (!disclosure.ok) {
      return failureResult(
        product,
        ProductProcessingState.FAILED,
        disclosure.note,
        this.gateway,
      );
    }

    let surface = this.resolveConversionSurface();
    if (!surface.section || !surface.preorderOption) {
      const expanded = surface.section
        ? await this.ensurePreorderSectionExpanded(surface)
        : { ok: false, note: "예약구매 설정 영역을 찾지 못했습니다." };
      if (expanded.ok) {
        surface = this.resolveConversionSurface();
      }
    }

    if (!surface.section || !surface.preorderOption) {
      return failureResult(
        product,
        ProductProcessingState.FAILED,
        `저장 직전 예약구매 설정 영역을 다시 확인하지 못했습니다. ${surface.notes.join(" | ")}`,
        this.gateway,
      );
    }

    if (this.isConversionLocked(surface)) {
      return skippedResult(
        product,
        "예약구매 전환 영역이 비활성화되어 있거나 주문/정책 제한 문구가 보여 예약 설정을 건너뛰었습니다.",
        surface.notes,
      );
    }

    if (plan.dryRun) {
      return {
        productId: plan.productId,
        state: ProductProcessingState.DRY_RUN_READY,
        message:
          "Dry-run에서 예약구매 전환, 최대 주문기간, 판매중 상태, 최대 발송완료일, 필수 옵션 설정 계획을 확인했습니다.",
        retryable: false,
        plan,
        artifacts: [],
      };
    }

    const enabled = await this.ensurePreorderEnabled(surface);
    if (typeof enabled !== "string") {
      return failureResult(
        product,
        ProductProcessingState.FAILED,
        enabled.note,
        this.gateway,
      );
    }

    const orderCalendar = await this.openOrderPeriodStartCalendar();
    if (typeof orderCalendar !== "string") {
      return failureResult(
        product,
        ProductProcessingState.FAILED,
        orderCalendar.note,
        this.gateway,
      );
    }

    const statusSet = this.selectPostPreorderStatus();
    if (!statusSet.ok) {
      return failureResult(
        product,
        ProductProcessingState.FAILED,
        `예약구매 기간 종료 후 상품 판매 상태를 판매중으로 설정하지 못했습니다. ${statusSet.note}`,
        this.gateway,
      );
    }

    const dispatchCalendar = await this.openDispatchCompletionCalendar();
    if (typeof dispatchCalendar !== "string") {
      return failureResult(
        product,
        ProductProcessingState.FAILED,
        dispatchCalendar.note,
        this.gateway,
      );
    }

    const optionDisclosure = await this.openOptionSectionDisclosure();
    if (typeof optionDisclosure !== "string") {
      return failureResult(
        product,
        ProductProcessingState.FAILED,
        optionDisclosure.note,
        this.gateway,
      );
    }

    const optionSet = await this.writeRequiredSingleOptions(
      plan.requestedChanges.requiredOptions ?? [
        {
          name: plan.requestedChanges.requiredOption.name,
          value: plan.requestedChanges.requiredOption.value,
        },
      ],
    );
    if (!optionSet.ok) {
      return failureResult(
        product,
        ProductProcessingState.FAILED,
        `필수 옵션을 설정하지 못했습니다. ${optionSet.note}`,
        this.gateway,
      );
    }

    const saveButton = this.resolveSaveButton();
    if (!saveButton) {
      return failureResult(
        product,
        ProductProcessingState.FAILED,
        "예약구매 설정 후 저장 버튼을 찾지 못했습니다.",
        this.gateway,
      );
    }

    if (isDisabled(saveButton)) {
      return failureResult(
        product,
        ProductProcessingState.FAILED,
        "저장 버튼이 비활성화되어 예약구매 설정을 저장할 수 없습니다.",
        this.gateway,
      );
    }

    triggerClick(saveButton);
    await this.waitStrategy.waitForReady({ timeoutMs: 15_000, retries: 1 });
    this.clickConfirmationIfPresent();
    await this.waitStrategy.waitForReady({ timeoutMs: 8_000, retries: 1 });

    const savedSurface = this.resolveConversionSurface();
    const successFeedback = this.locator.resolveFirst("editor.successFeedback");
    const preorderStillSelected = Boolean(
      savedSurface.preorderOption && isOptionSelected(savedSurface.preorderOption),
    );

    if (!successFeedback.element && !preorderStillSelected) {
      return failureResult(
        product,
        ProductProcessingState.FAILED,
        "저장 후 성공 피드백이나 예약구매 선택 상태를 확인하지 못했습니다.",
        this.gateway,
      );
    }

    return {
      productId: plan.productId,
      state: ProductProcessingState.SUCCEEDED,
      message: successFeedback.element
        ? "예약구매 설정, 판매중 상태, 최대 기간, 필수 옵션을 저장했고 성공 피드백을 확인했습니다."
        : "예약구매 설정, 판매중 상태, 최대 기간, 필수 옵션을 저장했고 예약구매 선택 상태를 확인했습니다.",
      retryable: false,
      plan,
      artifacts: [],
    };
  }

  private async openPreorderDisclosureFirst(): Promise<UiOperationResult> {
    if (findExpandedPreorderSection(this.documentRef)) {
      return { ok: true, note: "예약구매 영역이 이미 펼쳐져 있습니다." };
    }

    if (await this.clickPagePreorderDisclosure()) {
      return {
        ok: true,
        note: "예약구매 제목 영역을 페이지 핸들러로 클릭해 먼저 펼쳤습니다.",
      };
    }

    const toggle = findCollapsedPreorderToggle(this.documentRef);
    if (!toggle) {
      return {
        ok: false,
        note: "예약구매 접힘 버튼이 보이지 않습니다.",
      };
    }

    scrollElementIntoView(toggle);
    await this.waitStrategy.throttle(120);
    triggerClick(toggle);
    const expanded = await this.waitForPreorderSectionExpanded();
    return expanded
      ? { ok: true, note: "예약구매 설정안함 펼침 버튼을 먼저 클릭했습니다." }
      : { ok: false, note: "예약구매 설정안함 펼침 버튼을 클릭했지만 영역이 열리지 않았습니다." };
  }

  private async clickPagePreorderDisclosure(): Promise<boolean> {
    if (!this.pagePreorderDisclosureClick) {
      return false;
    }

    if (!await this.pagePreorderDisclosureClick()) {
      return false;
    }

    return this.waitForPreorderSectionExpanded();
  }

  private async clickPagePreorderEnabled(): Promise<UiOperationResult> {
    const enabled = await this.runRetriablePageAction({
      action: this.pagePreorderEnabledClick,
      missingNote: "예약구매 설정함 페이지 핸들러가 연결되어 있지 않습니다.",
      failedNote: "예약구매 설정함 input#preOrder1_1을 페이지 핸들러로 클릭하지 못했습니다.",
      successNote: "예약구매 설정함 input#preOrder1_1을 페이지 핸들러로 클릭했습니다.",
      isSatisfied: () => isPreorderEnabledConfirmed(this.resolveConversionSurface(), true),
    });
    if (!enabled.ok) {
      return enabled;
    }

    const expanded = await this.ensurePreorderControlsVisibleAfterActivation();
    if (!expanded.ok) {
      return expanded;
    }

    return {
      ok: true,
      note: `예약구매 설정함 버튼을 클릭했고 주문기간 영역이 열렸습니다. ${expanded.note}`,
    };
  }

  private async ensurePreorderControlsVisibleAfterActivation(): Promise<UiOperationResult> {
    if (findOrderPeriodFieldRoot(this.documentRef) || findExpandedPreorderSection(this.documentRef)) {
      return { ok: true, note: "예약구매 상세 컨트롤이 보이는 상태입니다." };
    }

    const disclosure = await this.openPreorderDisclosureFirst();
    if (!disclosure.ok) {
      return {
        ok: false,
        note: `예약구매 설정함은 선택됐지만 접힌 상세 영역을 열지 못했습니다. ${disclosure.note}`,
      };
    }

    if (!findOrderPeriodFieldRoot(this.documentRef) && !findExpandedPreorderSection(this.documentRef)) {
      return {
        ok: false,
        note: `예약구매 설정함은 선택됐지만 주문기간 입력 영역이 보이지 않습니다. ${disclosure.note}`,
      };
    }

    return { ok: true, note: disclosure.note };
  }

  private async clickPageOrderStartCalendar(): Promise<UiOperationResult> {
    return this.runRetriablePageAction({
      action: this.pageOrderStartCalendarClick,
      missingNote: "주문 시작일 달력보기 페이지 핸들러가 연결되어 있지 않습니다.",
      failedNote: "주문 시작일 달력보기 a[role=button]를 페이지 핸들러로 클릭하지 못했습니다.",
      successNote: "주문 시작일 달력보기 a[role=button]를 페이지 핸들러로 클릭했습니다.",
      isSatisfied: () => Boolean(findAnyOpenDatePicker(this.documentRef)),
    });
  }

  private async clickPageOrderStartCurrentDay(): Promise<UiOperationResult> {
    const today = this.getSystemToday();
    return this.runRetriablePageAction({
      action: this.pageOrderStartCurrentDayClick,
      missingNote: "주문 시작일 현재 날짜 페이지 핸들러가 연결되어 있지 않습니다.",
      failedNote: "주문 시작일 picker의 td.day.current span[data-ng-click]를 페이지 핸들러로 클릭하지 못했습니다.",
      successNote: "주문 시작일 picker의 td.day.current span[data-ng-click]를 페이지 핸들러로 클릭했습니다.",
      isSatisfied: () => Boolean(findTimePickerForDate(this.documentRef, today)),
    });
  }

  private async clickPageOrderStartCurrentHour(): Promise<UiOperationResult> {
    const today = this.getSystemToday();
    return this.runRetriablePageAction({
      action: this.pageOrderStartCurrentHourClick,
      missingNote: "주문 시작일 현재 시간 페이지 핸들러가 연결되어 있지 않습니다.",
      failedNote: "주문 시작일 picker의 span.hour.current em[data-ng-click]를 페이지 핸들러로 클릭하지 못했습니다.",
      successNote: "주문 시작일 picker의 span.hour.current em[data-ng-click]를 페이지 핸들러로 클릭했습니다.",
      isSatisfied: () => !findTimePickerForDate(this.documentRef, today),
    });
  }

  private async clickPageOrderEndCalendar(): Promise<UiOperationResult> {
    return this.runRetriablePageAction({
      action: this.pageOrderEndCalendarClick,
      missingNote: "주문기간 종료 달력보기 페이지 핸들러가 연결되어 있지 않습니다.",
      failedNote: "주문기간 종료 달력보기 a[role=button]를 페이지 핸들러로 클릭하지 못했습니다.",
      successNote: "주문기간 종료 달력보기 a[role=button]를 페이지 핸들러로 클릭했습니다.",
      isSatisfied: () => Boolean(findAnyOpenDatePicker(this.documentRef)),
    });
  }

  private async clickPageOrderEndYearNext(): Promise<UiOperationResult> {
    return this.runRetriablePageAction({
      action: this.pageOrderEndYearNextClick,
      missingNote: "종료일 1년 뒤 버튼 페이지 핸들러가 연결되어 있지 않습니다.",
      failedNote: "종료일 달력의 changeViewNextYear 오른쪽 버튼을 페이지 핸들러로 클릭하지 못했습니다.",
      successNote: "종료일 달력의 changeViewNextYear 오른쪽 버튼을 페이지 핸들러로 클릭했습니다.",
    });
  }

  private async clickPageOrderEndLastEnabledDay(): Promise<UiOperationResult> {
    const oneYearLater = addYearsClamped(this.getSystemToday(), 1);
    return this.runRetriablePageAction({
      action: this.pageOrderEndLastEnabledDayClick,
      missingNote: "종료일 마지막 활성 날짜 페이지 핸들러가 연결되어 있지 않습니다.",
      failedNote: "종료일 달력의 disabled가 아닌 마지막 td.day span을 페이지 핸들러로 클릭하지 못했습니다.",
      successNote: "종료일 달력의 disabled가 아닌 마지막 td.day span을 페이지 핸들러로 클릭했습니다.",
      isSatisfied: () => Boolean(findTimePickerForDate(this.documentRef, oneYearLater)),
    });
  }

  private async clickPageOrderEndLastEnabledHour(): Promise<UiOperationResult> {
    const oneYearLater = addYearsClamped(this.getSystemToday(), 1);
    return this.runRetriablePageAction({
      action: this.pageOrderEndLastEnabledHourClick,
      missingNote: "종료일 마지막 활성 시간 페이지 핸들러가 연결되어 있지 않습니다.",
      failedNote: "종료일 달력의 disabled가 아닌 마지막 span.hour em을 페이지 핸들러로 클릭하지 못했습니다.",
      successNote: "종료일 달력의 disabled가 아닌 마지막 span.hour em을 페이지 핸들러로 클릭했습니다.",
      isSatisfied: () => !findTimePickerForDate(this.documentRef, oneYearLater),
    });
  }

  private async clickPageAfterSaleStatusOn(): Promise<UiOperationResult> {
    return this.runRetriablePageAction({
      action: this.pageAfterSaleStatusOnClick,
      missingNote: "판매 중 상태 input 페이지 핸들러가 연결되어 있지 않습니다.",
      failedNote: "판매 중 상태 input#afterSaleStatus2를 페이지 핸들러로 클릭하지 못했습니다.",
      successNote: "판매 중 상태 input#afterSaleStatus2를 페이지 핸들러로 클릭했습니다.",
    });
  }

  private async clickPageDispatchCompletionCalendar(): Promise<UiOperationResult> {
    return this.runRetriablePageAction({
      action: this.pageDispatchCompletionCalendarClick,
      missingNote: "발송완료일 달력보기 페이지 핸들러가 연결되어 있지 않습니다.",
      failedNote: "발송완료일 달력보기 a[role=button]를 페이지 핸들러로 클릭하지 못했습니다.",
      successNote: "발송완료일 달력보기 a[role=button]를 페이지 핸들러로 클릭했습니다.",
      isSatisfied: () => Boolean(findAnyOpenDatePicker(this.documentRef)),
    });
  }

  private async clickPageDispatchCompletionYearNext(): Promise<UiOperationResult> {
    return this.runRetriablePageAction({
      action: this.pageDispatchCompletionYearNextClick,
      missingNote: "발송완료일 오른쪽 이중 화살표 페이지 핸들러가 연결되어 있지 않습니다.",
      failedNote: "발송완료일 달력의 changeViewNextYear 오른쪽 버튼을 페이지 핸들러로 클릭하지 못했습니다.",
      successNote: "발송완료일 달력의 changeViewNextYear 오른쪽 버튼을 페이지 핸들러로 클릭했습니다.",
      isSatisfied: () => Boolean(findAnyOpenDatePicker(this.documentRef)),
    });
  }

  private async clickPageDispatchCompletionMonthNextThreeTimes(): Promise<UiOperationResult> {
    if (!this.pageDispatchCompletionMonthNextClick) {
      return {
        ok: false,
        note: "발송완료일 오른쪽 한 개 화살표 페이지 핸들러가 연결되어 있지 않습니다.",
      };
    }

    for (let index = 0; index < 3; index += 1) {
      const clicked = await this.runRetriablePageAction({
        action: this.pageDispatchCompletionMonthNextClick,
        missingNote: "발송완료일 오른쪽 한 개 화살표 페이지 핸들러가 연결되어 있지 않습니다.",
        failedNote: `발송완료일 달력의 changeView(data.currentView, data.rightDate, $event) 오른쪽 버튼 ${index + 1}번째 클릭을 페이지 핸들러로 실행하지 못했습니다.`,
        successNote: `발송완료일 달력의 changeView(data.currentView, data.rightDate, $event) 오른쪽 버튼 ${index + 1}번째 클릭을 페이지 핸들러로 실행했습니다.`,
      });
      if (!clicked.ok) {
        return {
          ok: false,
          note: clicked.note,
        };
      }
    }

    return {
      ok: true,
      note: "발송완료일 달력의 changeView(data.currentView, data.rightDate, $event) 오른쪽 버튼을 페이지 핸들러로 3번 클릭했습니다.",
    };
  }

  private async clickPageDispatchCompletionLastEnabledDay(): Promise<UiOperationResult> {
    const beforeValue = this.readDispatchCompletionDateControlValue();
    return this.runRetriablePageAction({
      action: this.pageDispatchCompletionLastEnabledDayClick,
      missingNote: "발송완료일 마지막 활성 날짜 페이지 핸들러가 연결되어 있지 않습니다.",
      failedNote: "발송완료일 달력의 disabled가 아닌 마지막 td.day span을 페이지 핸들러로 클릭하지 못했습니다.",
      successNote: "발송완료일 달력의 disabled가 아닌 마지막 td.day span을 페이지 핸들러로 클릭했습니다.",
      isSatisfied: () => {
        const afterValue = this.readDispatchCompletionDateControlValue();
        return (
          !findAnyOpenDatePicker(this.documentRef) ||
          (beforeValue !== undefined && afterValue !== beforeValue)
        );
      },
    });
  }

  private async clickPageOptionMenuToggle(): Promise<UiOperationResult> {
    return this.runRetriablePageAction({
      action: this.pageOptionMenuToggleClick,
      missingNote: "메뉴토글 페이지 핸들러가 연결되어 있지 않습니다.",
      failedNote: "a.btn.btn-default[ng-class*=vm.isMenuOpen] 메뉴토글을 페이지 핸들러로 클릭하지 못했습니다.",
      successNote: "a.btn.btn-default[ng-class*=vm.isMenuOpen] 메뉴토글을 페이지 핸들러로 클릭했습니다.",
      isSatisfied: () => {
        const section =
          this.locator.resolveFirst("editor.optionSection").element ??
          findSectionByHints(this.documentRef, OPTION_SECTION_HINTS);
        return Boolean(section && hasExpandedOptionControls(section));
      },
    });
  }

  private async clickPageChoiceTypeOn(): Promise<UiOperationResult> {
    return this.runRetriablePageAction({
      action: this.pageChoiceTypeOnClick,
      missingNote: "선택형 설정함 input 페이지 핸들러가 연결되어 있지 않습니다.",
      failedNote: "#option_choice_type_true 선택형 설정함 input을 페이지 핸들러로 클릭하지 못했습니다.",
      successNote: "#option_choice_type_true 선택형 설정함 input을 페이지 핸들러로 클릭했습니다.",
    });
  }

  private async clickPageChoiceSimpleType(): Promise<UiOperationResult> {
    return this.runRetriablePageAction({
      action: this.pageChoiceSimpleTypeClick,
      missingNote: "단독형 input 페이지 핸들러가 연결되어 있지 않습니다.",
      failedNote: "input[ng-model='vm.choiceType'][value='SIMPLE'] 단독형 input을 페이지 핸들러로 클릭하지 못했습니다.",
      successNote: "input[ng-model='vm.choiceType'][value='SIMPLE'] 단독형 input을 페이지 핸들러로 클릭했습니다.",
    });
  }

  private async fillPageChoiceOptionName(
    option: RequiredOption,
    index: number,
  ): Promise<UiOperationResult> {
    if (!this.pageChoiceOptionNameFill) {
      return {
        ok: false,
        note: "옵션명 input 페이지 핸들러가 연결되어 있지 않습니다.",
      };
    }

    const filled = await this.runRetriablePageAction({
      action: () =>
        this.pageChoiceOptionNameFill?.({ value: option.name, index }) ??
        Promise.resolve(false),
      missingNote: "옵션명 input 페이지 핸들러가 연결되어 있지 않습니다.",
      failedNote: `${index + 1}번째 옵션명 input에 '${option.name}'을 입력하지 못했습니다.`,
      successNote: `${index + 1}번째 옵션명 input에 '${option.name}'을 입력했습니다.`,
    });
    if (!filled.ok) {
      return filled;
    }

    return filled;
  }

  private async fillPageChoiceOptionValue(
    option: RequiredOption,
    index: number,
  ): Promise<UiOperationResult> {
    if (!this.pageChoiceOptionValueFill) {
      return {
        ok: false,
        note: "옵션값 input 페이지 핸들러가 연결되어 있지 않습니다.",
      };
    }

    const filled = await this.runRetriablePageAction({
      action: () =>
        this.pageChoiceOptionValueFill?.({ value: option.value, index }) ??
        Promise.resolve(false),
      missingNote: "옵션값 input 페이지 핸들러가 연결되어 있지 않습니다.",
      failedNote: `${index + 1}번째 옵션값 input에 '${option.value}'을 입력하지 못했습니다.`,
      successNote: `${index + 1}번째 옵션값 input에 '${option.value}'을 입력했습니다.`,
    });
    if (!filled.ok) {
      return filled;
    }

    return filled;
  }

  private async clickPageOptionListApply(index = 0): Promise<UiOperationResult> {
    return this.runRetriablePageAction({
      action: this.pageOptionListApplyClick,
      missingNote: "옵션목록으로 적용 페이지 핸들러가 연결되어 있지 않습니다.",
      failedNote: "a.btn.btn-primary.btn-block[ng-click*=submitToGrid] 옵션목록으로 적용 버튼을 페이지 핸들러로 클릭하지 못했습니다.",
      successNote: `${index + 1}번째 옵션목록으로 적용 버튼을 페이지 핸들러로 클릭했습니다.`,
    });
  }

  private async runTemporaryPreorderClickFlow(): Promise<UiOperationResult[]> {
    return runProductEditClickFlow(
      createPreorderEditClickFlowUnits(
        this.createClickFlowActions(),
        this.getRequiredOptions(),
      ),
    );
  }

  private createClickFlowActions(): ProductEditClickFlowActions {
    return {
      openPreorderSection: () => this.openPreorderDisclosureFirst(),
      enablePreorder: () => this.clickPagePreorderEnabled(),
      openOrderStartCalendar: () => this.clickPageOrderStartCalendar(),
      selectOrderStartCurrentDay: () => this.clickPageOrderStartCurrentDay(),
      selectOrderStartCurrentHour: () => this.clickPageOrderStartCurrentHour(),
      openOrderEndCalendar: () => this.clickPageOrderEndCalendar(),
      moveOrderEndOneYearForward: () => this.clickPageOrderEndYearNext(),
      selectOrderEndLastEnabledDay: () => this.clickPageOrderEndLastEnabledDay(),
      selectOrderEndLastEnabledHour: () => this.clickPageOrderEndLastEnabledHour(),
      selectAfterSaleStatusOn: () => this.clickPageAfterSaleStatusOn(),
      openDispatchCompletionCalendar: () =>
        this.clickPageDispatchCompletionCalendar(),
      moveDispatchCompletionOneYearForward: () =>
        this.clickPageDispatchCompletionYearNext(),
      moveDispatchCompletionThreeMonthsForward: () =>
        this.clickPageDispatchCompletionMonthNextThreeTimes(),
      selectDispatchCompletionLastEnabledDay: () =>
        this.clickPageDispatchCompletionLastEnabledDay(),
      openOptionSection: () => this.clickPageOptionMenuToggle(),
      enableChoiceOption: () => this.clickPageChoiceTypeOn(),
      selectSimpleChoiceOptionType: () => this.clickPageChoiceSimpleType(),
      fillChoiceOptionName: (option, index) =>
        this.fillPageChoiceOptionName(option, index),
      fillChoiceOptionValue: (option, index) =>
        this.fillPageChoiceOptionValue(option, index),
      applyChoiceOptionList: (_option, index) => this.clickPageOptionListApply(index),
    };
  }

  private getRequiredOptions(policy?: RunPolicy): RequiredOption[] {
    return normalizeRequiredOptions(policy?.requiredOptions ?? this.requiredOptions);
  }

  private async ensurePreorderSectionExpanded(
    surface: ConversionSurface,
  ): Promise<UiOperationResult> {
    const section = surface.section;
    if (!section) {
      return { ok: false, note: "예약구매 설정 영역을 찾지 못했습니다." };
    }

    const root = findPreorderSectionRoot(this.documentRef, section);
    if (hasExpandedPreorderControls(root)) {
      return { ok: true, note: "예약구매 영역이 이미 펼쳐져 있습니다." };
    }

    const toggle = findPreorderSectionToggle(root, this.documentRef);
    if (!toggle) {
      return {
        ok: false,
        note: "예약구매 영역을 펼치는 버튼을 찾지 못했습니다.",
      };
    }

    triggerClick(toggle);
    await this.waitForPreorderSectionExpanded();

    const expandedRoot = findPreorderSectionRoot(this.documentRef, root);
    if (!hasExpandedPreorderControls(expandedRoot)) {
      return {
        ok: false,
        note: "예약구매 영역을 클릭했지만 주문기간 설정 영역이 열리지 않았습니다.",
      };
    }

    return { ok: true, note: "예약구매 영역을 펼쳤습니다." };
  }

  private async ensurePreorderEnabled(surface: ConversionSurface): Promise<UiStepResult> {
    if (!surface.preorderOption) {
      return { note: "예약구매 설정함 버튼을 찾지 못했습니다." };
    }

    if (isPreorderEnabledConfirmed(surface)) {
      return "예약구매 설정함이 이미 선택되어 있습니다.";
    }

    scrollElementIntoView(surface.preorderOption);
    await this.waitStrategy.throttle(150);

    if (!clickOption(surface.preorderOption)) {
      return { note: "예약구매 설정함 버튼을 클릭할 수 없습니다." };
    }

    if (!await this.waitForPreorderEnabledConfirmed()) {
      return { note: "예약구매 설정함을 클릭했지만 선택 상태로 바뀌지 않았습니다." };
    }

    return "예약구매 설정함 버튼을 클릭했고 주문기간 영역이 열렸습니다.";
  }

  private async openOrderPeriodStartCalendar(): Promise<UiStepResult> {
    const opened = await this.openOrderPeriodStartCalendarOnly();
    if (typeof opened !== "string") {
      return opened;
    }

    const today = this.getSystemToday();
    const todaySet = await this.selectDateFromOpenDatePicker(today, "오늘 날짜");
    if (!todaySet.ok) {
      return { note: todaySet.note };
    }

    await this.waitStrategy.waitForReady({ timeoutMs: 3_000, retries: 0 });

    const startTimeSet = await this.selectAvailableTimeFromOpenTimePicker(today, "earliest");
    if (!startTimeSet.ok) {
      return { note: startTimeSet.note };
    }

    await this.waitStrategy.waitForReady({ timeoutMs: 3_000, retries: 0 });

    const endCalendarButton = findOrderPeriodCalendarButton(this.documentRef, 1);
    if (!endCalendarButton) {
      const located = this.locator.resolveFirst("editor.orderPeriodControl");
      return {
        note: `주문기간 종료 달력을 찾지 못했습니다. ${located.note}`,
      };
    }

    scrollElementIntoView(endCalendarButton);
    await this.waitStrategy.throttle(120);
    triggerClick(endCalendarButton);
    await this.waitStrategy.waitForReady({ timeoutMs: 3_000, retries: 0 });

    const oneYearLater = addYearsClamped(today, 1);
    const yearSet = this.moveOpenDatePickerToMonth(oneYearLater);
    if (!yearSet.ok) {
      return { note: yearSet.note };
    }

    await this.waitStrategy.waitForReady({ timeoutMs: 3_000, retries: 0 });

    const endDateSet = await this.selectDateFromOpenDatePicker(oneYearLater, "1년 뒤 오늘 날짜");
    if (!endDateSet.ok) {
      return { note: endDateSet.note };
    }

    await this.waitStrategy.waitForReady({ timeoutMs: 3_000, retries: 0 });

    const endTimeSet = await this.selectAvailableTimeFromOpenTimePicker(oneYearLater, "latest");
    if (!endTimeSet.ok) {
      return { note: endTimeSet.note };
    }

    await this.waitStrategy.waitForReady({ timeoutMs: 3_000, retries: 0 });
    return "주문기간 시작일과 종료일을 달력에서 선택했습니다.";
  }

  private async selectOrderPeriodStartTodayOnly(): Promise<UiStepResult> {
    const opened = await this.openOrderPeriodStartCalendarOnly();
    if (typeof opened !== "string") {
      return opened;
    }

    const today = this.getSystemToday();
    const todaySet = await this.selectDateFromOpenDatePicker(today, "오늘 날짜");
    if (!todaySet.ok) {
      return { note: todaySet.note };
    }

    await this.waitStrategy.waitForReady({ timeoutMs: 3_000, retries: 0 });
    if (!findTimePickerForDate(this.documentRef, today)) {
      return {
        note: `${opened} 시스템 오늘 날짜(${today.isoDate})를 눌렀지만 시간 선택으로 넘어가지 않았습니다.`,
      };
    }

    const startTimeSet = await this.selectAvailableTimeFromOpenTimePicker(today, "earliest");
    if (!startTimeSet.ok) {
      return {
        note: `${opened} 오늘 날짜를 눌렀지만 선택 가능한 가장 빠른 시간을 고르지 못했습니다. ${startTimeSet.note}`,
      };
    }

    await this.waitStrategy.waitForReady({ timeoutMs: 3_000, retries: 0 });

    const endOpened = await this.openOrderPeriodEndCalendarOnly();
    if (typeof endOpened !== "string") {
      return {
        note: `${opened} 오늘 날짜와 가장 빠른 시간은 선택했지만 주문기간 종료 달력을 열지 못했습니다. ${endOpened.note}`,
      };
    }

    const oneYearLater = addYearsClamped(today, 1);
    const yearMoved = await this.clickOpenDatePickerYearNextOnce(oneYearLater);
    if (typeof yearMoved !== "string") {
      return {
        note: `${opened} 오늘 날짜와 가장 빠른 시간은 선택하고 종료 달력도 열었지만 1년 뒤 버튼을 누르지 못했습니다. ${yearMoved.note}`,
      };
    }

    const endDateSet = await this.selectDateFromOpenDatePicker(oneYearLater, "1년 뒤 오늘 날짜");
    if (!endDateSet.ok) {
      return {
        note: `${opened} 시작일과 종료 달력 1년 뒤 이동은 완료했지만 1년 뒤 오늘 날짜를 누르지 못했습니다. ${endDateSet.note}`,
      };
    }

    await this.waitStrategy.waitForReady({ timeoutMs: 3_000, retries: 0 });
    if (!findTimePickerForDate(this.documentRef, oneYearLater)) {
      return {
        note: `${opened} 1년 뒤 오늘 날짜를 눌렀지만 종료 시간 선택으로 넘어가지 않았습니다.`,
      };
    }

    const endTimeSet = await this.selectAvailableTimeFromOpenTimePicker(oneYearLater, "latest");
    if (!endTimeSet.ok) {
      return {
        note: `${opened} 1년 뒤 오늘 날짜를 눌렀지만 선택 가능한 가장 늦은 시간을 고르지 못했습니다. ${endTimeSet.note}`,
      };
    }

    await this.waitStrategy.waitForReady({ timeoutMs: 3_000, retries: 0 });

    const postStatusSet = this.selectPostPreorderStatus();
    if (!postStatusSet.ok) {
      return {
        note: `${opened} 주문기간은 설정했지만 예약구매 기간 종료 후 상품 판매 상태의 판매 중 버튼을 누르지 못했습니다. ${postStatusSet.note}`,
      };
    }

    await this.waitStrategy.waitForReady({ timeoutMs: 3_000, retries: 0 });
    const dispatchCalendarOpened = await this.openDispatchCompletionCalendarOnly();
    if (typeof dispatchCalendarOpened !== "string") {
      return {
        note: `${opened} 주문기간과 판매 중 상태는 설정했지만 발송완료일 달력 버튼을 누르지 못했습니다. ${dispatchCalendarOpened.note}`,
      };
    }

    const dispatchYearMoved = await this.clickDispatchCompletionYearNextOnce();
    if (typeof dispatchYearMoved !== "string") {
      return {
        note: `${opened} 발송완료일 달력은 열었지만 오른쪽 이중 화살표를 누르지 못했습니다. ${dispatchYearMoved.note}`,
      };
    }

    const dispatchMonthMoved = await this.clickDispatchCompletionMonthNextThreeTimes();
    if (typeof dispatchMonthMoved !== "string") {
      return {
        note: `${opened} 발송완료일 달력의 오른쪽 이중 화살표는 눌렀지만 오른쪽 한 개 화살표를 3번 누르지 못했습니다. ${dispatchMonthMoved.note}`,
      };
    }

    const dispatchLatestDateSet = await this.selectLatestDispatchCompletionDateFromOpenPicker();
    if (typeof dispatchLatestDateSet !== "string") {
      return {
        note: `${opened} 발송완료일 달력은 원하는 월까지 이동했지만 선택 가능한 가장 마지막 날짜를 누르지 못했습니다. ${dispatchLatestDateSet.note}`,
      };
    }

    const optionDisclosure = await this.openOptionSectionDisclosure();
    if (typeof optionDisclosure !== "string") {
      return {
        note: `${opened} 발송완료일까지 설정했지만 옵션 섹션 아래 화살표를 누르지 못했습니다. ${optionDisclosure.note}`,
      };
    }

    const selectableOptionSet = this.selectSelectableOptionEnabledOnly();
    if (!selectableOptionSet.ok) {
      return {
        note: `${opened} 옵션 섹션은 열었지만 선택형 설정함 버튼을 누르지 못했습니다. ${selectableOptionSet.note}`,
      };
    }

    await this.waitStrategy.waitForReady({ timeoutMs: 3_000, retries: 0 });

    const singleTypeSet = this.selectSingleOptionTypeOnly();
    if (!singleTypeSet.ok) {
      return {
        note: `${opened} 선택형 설정함은 눌렀지만 단독형 라디오 버튼을 누르지 못했습니다. ${singleTypeSet.note}`,
      };
    }

    await this.waitStrategy.waitForReady({ timeoutMs: 3_000, retries: 0 });

    const [requiredOption] = this.getRequiredOptions();
    const optionNameSet = this.writeRequiredOptionNameOnly(requiredOption.name);
    if (!optionNameSet.ok) {
      return {
        note: `${opened} 단독형까지 선택했지만 옵션명 입력칸을 클릭하고 필수 문구를 입력하지 못했습니다. ${optionNameSet.note}`,
      };
    }

    await this.waitStrategy.waitForReady({ timeoutMs: 3_000, retries: 0 });

    const optionValueSet = this.writeRequiredOptionValueOnly(requiredOption.value);
    if (!optionValueSet.ok) {
      return {
        note: `${opened} 옵션명은 입력했지만 옵션값 입력칸을 클릭하고 동의 문구를 입력하지 못했습니다. ${optionValueSet.note}`,
      };
    }

    await this.waitStrategy.waitForReady({ timeoutMs: 3_000, retries: 0 });

    const optionApplySet = await this.applyRequiredOptionListOnly();
    if (!optionApplySet.ok) {
      return {
        note: `${opened} 옵션값은 입력했지만 옵션목록으로 적용 버튼을 누르지 못했습니다. ${optionApplySet.note}`,
      };
    }

    await this.waitStrategy.waitForReady({ timeoutMs: 3_000, retries: 0 });

    // 저장하기 클릭은 사용자가 명시적으로 "저장하라"고 요청할 때까지 막아둡니다.
    // const saveSet = await this.clickSaveButtonOnly();
    // if (!saveSet.ok) {
    //   return {
    //     note: `${opened} 옵션목록 적용까지 완료했지만 저장하기 버튼을 누르지 못했습니다. ${saveSet.note}`,
    //   };
    // }
    // await this.waitStrategy.waitForReady({ timeoutMs: 15_000, retries: 1 });

    return `${opened} 시스템 오늘 날짜(${today.isoDate})를 누르고 선택 가능한 가장 빠른 시간까지 선택했습니다. ${startTimeSet.note} ${endOpened} ${yearMoved} 1년 뒤 오늘 날짜를 정중앙으로 눌렀습니다. 선택 가능한 가장 늦은 시간까지 선택했습니다. ${endTimeSet.note} 예약구매 기간 종료 후 상품 판매 상태를 판매 중으로 선택했습니다. ${postStatusSet.note} ${dispatchCalendarOpened} ${dispatchYearMoved} ${dispatchMonthMoved} ${dispatchLatestDateSet} ${optionDisclosure} ${selectableOptionSet.note} ${singleTypeSet.note} ${optionNameSet.note} ${optionValueSet.note} ${optionApplySet.note} 저장하기 버튼 클릭 단계는 주석 처리되어 실행하지 않았습니다.`;
  }

  private async openOrderPeriodStartCalendarOnly(): Promise<UiStepResult> {
    const startCalendarButton = findOrderPeriodCalendarButton(this.documentRef, 0);
    if (!startCalendarButton) {
      const located = this.locator.resolveFirst("editor.orderPeriodControl");
      return {
        note: `주문기간 시작 달력을 찾지 못했습니다. ${located.note}`,
      };
    }

    scrollElementIntoView(startCalendarButton);
    await this.waitStrategy.throttle(120);
    triggerClick(startCalendarButton);
    await this.waitStrategy.waitForReady({ timeoutMs: 3_000, retries: 0 });

    if (!findAnyOpenDatePicker(this.documentRef)) {
      return {
        note: "주문기간 시작 달력을 클릭했지만 달력 팝업을 확인하지 못했습니다.",
      };
    }

    return "주문기간 시작 달력을 열었습니다.";
  }

  private getSystemToday(): LocalDateParts {
    const dateConstructor = (this.windowRef as Window & typeof globalThis).Date ?? Date;
    return getLocalToday(dateConstructor);
  }

  private async openOrderPeriodEndCalendarOnly(): Promise<UiStepResult> {
    const endCalendarButton = findOrderPeriodCalendarButton(this.documentRef, 1);
    if (!endCalendarButton) {
      const located = this.locator.resolveFirst("editor.orderPeriodControl");
      return {
        note: `주문기간 종료 달력을 찾지 못했습니다. ${located.note}`,
      };
    }

    scrollElementIntoView(endCalendarButton);
    await this.waitStrategy.throttle(120);
    triggerUserClick(endCalendarButton);
    await this.waitStrategy.waitForReady({ timeoutMs: 3_000, retries: 0 });

    if (!findAnyOpenDatePicker(this.documentRef)) {
      return {
        note: "주문기간 종료 달력을 클릭했지만 달력 팝업을 확인하지 못했습니다.",
      };
    }

    return "주문기간 종료 달력을 열었습니다.";
  }

  private async clickOpenDatePickerYearNextOnce(targetDate: LocalDateParts): Promise<UiStepResult> {
    const datePicker = findAnyOpenDatePicker(this.documentRef);
    if (!datePicker) {
      return {
        note: "1년 뒤로 이동할 달력 팝업을 찾지 못했습니다.",
      };
    }

    const yearNextButton = findYearNextButton(datePicker, this.documentRef);
    if (!yearNextButton) {
      if (!clickDatePickerYearNextByCoordinate(datePicker, this.documentRef)) {
        return {
          note: "달력에서 오른쪽 이중 화살표 버튼을 찾지 못했습니다.",
        };
      }
    } else {
      scrollElementIntoView(yearNextButton);
      await this.waitStrategy.throttle(120);
      triggerUserClick(yearNextButton);
    }
    await this.waitStrategy.waitForReady({ timeoutMs: 3_000, retries: 0 });

    if (!findDatePickerForMonth(this.documentRef, targetDate)) {
      const retryPicker = findAnyOpenDatePicker(this.documentRef);
      if (retryPicker && clickDatePickerYearNextByCoordinate(retryPicker, this.documentRef)) {
        await this.waitStrategy.waitForReady({ timeoutMs: 3_000, retries: 0 });
      }
    }

    if (!findDatePickerForMonth(this.documentRef, targetDate)) {
      return {
        note: "오른쪽 이중 화살표를 1번 눌렀지만 1년 뒤 달력으로 바뀌지 않았습니다.",
      };
    }

    return "종료일 달력의 오른쪽 이중 화살표를 정확히 1번 눌렀습니다.";
  }

  private async clickDispatchCompletionYearNextOnce(): Promise<UiStepResult> {
    const datePicker = findAnyOpenDatePicker(this.documentRef);
    if (!datePicker) {
      return {
        note: "오른쪽 이중 화살표를 누를 발송완료일 달력 팝업을 찾지 못했습니다.",
      };
    }

    const yearNextButton = findYearNextButton(datePicker, this.documentRef);
    if (!yearNextButton) {
      if (!clickDatePickerYearNextByCoordinate(datePicker, this.documentRef)) {
        return {
          note: "발송완료일 달력에서 오른쪽 이중 화살표 버튼을 찾지 못했습니다.",
        };
      }
    } else {
      scrollElementIntoView(yearNextButton);
      await this.waitStrategy.throttle(120);
      triggerUserClick(yearNextButton);
    }
    await this.waitStrategy.waitForReady({ timeoutMs: 3_000, retries: 0 });

    return "발송완료일 달력의 오른쪽 이중 화살표를 정중앙으로 정확히 1번 눌렀습니다.";
  }

  private async clickDispatchCompletionMonthNextThreeTimes(): Promise<UiStepResult> {
    for (let index = 0; index < 3; index += 1) {
      const datePicker = findAnyOpenDatePicker(this.documentRef);
      if (!datePicker) {
        return {
          note: "오른쪽 한 개 화살표를 누를 발송완료일 달력 팝업을 찾지 못했습니다.",
        };
      }

      const monthNextButton = findMonthNextButton(datePicker, this.documentRef);
      if (!monthNextButton) {
        if (!clickDatePickerMonthNextByCoordinate(datePicker, this.documentRef)) {
          return {
            note: "발송완료일 달력에서 오른쪽 한 개 화살표 버튼을 찾지 못했습니다.",
          };
        }
      } else {
        scrollElementIntoView(monthNextButton);
        await this.waitStrategy.throttle(120);
        triggerUserClick(monthNextButton);
      }

      if (index < 2) {
        await this.waitStrategy.throttle(400);
      }
    }

    await this.waitStrategy.waitForReady({ timeoutMs: 3_000, retries: 0 });
    return "발송완료일 달력의 오른쪽 한 개 화살표를 400ms 간격으로 정확히 3번 눌렀습니다.";
  }

  private async selectLatestDispatchCompletionDateFromOpenPicker(): Promise<UiStepResult> {
    const datePicker = findAnyOpenDatePicker(this.documentRef);
    if (!datePicker) {
      return {
        note: "발송완료일 달력에서 마지막 날짜를 선택할 달력 팝업을 다시 찾지 못했습니다.",
      };
    }

    const latestDateButton = findLatestAvailableDateButton(datePicker);
    if (!latestDateButton) {
      return {
        note: "발송완료일 달력에서 선택 가능한 가장 마지막 날짜를 찾지 못했습니다.",
      };
    }

    const beforeValue = this.readDispatchCompletionDateControlValue();
    scrollElementIntoView(latestDateButton);
    await this.waitStrategy.throttle(120);
    triggerUserClick(latestDateButton);
    await this.waitStrategy.waitForReady({ timeoutMs: 3_000, retries: 0 });

    const afterValue = this.readDispatchCompletionDateControlValue();
    if (
      beforeValue !== undefined &&
      afterValue === beforeValue &&
      findAnyOpenDatePicker(this.documentRef)
    ) {
      return {
        note: "선택 가능한 가장 마지막 날짜를 눌렀지만 발송완료일 값이 바뀌지 않았습니다.",
      };
    }

    return "발송완료일 달력에서 선택 가능한 가장 마지막 날짜를 정중앙으로 눌렀습니다.";
  }

  private async selectDateFromOpenDatePicker(
    targetDate: LocalDateParts,
    label: string,
  ): Promise<UiOperationResult> {
    const datePicker =
      findDatePickerForMonth(this.documentRef, targetDate) ??
      findAnyOpenDatePicker(this.documentRef);
    if (!datePicker) {
      return {
        ok: false,
        note: `${label}를 선택할 달력 팝업을 찾지 못했습니다. target=${targetDate.isoDate}`,
      };
    }

    const dateButton = findDatePickerDayButton(datePicker, targetDate, this.documentRef);
    if (!dateButton) {
      return {
        ok: false,
        note: `달력에서 ${label} ${targetDate.day}일 버튼을 찾지 못했습니다.`,
      };
    }

    triggerUserClick(dateButton);
    await this.waitStrategy.waitForReady({ timeoutMs: 1_500, retries: 0 });
    if (
      !findTimePickerForDate(this.documentRef, targetDate) &&
      findAnyOpenDatePicker(this.documentRef) &&
      clickDatePickerDayByGridCoordinate(datePicker, targetDate, this.documentRef)
    ) {
      await this.waitStrategy.waitForReady({ timeoutMs: 1_500, retries: 0 });
    }

    return {
      ok: true,
      note: `달력에서 ${label} ${targetDate.isoDate}를 선택했습니다.`,
    };
  }

  private moveOpenDatePickerToMonth(targetDate: LocalDateParts): UiOperationResult {
    if (findDatePickerForMonth(this.documentRef, targetDate)) {
      return {
        ok: true,
        note: `달력이 이미 ${targetDate.year}-${targetDate.month}월을 표시하고 있습니다.`,
      };
    }

    const datePicker = findAnyOpenDatePicker(this.documentRef);
    if (!datePicker) {
      return {
        ok: false,
        note: "1년 뒤로 이동할 달력 팝업을 찾지 못했습니다.",
      };
    }

    const yearNextButton = findYearNextButton(datePicker, this.documentRef);
    if (!yearNextButton) {
      return {
        ok: false,
        note: "달력에서 1년 뒤로 이동하는 버튼을 찾지 못했습니다.",
      };
    }

    triggerUserClick(yearNextButton);
    return {
      ok: true,
      note: "달력에서 1년 뒤로 이동했습니다.",
    };
  }

  private async selectAvailableTimeFromOpenTimePicker(
    targetDate: LocalDateParts,
    preference: TimeSelectionPreference,
  ): Promise<UiOperationResult> {
    const timePicker = findTimePickerForDate(this.documentRef, targetDate);
    if (!timePicker) {
      return {
        ok: false,
        note: `${targetDate.isoDate}의 시간 선택 팝업을 찾지 못했습니다.`,
      };
    }

    const timeOption = findAvailableTimeOption(timePicker, this.documentRef, preference);
    if (!timeOption) {
      return {
        ok: false,
        note:
          preference === "earliest"
            ? "시간 선택 팝업에서 선택 가능한 가장 빠른 시간을 찾지 못했습니다."
            : "시간 선택 팝업에서 선택 가능한 가장 늦은 시간을 찾지 못했습니다.",
      };
    }

    if (await this.clickPageTimeOption(timeOption, preference, targetDate)) {
      return {
        ok: true,
        note:
          preference === "earliest"
            ? `시간 선택 팝업에서 가장 빠른 시간 ${timeOption.label}를 페이지 핸들러로 선택했습니다.`
            : `시간 선택 팝업에서 가장 늦은 시간 ${timeOption.label}를 페이지 핸들러로 선택했습니다.`,
      };
    }

    await this.clickAvailableTimeOption(timePicker, timeOption, targetDate);

    if (findTimePickerForDate(this.documentRef, targetDate)) {
      const fallback = this.writeOrderPeriodDateTimeFallback(
        targetDate,
        timeOption,
        preference,
      );
      if (fallback.ok) {
        await this.waitStrategy.waitForReady({ timeoutMs: 500, retries: 0 });
        return {
          ok: true,
          note:
            preference === "earliest"
              ? `시간 선택 팝업에서 가장 빠른 시간 ${timeOption.label}를 입력값으로 반영했습니다. ${fallback.note}`
              : `시간 선택 팝업에서 가장 늦은 시간 ${timeOption.label}를 입력값으로 반영했습니다. ${fallback.note}`,
        };
      }

      return {
        ok: false,
        note: `시간 선택 팝업에서 ${timeOption.label}를 눌렀지만 팝업이 닫히지 않았습니다. ${fallback.note}`,
      };
    }

    return {
      ok: true,
      note:
        preference === "earliest"
          ? `시간 선택 팝업에서 가장 빠른 시간 ${timeOption.label}를 선택했습니다.`
          : `시간 선택 팝업에서 가장 늦은 시간 ${timeOption.label}를 선택했습니다.`,
    };
  }

  private async clickPageTimeOption(
    timeOption: TimeOptionCandidate,
    preference: TimeSelectionPreference,
    targetDate: LocalDateParts,
  ): Promise<boolean> {
    if (!this.pageTimeClick) {
      return false;
    }

    if (!await this.pageTimeClick({ label: timeOption.label, preference })) {
      return false;
    }

    await this.waitStrategy.waitForReady({ timeoutMs: 700, retries: 0 });
    return !findTimePickerForDate(this.documentRef, targetDate);
  }

  private async clickAvailableTimeOption(
    timePicker: Element,
    timeOption: TimeOptionCandidate,
    targetDate: LocalDateParts,
  ): Promise<void> {
    const clickTargets = uniqueElements(
      [
        timeOption.element,
        timeOption.textElement,
        findClickableDateElement(timeOption.textElement),
        findClickableDateElement(timeOption.element),
        timeOption.textElement.parentElement ?? undefined,
        timeOption.element.parentElement ?? undefined,
      ].filter((element): element is Element => Boolean(element)),
    ).filter(
      (element) =>
        timePicker.contains(element) &&
        isVisible(element) &&
        !isExplicitlyUnavailableTimeOption(element),
    );

    if (this.trustedClick) {
      for (const target of clickTargets) {
        scrollElementIntoView(target);
        await this.waitStrategy.throttle(120);
        if (await this.dispatchTrustedClickForElement(target)) {
          await this.waitStrategy.waitForReady({ timeoutMs: 700, retries: 0 });
          if (!findTimePickerForDate(this.documentRef, targetDate)) {
            return;
          }
        }
      }

      if (await this.dispatchTrustedGridClickForTimeOption(timePicker, timeOption)) {
        await this.waitStrategy.waitForReady({ timeoutMs: 1_500, retries: 0 });
        if (!findTimePickerForDate(this.documentRef, targetDate)) {
          return;
        }
      }
    }

    for (const target of clickTargets) {
      scrollElementIntoView(target);
      triggerUserClick(target);
      await this.waitStrategy.waitForReady({ timeoutMs: 500, retries: 0 });
      if (!findTimePickerForDate(this.documentRef, targetDate)) {
        return;
      }

      triggerClick(target);
      await this.waitStrategy.waitForReady({ timeoutMs: 500, retries: 0 });
      if (!findTimePickerForDate(this.documentRef, targetDate)) {
        return;
      }

      triggerKeyboardActivation(target);
      await this.waitStrategy.waitForReady({ timeoutMs: 500, retries: 0 });
      if (!findTimePickerForDate(this.documentRef, targetDate)) {
        return;
      }
    }

    if (clickTimeOptionByCoordinate(timePicker, timeOption, this.documentRef)) {
      await this.waitStrategy.waitForReady({ timeoutMs: 1_500, retries: 0 });
    }

    if (findTimePickerForDate(this.documentRef, targetDate)) {
      clickTimeOptionByGridCoordinate(timePicker, timeOption, this.documentRef);
      await this.waitStrategy.waitForReady({ timeoutMs: 1_500, retries: 0 });
    }
  }

  private async dispatchTrustedClickForElement(element: Element): Promise<boolean> {
    if (!this.trustedClick || !(element instanceof HTMLElement)) {
      return false;
    }

    const point = getElementCenterPoint(element);
    return point ? this.trustedClick(point) : false;
  }

  private async dispatchTrustedGridClickForTimeOption(
    timePicker: Element,
    timeOption: TimeOptionCandidate,
  ): Promise<boolean> {
    if (!this.trustedClick) {
      return false;
    }

    const point = getTimeOptionGridPoint(timePicker, timeOption);
    return point ? this.trustedClick(point) : false;
  }

  private writeOrderPeriodDateTimeFallback(
    targetDate: LocalDateParts,
    timeOption: TimeOptionCandidate,
    preference: TimeSelectionPreference,
  ): UiOperationResult {
    const inputIndex = preference === "earliest" ? 0 : 1;
    const input = findOrderPeriodDateTimeInput(this.documentRef, inputIndex);
    if (!input) {
      return {
        ok: false,
        note: "주문기간 입력칸을 찾지 못해 시간 값을 직접 반영하지 못했습니다.",
      };
    }

    const value = buildDateTimeInputValue(input, targetDate, timeOption.label);
    scrollElementIntoView(input);
    triggerUserClick(input);
    if (!writeInputValueWithNativeSetter(input, value)) {
      return {
        ok: false,
        note: `주문기간 입력칸에 ${value} 값을 쓸 수 없었습니다.`,
      };
    }

    dispatchInputEvents(input);
    dispatchEscape(input);
    input.blur();
    return {
      ok: true,
      note: `주문기간 ${inputIndex === 0 ? "시작" : "종료"} 입력칸에 ${value} 값을 반영했습니다.`,
    };
  }

  private async resolveRequiredMaxDate(
    control: "editor.orderPeriodControl" | "editor.dispatchCompletionDateControl",
    policy: RunPolicy,
    product: Product,
    label: string,
  ): Promise<{ value: string; note: string } | ProcessingResult> {
    const resolved = await this.dateResolver.resolveMaximumAllowedDate({ control, policy });
    if (!resolved.value) {
      return failureResult(
        product,
        ProductProcessingState.VERIFICATION_REQUIRED,
        `${label}의 최대 허용일을 화면에서 확인하지 못했습니다. ${resolved.note}`,
        this.gateway,
        true,
      );
    }

    return {
      value: resolved.value,
      note: `${label} 최대값=${resolved.value} (${resolved.note})`,
    };
  }

  private resolveConversionSurface(): ConversionSurface {
    const notes: string[] = [];
    const locatedSection = this.locator.resolveFirst("editor.preorderSection");
    if (locatedSection.note) {
      notes.push(locatedSection.note);
    }

    const sectionCandidate =
      locatedSection.element ??
      findSectionByHints(this.documentRef, PRODUCT_TYPE_SECTION_HINTS, (element) => {
        const text = normalizeWhitespace(element.textContent);
        return includesAny(text, PREORDER_HINTS);
      });

    const section = sectionCandidate
      ? findPreorderSectionRoot(this.documentRef, sectionCandidate)
      : undefined;

    if (!section) {
      notes.push("Fallback section search did not find preorder/product type text.");
      return { notes };
    }

    const normalLocated = this.locator.resolveFirst("editor.normalProductOption", section);
    const preorderLocated = this.locator.resolveFirst("editor.preorderProductOption", section);
    const normalOption =
      findPreorderDisabledControl(section, this.documentRef) ??
      asOptionCandidate(normalLocated.element) ??
      findOptionByHints(section, NORMAL_HINTS, this.documentRef) ??
      findOptionByHints(section, PREORDER_DISABLED_HINTS, this.documentRef);
    const preorderOption =
      findPreorderEnabledControl(section, this.documentRef) ??
      asOptionCandidate(preorderLocated.element) ??
      findOptionByHints(section, PREORDER_HINTS, this.documentRef) ??
      findOptionByHints(section, PREORDER_ENABLED_HINTS, this.documentRef);

    notes.push(normalLocated.note, preorderLocated.note);

    if (!normalLocated.element && normalOption) {
      notes.push("Resolved normal-product option by fallback text/label search.");
    }

    if (!preorderLocated.element && preorderOption) {
      notes.push("Resolved preorder option by fallback text/label search.");
    }

    return {
      section,
      normalOption,
      preorderOption,
      notes: notes.filter(Boolean),
    };
  }

  private writeMaximumDate(
    key: "editor.orderPeriodControl" | "editor.dispatchCompletionDateControl",
    value: string,
  ): { ok: boolean; note: string } {
    const located = this.locator.resolveFirst(key);
    const element =
      located.element ??
      findSectionByHints(
        this.documentRef,
        key === "editor.orderPeriodControl" ? ["주문기간", "주문 기간"] : ["발송완료일", "발송 완료일", "발송기한"],
      );

    if (!element) {
      return { ok: false, note: `${key} control was not found. ${located.note}` };
    }

    if (!writeDateLikeValue(element, value)) {
      return { ok: false, note: `${key} had no writable date input/select.` };
    }

    return { ok: true, note: `${key}=${value}` };
  }

  private selectPostPreorderStatus(): { ok: boolean; note: string } {
    const located = this.locator.resolveFirst("editor.postPreorderStatusControl");
    const element =
      located.element ??
      findSectionByHints(this.documentRef, ["판매상태", "판매 상태", "예약구매 기간 종료"]);

    if (!element) {
      return { ok: false, note: `post-preorder status control was not found. ${located.note}` };
    }

    return selectControlByHints(element, ON_SALE_HINTS, this.documentRef);
  }

  private async openOptionSectionDisclosure(): Promise<UiStepResult> {
    const section =
      this.locator.resolveFirst("editor.optionSection").element ??
      findSectionByHints(this.documentRef, OPTION_SECTION_HINTS);
    if (!section) {
      return { note: "옵션 섹션을 찾지 못했습니다." };
    }

    scrollElementIntoView(section);
    await this.waitStrategy.throttle(120);

    if (hasExpandedOptionControls(section)) {
      return "옵션 섹션이 이미 펼쳐져 있습니다.";
    }

    const toggle = findOptionSectionToggle(section, this.documentRef);
    if (!toggle) {
      return { note: "옵션 섹션의 아래 화살표 버튼을 찾지 못했습니다." };
    }

    triggerUserClick(toggle);
    await this.waitStrategy.waitForReady({ timeoutMs: 5_000, retries: 1 });

    if (!hasExpandedOptionControls(section)) {
      return { note: "옵션 섹션 아래 화살표를 클릭했지만 옵션 입력 영역이 열리지 않았습니다." };
    }

    return "옵션 섹션 아래 화살표 버튼을 클릭했습니다.";
  }

  private async openDispatchCompletionCalendar(): Promise<UiStepResult> {
    const opened = await this.openDispatchCompletionCalendarOnly();
    if (typeof opened !== "string") {
      return opened;
    }

    const yearMoved = await this.clickDispatchCompletionYearNextOnce();
    if (typeof yearMoved !== "string") {
      return yearMoved;
    }

    const monthMoved = await this.clickDispatchCompletionMonthNextThreeTimes();
    if (typeof monthMoved !== "string") {
      return monthMoved;
    }

    const latestDateSet = await this.selectLatestDispatchCompletionDateFromOpenPicker();
    if (typeof latestDateSet !== "string") {
      return latestDateSet;
    }

    return `발송완료일 달력을 열고 1년 뒤, 다음 달 3회 이동 후 선택 가능한 마지막 날짜를 클릭했습니다. ${latestDateSet}`;
  }

  private async openDispatchCompletionCalendarOnly(): Promise<UiStepResult> {
    const located = this.locator.resolveFirst("editor.dispatchCompletionDateControl");
    const element =
      located.element ??
      findSectionByHints(this.documentRef, ["발송완료일", "발송 완료일", "발송기한"]);
    const calendarButton = element ? findCalendarButton(element, this.documentRef, 0) : undefined;
    if (!calendarButton) {
      return {
        note: `발송완료일 달력 버튼을 찾지 못했습니다. ${located.note}`,
      };
    }

    scrollElementIntoView(calendarButton);
    await this.waitStrategy.throttle(120);
    triggerUserClick(calendarButton);
    await this.waitStrategy.waitForReady({ timeoutMs: 3_000, retries: 0 });

    if (!findAnyOpenDatePicker(this.documentRef)) {
      return {
        note: "발송완료일 달력 팝업을 찾지 못했습니다.",
      };
    }

    return "발송완료일 달력을 열었습니다.";
  }

  private readDispatchCompletionDateControlValue(): string | undefined {
    const located = this.locator.resolveFirst("editor.dispatchCompletionDateControl");
    const element =
      located.element ??
      findSectionByHints(this.documentRef, ["발송완료일", "발송 완료일", "발송기한"]);

    if (!element) {
      return undefined;
    }

    const input = element instanceof HTMLInputElement ? element : element.querySelector("input");
    if (input instanceof HTMLInputElement) {
      return input.value;
    }

    return element.getAttribute("value") ?? undefined;
  }

  private async writeRequiredSingleOptions(
    options: readonly RequiredOption[],
  ): Promise<{ ok: boolean; note: string }> {
    const requiredOptions = normalizeRequiredOptions(options);
    const section =
      this.locator.resolveFirst("editor.optionSection").element ??
      findSectionByHints(this.documentRef, OPTION_SECTION_HINTS);

    if (!section) {
      return { ok: false, note: "option section was not found." };
    }

    const enabledResult = this.selectSelectableOptionEnabledOnly(section);
    if (!enabledResult.ok) {
      return enabledResult;
    }
    await this.waitStrategy.waitForReady({ timeoutMs: 3_000, retries: 0 });

    const typeResult = this.selectSingleOptionTypeOnly(section);
    if (!typeResult.ok) {
      return typeResult;
    }
    await this.waitStrategy.waitForReady({ timeoutMs: 3_000, retries: 0 });

    for (const [index, option] of requiredOptions.entries()) {
      const optionNameResult = this.writeRequiredOptionNameOnly(option.name, section);
      if (!optionNameResult.ok) {
        return {
          ok: false,
          note: `${index + 1}번째 옵션명 입력 실패: ${optionNameResult.note}`,
        };
      }

      const optionValueResult = this.writeRequiredOptionValueOnly(option.value, section);
      if (!optionValueResult.ok) {
        return {
          ok: false,
          note: `${index + 1}번째 옵션값 입력 실패: ${optionValueResult.note}`,
        };
      }

      const applyResult = await this.applyRequiredOptionListOnly(section);
      if (!applyResult.ok) {
        return {
          ok: false,
          note: `${index + 1}번째 옵션목록 적용 실패: ${applyResult.note}`,
        };
      }
    }

    return { ok: true, note: `required options=${requiredOptions.length}` };
  }

  private writeRequiredOptionNameOnly(
    optionName: string,
    sectionOverride?: Element,
  ): { ok: boolean; note: string } {
    const section =
      sectionOverride ??
      this.locator.resolveFirst("editor.optionSection").element ??
      findSectionByHints(this.documentRef, OPTION_SECTION_HINTS);

    if (!section) {
      return { ok: false, note: "option section was not found." };
    }

    const optionNameInput =
      findWritableTextInput(this.locator.resolveFirst("editor.optionNameControl", section).element) ??
      findInputByLabelHints(section, OPTION_NAME_HINTS, this.documentRef) ??
      findNthTextInput(section, 0);
    if (!optionNameInput) {
      return { ok: false, note: "option name input was not found." };
    }

    scrollElementIntoView(optionNameInput);
    triggerUserClick(optionNameInput);
    if (!writeTextInput(optionNameInput, optionName)) {
      return { ok: false, note: "option name input was not writable." };
    }

    return { ok: true, note: "옵션명 입력칸을 클릭하고 필수 문구를 입력했습니다." };
  }

  private writeRequiredOptionValueOnly(
    optionValue: string,
    sectionOverride?: Element,
  ): { ok: boolean; note: string } {
    const section =
      sectionOverride ??
      this.locator.resolveFirst("editor.optionSection").element ??
      findSectionByHints(this.documentRef, OPTION_SECTION_HINTS);

    if (!section) {
      return { ok: false, note: "option section was not found." };
    }

    const optionValueInput =
      findWritableTextInput(this.locator.resolveFirst("editor.optionValueControl", section).element) ??
      findInputByLabelHints(section, OPTION_VALUE_HINTS, this.documentRef) ??
      findNthTextInput(section, 1);
    if (!optionValueInput) {
      return { ok: false, note: "option value input was not found." };
    }

    scrollElementIntoView(optionValueInput);
    triggerUserClick(optionValueInput);
    if (!writeTextInput(optionValueInput, optionValue)) {
      return { ok: false, note: "option value input was not writable." };
    }

    return { ok: true, note: "옵션값 입력칸을 클릭하고 동의 문구를 입력했습니다." };
  }

  private async applyRequiredOptionListOnly(
    sectionOverride?: Element,
  ): Promise<{ ok: boolean; note: string }> {
    const section =
      sectionOverride ??
      this.locator.resolveFirst("editor.optionSection").element ??
      findSectionByHints(this.documentRef, OPTION_SECTION_HINTS);

    if (!section) {
      return { ok: false, note: "option section was not found." };
    }

    const applyControl = findOptionListApplyControl(section, this.documentRef);
    if (!applyControl) {
      return { ok: false, note: "option list apply control was not found." };
    }

    scrollElementIntoView(applyControl);
    if (!clickOption(applyControl)) {
      return { ok: false, note: "option list apply control could not be clicked." };
    }
    await this.waitStrategy.waitForReady({ timeoutMs: 3_000, retries: 0 });

    return { ok: true, note: "옵션목록으로 적용 버튼을 클릭했습니다." };
  }

  private async clickSaveButtonOnly(): Promise<{ ok: boolean; note: string }> {
    const saveButton = this.resolveSaveButton();
    if (!saveButton) {
      return { ok: false, note: "save button was not found." };
    }

    if (isDisabled(saveButton)) {
      return { ok: false, note: "save button is disabled." };
    }

    scrollElementIntoView(saveButton);
    triggerUserClick(saveButton);

    const productManagement = await this.clickProductManagementAfterSave();
    if (!productManagement.ok) {
      return {
        ok: false,
        note: `저장하기 버튼은 클릭했지만 저장 완료 후 상품관리 화면으로 돌아가지 못했습니다. ${productManagement.note}`,
      };
    }

    return { ok: true, note: productManagement.note };
  }

  private async saveAfterTemporaryPreorderFlow(
    product: Product,
    steps: readonly UiOperationResult[],
    plan?: PreorderChangePlan,
  ): Promise<ProcessingResult> {
    const failedStep = steps.find((step) => !step.ok);
    if (failedStep) {
      return stoppedResult(
        product,
        `예약구매 설정 중 멈췄습니다. 저장하지 않고 다음 상품으로 넘어가지 않습니다. 실패 단계: ${failedStep.note}`,
      );
    }

    const saveSet = await this.clickSaveButtonOnly();
    if (!saveSet.ok) {
      return stoppedResult(
        product,
        `예약구매 입력은 끝났지만 저장 완료 확인 또는 상품관리 복귀가 끝나지 않아 다음 상품으로 넘어가지 않습니다. ${saveSet.note}`,
      );
    }

    return {
      productId: product.id,
      state: ProductProcessingState.SUCCEEDED,
      message: TEMP_PREORDER_FLOW_SUCCESS_MESSAGE,
      retryable: false,
      ...(plan ? { plan } : {}),
      artifacts: [],
    };
  }

  private async clickProductManagementAfterSave(): Promise<UiOperationResult> {
    if (isProductManagementListUrl(this.gateway.getPageUrl())) {
      return { ok: true, note: "상품관리 목록 화면 복귀를 확인했습니다." };
    }

    const buttonAppeared = await this.waitUntil(
      () => {
        this.clickConfirmationIfPresent();
        return (
          isProductManagementListUrl(this.gateway.getPageUrl()) ||
          Boolean(this.resolveProductManagementButton())
        );
      },
      SAVE_COMPLETION_TIMEOUT_MS,
      SAVE_FLOW_POLL_MS,
    );
    if (isProductManagementListUrl(this.gateway.getPageUrl())) {
      return { ok: true, note: "상품관리 목록 화면 복귀를 확인했습니다." };
    }

    const productManagementButton = buttonAppeared
      ? this.resolveProductManagementButton()
      : undefined;
    if (!productManagementButton) {
      return {
        ok: false,
        note: "저장 완료 화면의 상품관리 버튼(button[ng-click='vm.goSearch()'])을 찾지 못했습니다.",
      };
    }

    const clicked = await this.clickProductManagementButtonUntilList(
      productManagementButton,
    );
    if (!clicked) {
      return {
        ok: false,
        note: "상품관리 버튼을 여러 방식으로 클릭했지만 상품관리 목록 URL로 돌아온 것을 확인하지 못했습니다.",
      };
    }

    return { ok: true, note: "상품관리 목록 화면 복귀를 확인했습니다." };
  }

  private async clickProductManagementButtonUntilList(
    initialButton: Element,
  ): Promise<boolean> {
    const startedAt = Date.now();
    const clickAttempts = [
      (element: Element) => triggerUserClick(element),
      (element: Element) => triggerClick(element),
      (element: Element) => triggerKeyboardActivation(element),
    ];

    for (const clickAttempt of clickAttempts) {
      if (isProductManagementListUrl(this.gateway.getPageUrl())) {
        return true;
      }

      const button = this.resolveProductManagementButton() ?? initialButton;
      scrollElementIntoView(button);
      clickAttempt(button);

      const remainingMs =
        PRODUCT_MANAGEMENT_NAVIGATION_TIMEOUT_MS - (Date.now() - startedAt);
      if (remainingMs <= 0) {
        break;
      }

      const reachedList = await this.waitUntil(
        () => isProductManagementListUrl(this.gateway.getPageUrl()),
        Math.min(remainingMs, 1_500),
        SAVE_FLOW_POLL_MS,
      );
      if (reachedList) {
        return true;
      }
    }

    return isProductManagementListUrl(this.gateway.getPageUrl());
  }

  private selectSelectableOptionEnabledOnly(sectionOverride?: Element): { ok: boolean; note: string } {
    const section =
      sectionOverride ??
      this.locator.resolveFirst("editor.optionSection").element ??
      findSectionByHints(this.documentRef, OPTION_SECTION_HINTS);

    if (!section) {
      return { ok: false, note: "option section was not found." };
    }

    const enabled =
      findSelectableOptionEnabledControl(section, this.documentRef) ??
      this.locator.resolveFirst("editor.optionEnabledControl", section).element ??
      findOptionByHints(section, OPTION_ENABLED_HINTS, this.documentRef);
    if (!enabled) {
      return { ok: false, note: "option enabled control was not found." };
    }

    scrollElementIntoView(enabled);
    const enabledResult = selectControlByHints(enabled, OPTION_ENABLED_HINTS, this.documentRef);
    if (!enabledResult.ok && !clickOption(enabled)) {
      return {
        ok: false,
        note: `option enabled control could not be selected. ${enabledResult.note}`,
      };
    }

    return { ok: true, note: "선택형 설정함 버튼을 클릭했습니다." };
  }

  private selectSingleOptionTypeOnly(sectionOverride?: Element): { ok: boolean; note: string } {
    const section =
      sectionOverride ??
      this.locator.resolveFirst("editor.optionSection").element ??
      findSectionByHints(this.documentRef, OPTION_SECTION_HINTS);

    if (!section) {
      return { ok: false, note: "option section was not found." };
    }

    const typeControl =
      findSingleOptionTypeRadioControl(section, this.documentRef) ??
      this.locator.resolveFirst("editor.optionTypeControl", section).element ??
      findOptionByHints(section, OPTION_TYPE_SINGLE_HINTS, this.documentRef);
    if (!typeControl) {
      return { ok: false, note: "single option type control was not found." };
    }

    if (isOptionSelected(typeControl)) {
      return { ok: true, note: "단독형 라디오 버튼이 이미 선택되어 있습니다." };
    }

    scrollElementIntoView(typeControl);
    triggerUserClick(typeControl);
    if (typeControl instanceof HTMLInputElement) {
      dispatchInputEvents(typeControl);
    }

    return { ok: true, note: "단독형 라디오 버튼을 정중앙으로 클릭했습니다." };
  }

  private resolveSaveButton(): Element | undefined {
    for (const selector of [
      'button[data-nclicks-code="flt.save"][progress-button="vm.submit()"]',
      'button[data-nclicks-code="flt.save"]',
      'button[progress-button="vm.submit()"]',
    ]) {
      const explicit = Array.from(this.documentRef.querySelectorAll(selector)).find(
        (element) =>
          isVisible(element) &&
          !isDisabled(element) &&
          includesAny(element.textContent, SAVE_HINTS),
      );
      if (explicit) {
        return explicit;
      }
    }

    const direct = this.locator.resolveFirst("editor.saveButton");
    if (
      direct.element &&
      isVisible(direct.element) &&
      !isDisabled(direct.element) &&
      includesAny(direct.element.textContent, SAVE_HINTS)
    ) {
      return direct.element;
    }

    return Array.from(this.documentRef.querySelectorAll("button, a, [role='button']"))
      .filter((element) => isVisible(element) && !isDisabled(element))
      .find((element) => includesAny(element.textContent, SAVE_HINTS));
  }

  private resolveProductManagementButton(): Element | undefined {
    for (const selector of [
      'button[ng-click*="goSearch"]',
      'a[ng-click*="goSearch"]',
      '[role="button"][ng-click*="goSearch"]',
      'button[data-ng-click*="goSearch"]',
      'a[data-ng-click*="goSearch"]',
      '[role="button"][data-ng-click*="goSearch"]',
      '[ng-click*="goSearch"]',
      '[data-ng-click*="goSearch"]',
    ]) {
      const explicit = Array.from(this.documentRef.querySelectorAll(selector)).find(
        (element) =>
          isVisible(element) &&
          !isDisabled(element) &&
          isProductManagementReturnControl(element, this.documentRef),
      );
      if (explicit) {
        return explicit;
      }
    }

    return Array.from(this.documentRef.querySelectorAll("button, a, [role='button']"))
      .filter((element) => isVisible(element) && !isDisabled(element))
      .find(
        (element) =>
          isProductManagementReturnControl(element, this.documentRef) &&
          isSaveCompletionContext(element),
      );
  }

  private isConversionLocked(surface: ConversionSurface): boolean {
    if (surface.preorderOption && isDisabled(surface.preorderOption)) {
      return true;
    }

    const sectionText = normalizeWhitespace(surface.section?.textContent);
    return (
      sectionText.includes("불가") &&
      LOCK_HINTS.filter((hint) => sectionText.includes(normalizeWhitespace(hint))).length >= 2
    );
  }

  private clickConfirmationIfPresent(): void {
    const dialog = this.documentRef.querySelector("[role='dialog'], [aria-modal='true']");
    if (!dialog) {
      return;
    }

    const button = Array.from(dialog.querySelectorAll("button, a, [role='button']"))
      .filter((element) => isVisible(element) && !isDisabled(element))
      .find((element) => includesAny(element.textContent, CONFIRM_HINTS));

    if (button) {
      triggerClick(button);
    }
  }
}

function failureResult(
  product: Product,
  state: ProductProcessingState,
  message: string,
  gateway: SellerCenterPageGatewayPort,
  retryable = true,
): ProcessingResult {
  return {
    productId: product.id,
    state,
    message,
    retryable,
    artifacts: [
      {
        kind: "html",
        note: `Captured html snapshot length=${gateway.captureHtmlSnapshot().length}`,
      },
    ],
  };
}

function isProductDetailPageUrl(url: string): boolean {
  const normalized = decodeURIComponentSafe(url).toLowerCase();

  if (
    normalized.includes("origin-edit") ||
    normalized.includes("product-edit") ||
    normalized.includes("/edit") ||
    normalized.includes("edit?")
  ) {
    return false;
  }

  return (
    normalized.includes("/detail") ||
    normalized.includes("detail/") ||
    normalized.includes("product-detail") ||
    normalized.includes("products/detail")
  );
}

function isProductManagementListUrl(url: string): boolean {
  const normalized = decodeURIComponentSafe(url).toLowerCase();
  if (
    normalized.includes("origin-edit") ||
    normalized.includes("product-edit") ||
    normalized.includes("products/edit") ||
    normalized.includes("/edit") ||
    normalized.includes("edit?")
  ) {
    return false;
  }

  return (
    normalized.includes("origin-list") ||
    normalized.includes("product-list") ||
    normalized.includes("products/list") ||
    /[#/]products(?:[/?#]|$)/.test(normalized)
  );
}

function isSaveCompletionContext(element: Element): boolean {
  let current: Element | null = element;

  for (let depth = 0; current && depth < 6; depth += 1) {
    const text = normalizeWhitespace(current.textContent);
    const hasProductManagement =
      text.includes("상품관리") || text.includes("상품 관리");
    const hasSaveCompletionHint =
      text.includes("저장") ||
      text.includes("완료") ||
      text.includes("수정완료") ||
      text.includes("수정 완료") ||
      text.includes("상품수정") ||
      text.includes("상품 수정");

    if (hasProductManagement && hasSaveCompletionHint) {
      return true;
    }

    current = current.parentElement;
  }

  return false;
}

function isProductManagementReturnControl(
  element: Element,
  documentRef: Document,
): boolean {
  return includesAny(resolveElementText(element, documentRef), [
    "상품관리",
    "상품 관리",
  ]);
}

function hasProductEditAutomationSurface(documentRef: Document): boolean {
  if (
    documentRef.querySelector(
      [
        "[name='preOrder']",
        "input#preOrder1_1",
        "input[data-nclicks-code='pro.on']",
        "ncp-datetime-range-picker2[data-nclicks-code='pro.period']",
        "ncp-datetime-picker2[data-nclicks-code='pro.shipcompl']",
      ].join(","),
    )
  ) {
    return true;
  }

  const text = normalizeWhitespace(documentRef.body?.textContent);
  return (
    text.includes("예약구매") ||
    text.includes("예약 구매") ||
    (text.includes("상품수정") && text.includes("주문기간"))
  );
}

function decodeURIComponentSafe(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function skippedResult(
  product: Product,
  message: string,
  notes: readonly string[] = [],
): ProcessingResult {
  return {
    productId: product.id,
    state: ProductProcessingState.SKIPPED,
    message: notes.length > 0 ? `${message} ${notes.join(" | ")}` : message,
    retryable: false,
    artifacts: [],
  };
}

function stoppedResult(
  product: Product,
  message: string,
): ProcessingResult {
  return {
    productId: product.id,
    state: ProductProcessingState.STOPPED,
    message,
    retryable: false,
    artifacts: [],
  };
}

function findSectionByHints(
  documentRef: Document,
  hints: readonly string[],
  predicate?: (element: Element) => boolean,
): Element | undefined {
  const candidates = Array.from(
    documentRef.querySelectorAll("fieldset, section, article, tr, li, div, dl"),
  );

  return candidates
    .filter((element) => includesAny(element.textContent, hints))
    .find((element) => (predicate ? predicate(element) : true));
}

function findCollapsedPreorderToggle(documentRef: Document): Element | undefined {
  const rowToggle = findPreorderDisclosureControlFromRow(documentRef);
  if (rowToggle) {
    return rowToggle;
  }

  const controls = Array.from(
    documentRef.querySelectorAll("button, a, summary, [role='button']"),
  ).filter((element) => isVisible(element) && !isDisabled(element));

  const candidates = controls
    .map((control) => {
      const text = normalizeWhitespace(resolveElementText(control, documentRef));
      const ariaExpanded = control.getAttribute("aria-expanded");
      const context = findNearestSettingContext(control);
      if (!context || !isLocalPreorderSettingContext(context)) {
        return null;
      }

      const contextText = normalizeWhitespace(context.textContent);
      const isCollapsedLike =
        ariaExpanded === "false" ||
        includesAny(text, ["펼치기", "열기", "확장"]) ||
        (includesAny(text, PREORDER_DISABLED_HINTS) &&
          !includesAny(contextText, PREORDER_ENABLED_HINTS) &&
          !includesAny(contextText, ORDER_PERIOD_HINTS));

      if (!isCollapsedLike) {
        return null;
      }

      return {
        control,
        score: scorePreorderDisclosureControl(control, context),
      };
    })
    .filter((candidate): candidate is { control: Element; score: number } =>
      Boolean(candidate),
    )
    .sort((left, right) => left.score - right.score);

  return candidates[0]?.control;
}

function findExpandedPreorderSection(documentRef: Document): Element | undefined {
  const section =
    findSectionByHints(documentRef, PRODUCT_TYPE_SECTION_HINTS, (element) => {
      const text = normalizeWhitespace(element.textContent);
      return includesAny(text, PREORDER_HINTS);
    }) ?? findSectionByHints(documentRef, PREORDER_HINTS);

  if (!section) {
    return undefined;
  }

  const root = findPreorderSectionRoot(documentRef, section);
  return hasExpandedPreorderControls(root) ? root : undefined;
}

function findPreorderDisclosureControlFromRow(documentRef: Document): Element | undefined {
  const rows = Array.from(
    documentRef.querySelectorAll("fieldset, section, article, tr, li, dl, div"),
  )
    .filter((element) => {
      const text = normalizeWhitespace(element.textContent);
      return (
        isVisible(element) &&
        includesAny(text, PREORDER_HINTS) &&
        includesAny(text, PREORDER_DISABLED_HINTS) &&
        !includesAny(text, NON_PREORDER_SETTING_HINTS) &&
        !includesAny(text, ORDER_PERIOD_HINTS)
      );
    })
    .sort((left, right) => {
      const leftText = normalizeWhitespace(left.textContent);
      const rightText = normalizeWhitespace(right.textContent);
      return leftText.length - rightText.length;
    });

  for (const row of rows) {
    const controls = Array.from(
      row.querySelectorAll("button, a, summary, [role='button']"),
    ).filter((element) => !isDisabled(element));
    const explicitCollapsed = controls.find(
      (control) => control.getAttribute("aria-expanded") === "false",
    );
    if (explicitCollapsed) {
      return explicitCollapsed;
    }

    const disabledLabelControl = controls.find((control) =>
      includesAny(resolveElementText(control, documentRef), PREORDER_DISABLED_HINTS),
    );
    if (disabledLabelControl) {
      return disabledLabelControl;
    }

    const lastControl = controls.at(-1);
    if (lastControl) {
      return lastControl;
    }
  }

  return undefined;
}

function findNearestSettingContext(element: Element): Element | undefined {
  let current: Element | null = element.parentElement;
  let depth = 0;

  while (current && depth < 8) {
    const text = normalizeWhitespace(current.textContent);
    if (
      includesAny(text, PREORDER_HINTS) ||
      includesAny(text, NON_PREORDER_SETTING_HINTS)
    ) {
      return current;
    }

    current = current.parentElement;
    depth += 1;
  }

  return undefined;
}

function isLocalPreorderSettingContext(element: Element): boolean {
  const text = normalizeWhitespace(element.textContent);
  return (
    includesAny(text, PREORDER_HINTS) &&
    !includesAny(text, NON_PREORDER_SETTING_HINTS)
  );
}

function scorePreorderDisclosureControl(control: Element, section: Element): number {
  const controlText = normalizeWhitespace(control.textContent);
  const sectionText = normalizeWhitespace(section.textContent);
  let score = sectionText.length;

  if (control.getAttribute("aria-expanded") === "false") {
    score -= 800;
  }

  if (includesAny(controlText, PREORDER_DISABLED_HINTS)) {
    score -= 600;
  }

  if (includesAny(sectionText, ORDER_PERIOD_HINTS)) {
    score += 500;
  }

  return score;
}

function findPreorderSectionRoot(documentRef: Document, seed: Element): Element {
  const seedRoot = seed.closest("fieldset, section, article, tr, li, div, dl") ?? seed;
  const candidates = Array.from(
    documentRef.querySelectorAll("fieldset, section, article, tr, li, div, dl"),
  ).filter((element) => includesAny(element.textContent, PREORDER_HINTS));

  return [seedRoot, ...candidates]
    .filter((element, index, all) => all.indexOf(element) === index)
    .sort(comparePreorderSectionCandidate)
    .at(0) ?? seedRoot;
}

function comparePreorderSectionCandidate(left: Element, right: Element): number {
  return scorePreorderSectionCandidate(left) - scorePreorderSectionCandidate(right);
}

function scorePreorderSectionCandidate(element: Element): number {
  const text = normalizeWhitespace(element.textContent);
  let score = text.length;

  if (!isVisible(element)) {
    score += 2_000;
  }

  if (includesAny(text, ORDER_PERIOD_HINTS)) {
    score -= 1_000;
  }

  if (includesAny(text, PREORDER_ENABLED_HINTS)) {
    score -= 500;
  }

  if (includesAny(text, PREORDER_DISABLED_HINTS)) {
    score -= 250;
  }

  return score;
}

function hasExpandedPreorderControls(root: Element): boolean {
  const text = getVisibleElementText(root);
  return (
    includesAny(text, ORDER_PERIOD_HINTS) ||
    (includesAny(text, PREORDER_ENABLED_HINTS) &&
      includesAny(text, PREORDER_DISABLED_HINTS))
  );
}

function isPreorderSettingToggleSection(root: Element): boolean {
  const text = getVisibleElementText(root);
  return (
    includesAny(text, PREORDER_ENABLED_HINTS) &&
    includesAny(text, PREORDER_DISABLED_HINTS)
  );
}

function isPreorderEnabledConfirmed(
  surface: ConversionSurface,
  allowOrderPeriodEvidence = false,
): boolean {
  if (surface.preorderOption && isOptionSelected(surface.preorderOption)) {
    return true;
  }

  if (!allowOrderPeriodEvidence || !surface.section) {
    return false;
  }

  const root = findPreorderSectionRoot(surface.section.ownerDocument, surface.section);
  const text = getVisibleElementText(root);
  return includesAny(text, ORDER_PERIOD_HINTS);
}

function findPreorderSectionToggle(
  root: Element,
  documentRef: Document,
): Element | undefined {
  const controls = Array.from(
    root.querySelectorAll("button, a, summary, [role='button']"),
  );

  return (
    controls.find((element) => element.getAttribute("aria-expanded") === "false") ??
    controls.find((element) =>
      includesAny(resolveElementText(element, documentRef), PREORDER_DISABLED_HINTS),
    ) ??
    controls.find((element) =>
      includesAny(resolveElementText(element, documentRef), ["펼치기", "열기", "확장"]),
    ) ??
    controls.at(-1)
  );
}

function hasExpandedOptionControls(root: Element): boolean {
  const text = normalizeWhitespace(root.textContent);
  return (
    includesAny(text, OPTION_ENABLED_HINTS) ||
    includesAny(text, OPTION_TYPE_SINGLE_HINTS) ||
    includesAny(text, OPTION_NAME_HINTS) ||
    includesAny(text, OPTION_VALUE_HINTS) ||
    root.querySelector("input, textarea, select") !== null
  );
}

function findOptionSectionToggle(
  root: Element,
  documentRef: Document,
): Element | undefined {
  const controls = Array.from(
    root.querySelectorAll("button, a, summary, [role='button']"),
  ).filter((element) => !isDisabled(element));

  return (
    controls.find((element) => element.getAttribute("aria-expanded") === "false") ??
    controls.find((element) =>
      includesAny(resolveElementText(element, documentRef), OPTION_DISABLED_HINTS),
    ) ??
    controls.find((element) =>
      includesAny(resolveElementText(element, documentRef), ["펼치기", "열기", "확장"]),
    ) ??
    controls.at(-1)
  );
}

function findSelectableOptionEnabledControl(
  root: Element,
  documentRef: Document,
): Element | undefined {
  return findSettingEnabledControlNearHints(
    root,
    SELECTABLE_OPTION_HINTS,
    documentRef,
  );
}

function findPreorderEnabledControl(
  root: Element,
  documentRef: Document,
): Element | undefined {
  return findPreorderSettingControl(root, documentRef, PREORDER_ENABLED_HINTS);
}

function findPreorderDisabledControl(
  root: Element,
  documentRef: Document,
): Element | undefined {
  return findPreorderSettingControl(root, documentRef, PREORDER_DISABLED_HINTS);
}

function findPreorderSettingControl(
  root: Element,
  documentRef: Document,
  controlHints: readonly string[],
): Element | undefined {
  const row = findPreorderSettingRow(root);
  if (!row) {
    return undefined;
  }

  const controls = Array.from(
    row.querySelectorAll(
      "input, button, a, label, [role='radio'], [role='button'], [role='switch'], [role='checkbox']",
    ),
  ).filter((element) => isVisible(element) && !isDisabled(element));

  const exact = controls.find((control) =>
    includesAny(resolveElementText(control, documentRef), controlHints),
  );
  if (exact) {
    return exact;
  }

  return controlHints === PREORDER_ENABLED_HINTS ? controls[0] : controls.at(-1);
}

function findPreorderSettingRow(root: Element): Element | undefined {
  const candidates = [
    root,
    ...Array.from(
      root.querySelectorAll("tr, li, dl, fieldset, section, article, div, label"),
    ),
  ]
    .filter((element) => {
      const text = getVisibleElementText(element);
      return (
        isVisible(element) &&
        includesAny(text, PREORDER_HINTS) &&
        includesAny(text, PREORDER_ENABLED_HINTS) &&
        includesAny(text, PREORDER_DISABLED_HINTS) &&
        !includesAny(text, NON_PREORDER_SETTING_HINTS) &&
        !includesAny(text, ORDER_PERIOD_HINTS)
      );
    })
    .sort((left, right) => {
      const leftText = normalizeWhitespace(left.textContent);
      const rightText = normalizeWhitespace(right.textContent);
      return leftText.length - rightText.length;
    });

  return candidates[0];
}

function findSingleOptionTypeControl(
  root: Element,
  documentRef: Document,
): Element | undefined {
  return findControlNearHints(root, OPTION_TYPE_SINGLE_HINTS, documentRef);
}

function findSingleOptionTypeRadioControl(
  root: Element,
  documentRef: Document,
): Element | undefined {
  const hintedControl = findSingleOptionTypeControl(root, documentRef);
  const nestedRadio = findRadioControl(hintedControl);
  if (nestedRadio) {
    return nestedRadio;
  }

  const anchor =
    findSmallestElementByHints(root, OPTION_TYPE_SINGLE_HINTS) ??
    findOptionByHints(root, OPTION_TYPE_SINGLE_HINTS, documentRef);
  if (!anchor || !root.contains(anchor)) {
    return hintedControl;
  }

  for (let current: Element | null = anchor; current && root.contains(current); current = current.parentElement) {
    const radio = findRadioControl(current);
    if (radio) {
      return radio;
    }

    if (current === root) {
      break;
    }
  }

  return hintedControl;
}

function findRadioControl(root?: Element): Element | undefined {
  if (!root) {
    return undefined;
  }

  const candidates = [
    root,
    ...Array.from(root.querySelectorAll("input[type='radio'], [role='radio']")),
  ].filter((element) => isRadioLikeControl(element) && !isDisabled(element));

  return (
    candidates.find((element) => getElementVisibleArea(element) > 0) ??
    candidates.at(0)
  );
}

function isRadioLikeControl(element: Element): boolean {
  return (
    (element instanceof HTMLInputElement && element.type === "radio") ||
    normalizeWhitespace(element.getAttribute("role")) === "radio"
  );
}

function findOptionListApplyControl(
  root: Element,
  documentRef: Document,
): Element | undefined {
  return Array.from(
    root.querySelectorAll("button, a, [role='button'], input[type='button'], input[type='submit']"),
  )
    .filter((element) => !isDisabled(element))
    .find((element) => includesAny(resolveElementText(element, documentRef), OPTION_APPLY_HINTS));
}

function findSettingEnabledControlNearHints(
  root: Element,
  rowHints: readonly string[],
  documentRef: Document,
): Element | undefined {
  return findControlNearHints(root, rowHints, documentRef, OPTION_ENABLED_HINTS);
}

function findControlNearHints(
  root: Element,
  rowHints: readonly string[],
  documentRef: Document,
  controlHints: readonly string[] = rowHints,
): Element | undefined {
  const anchor =
    findSmallestElementByHints(root, rowHints) ??
    findOptionByHints(root, rowHints, documentRef);
  if (!anchor || !root.contains(anchor)) {
    return undefined;
  }

  for (let current: Element | null = anchor; current && root.contains(current); current = current.parentElement) {
    const text = resolveElementText(current, documentRef);
    if (includesAny(text, rowHints)) {
      const self = asOptionCandidate(current);
      if (self && !isDisabled(self)) {
        return self;
      }

      const nestedControl = findFirstClickableControl(current);
      if (nestedControl) {
        return nestedControl;
      }
    }

    const hintedControl = findOptionByHints(current, controlHints, documentRef);
    if (hintedControl && !isDisabled(hintedControl)) {
      return hintedControl;
    }

    if (current === root) {
      break;
    }
  }

  return undefined;
}

function findFirstClickableControl(root: Element): Element | undefined {
  return Array.from(
    root.querySelectorAll("input, button, a, label, [role='radio'], [role='button'], [role='switch'], [role='checkbox']"),
  ).find((element) => !isDisabled(element));
}

function findSmallestElementByHints(
  root: Element,
  hints: readonly string[],
): Element | undefined {
  return Array.from(
    root.querySelectorAll("tr, td, th, li, dl, fieldset, section, article, div, label"),
  )
    .filter((element) => includesAny(element.textContent, hints))
    .sort((left, right) => {
      const leftText = normalizeWhitespace(left.textContent);
      const rightText = normalizeWhitespace(right.textContent);
      return leftText.length - rightText.length;
    })
    .at(0);
}

function findOptionByHints(
  section: Element,
  hints: readonly string[],
  documentRef: Document,
): Element | undefined {
  const candidates = Array.from(
    section.querySelectorAll(
      "label, button, [role='radio'], [role='option'], input, option, span, a",
    ),
  );

  for (const candidate of candidates) {
    if (includesAny(resolveElementText(candidate, documentRef), hints)) {
      return candidate;
    }
  }

  return undefined;
}

function asOptionCandidate(element?: Element): Element | undefined {
  if (!element) {
    return undefined;
  }

  if (
    element instanceof HTMLInputElement ||
    element instanceof HTMLButtonElement ||
    element instanceof HTMLAnchorElement ||
    element instanceof HTMLOptionElement ||
    element instanceof HTMLLabelElement
  ) {
    return element;
  }

  const role = normalizeWhitespace(element.getAttribute("role"));
  if (["radio", "option", "button", "switch", "checkbox"].includes(role)) {
    return element;
  }

  return undefined;
}

function findOrderPeriodCalendarButton(
  documentRef: Document,
  inputIndex: number,
): Element | undefined {
  const root = findOrderPeriodFieldRoot(documentRef);
  return root ? findCalendarButton(root, documentRef, inputIndex) : undefined;
}

function findOrderPeriodDateTimeInput(
  documentRef: Document,
  inputIndex: number,
): HTMLInputElement | undefined {
  const root = findOrderPeriodFieldRoot(documentRef);
  if (!root) {
    return undefined;
  }

  const inputs = Array.from(root.querySelectorAll("input")).filter(
    (input): input is HTMLInputElement =>
      input instanceof HTMLInputElement &&
      ["date", "datetime-local", "text", "search", ""].includes(input.type),
  );

  return inputs[inputIndex] ?? inputs[0];
}

function findOrderPeriodFieldRoot(documentRef: Document): Element | undefined {
  const candidates = Array.from(
    documentRef.querySelectorAll("tr, li, dl, fieldset, section, article, div, label"),
  ).filter((element) => {
    const text = getVisibleElementText(element);
    return isVisible(element) && includesAny(text, ORDER_PERIOD_HINTS) && hasDatePickerCandidate(element);
  });

  return candidates.sort(compareOrderPeriodFieldCandidate).at(0);
}

function compareOrderPeriodFieldCandidate(left: Element, right: Element): number {
  return scoreOrderPeriodFieldCandidate(left) - scoreOrderPeriodFieldCandidate(right);
}

function scoreOrderPeriodFieldCandidate(element: Element): number {
  const text = normalizeWhitespace(element.textContent);
  let score = text.length;

  if (includesAny(text, ORDER_PERIOD_HINTS)) {
    score -= 1_000;
  }

  if (includesAny(text, ["발송시작일", "발송 시작일", "발송완료일", "발송 완료일"])) {
    score += 1_000;
  }

  return score;
}

function hasDatePickerCandidate(element: Element): boolean {
  return (
    Array.from(element.querySelectorAll("input")).some(isVisible) &&
    Array.from(element.querySelectorAll("button, a, [role='button']")).some(
      (control) => isVisible(control) && !isDisabled(control),
    )
  );
}

function findCalendarButton(
  root: Element,
  documentRef: Document,
  inputIndex: number,
): Element | undefined {
  const buttons = Array.from(root.querySelectorAll("button, a, [role='button']"))
    .filter((element) => isVisible(element) && !isDisabled(element));
  const explicit = buttons.filter((element) => isCalendarLikeButton(element, documentRef));
  if (explicit[inputIndex]) {
    return explicit[inputIndex];
  }

  const ordered = Array.from(
    root.querySelectorAll("input, button, a, [role='button']"),
  ).filter((element) => isVisible(element) && !isDisabled(element));
  const inputs = ordered.filter(
    (element): element is HTMLInputElement => element instanceof HTMLInputElement,
  );
  const targetInput = inputs[inputIndex] ?? inputs[0];
  if (!targetInput) {
    return buttons[inputIndex] ?? buttons[0];
  }

  const inputPosition = ordered.indexOf(targetInput);
  const followingButton = ordered
    .slice(Math.max(0, inputPosition + 1))
    .find((element) => element !== targetInput && !isDisabled(element));
  if (followingButton) {
    return followingButton;
  }

  return targetInput;
}

function findDatePickerForMonth(
  documentRef: Document,
  today: LocalDateParts,
): Element | undefined {
  const headers = buildMonthHeaderCandidates(today);
  const candidates = Array.from(
    documentRef.querySelectorAll("div, section, article, table, tbody, ul"),
  ).filter((element) => {
    const text = normalizeWhitespace(element.textContent);
    return (
      isVisible(element) &&
      headers.some((header) => text.includes(normalizeWhitespace(header))) &&
      containsDatePickerWeekdays(text) &&
      findDatePickerDayButton(element, today, documentRef) !== undefined
    );
  });

  return candidates.sort((left, right) => {
    const leftText = normalizeWhitespace(left.textContent);
    const rightText = normalizeWhitespace(right.textContent);
    return leftText.length - rightText.length;
  }).at(0);
}

function findAnyOpenDatePicker(documentRef: Document): Element | undefined {
  const candidates = Array.from(
    documentRef.querySelectorAll("div, section, article, table, tbody, ul"),
  ).filter(
    (element) =>
      isVisible(element) &&
      containsDatePickerWeekdays(normalizeWhitespace(element.textContent)) &&
      element.querySelector("button, a, [role='button']") !== null,
  );

  return candidates.sort((left, right) => {
    const leftText = normalizeWhitespace(left.textContent);
    const rightText = normalizeWhitespace(right.textContent);
    return leftText.length - rightText.length;
  }).at(0);
}

function findYearNextButton(root: Element, documentRef: Document): Element | undefined {
  const candidates = Array.from(
    root.querySelectorAll("button, a, [role='button'], span, div"),
  ).filter((element) => isVisible(element) && !isDisabled(element));

  const matched = candidates.find((element) => {
    const htmlElement = element as HTMLElement;
    const datasetText = Object.entries(htmlElement.dataset ?? {})
      .map(([key, value]) => `${key} ${value ?? ""}`)
      .join(" ");
    const haystack = normalizeWhitespace(
      [
        element.textContent,
        element.getAttribute("aria-label"),
        element.getAttribute("title"),
        element.getAttribute("class"),
        element.getAttribute("id"),
        datasetText,
      ].join(" "),
    );

    return (
      ["»", "≫", ">>", "››"].includes(normalizeWhitespace(element.textContent)) ||
      haystack.includes("next year") ||
      haystack.includes("year next") ||
      haystack.includes("next-year") ||
      haystack.includes("다음 연도") ||
      haystack.includes("다음년도") ||
      haystack.includes("다음 해") ||
      haystack.includes("내년")
    );
  });

  if (matched) {
    return findClickableDateElement(matched) ?? matched;
  }

  const navigationControls = findDatePickerNavigationControls(root);
  const rightmostControl = navigationControls.at(-1);
  return rightmostControl ? findClickableDateElement(rightmostControl) ?? rightmostControl : undefined;
}

function findMonthNextButton(root: Element, documentRef: Document): Element | undefined {
  const controls = Array.from(
    root.querySelectorAll("button, a, [role='button']"),
  ).filter((element) => isVisible(element) && !isDisabled(element));

  const matched = controls.find((element) => {
    const haystack = buildDatePickerControlHaystack(element);
    const text = normalizeWhitespace(element.textContent);

    return (
      [">", "›", "→"].includes(text) ||
      (haystack.includes("next month") && !haystack.includes("next year")) ||
      (haystack.includes("month next") && !haystack.includes("year next")) ||
      (haystack.includes("next-month") && !haystack.includes("next-year")) ||
      haystack.includes("다음 달") ||
      haystack.includes("다음달") ||
      haystack.includes("다음 월")
    );
  });

  if (matched) {
    return findClickableDateElement(matched) ?? matched;
  }

  const navigationControls = findDatePickerNavigationControls(root);
  const monthNextControl =
    navigationControls.length >= 4 ? navigationControls.at(-2) : navigationControls.at(-1);
  return monthNextControl
    ? findClickableDateElement(monthNextControl) ?? monthNextControl
    : undefined;
}

function findDatePickerNavigationControls(root: Element): Element[] {
  const controls = uniqueElements(
    Array.from(root.querySelectorAll("button, a, [role='button']"))
      .map((element) => findClickableDateElement(element) ?? element)
      .filter((element) => isVisible(element) && !isDisabled(element)),
  );
  const firstDayIndex = controls.findIndex(isDatePickerDayControl);
  const headerControls = firstDayIndex > 0 ? controls.slice(0, firstDayIndex) : controls;

  return sortDatePickerNavigationControls(
    headerControls.filter(
      (element) =>
        !isDatePickerDayControl(element) &&
        !isDatePickerFooterControl(element) &&
        !isDatePickerMonthHeaderControl(element) &&
        !containsDatePickerWeekdays(normalizeWhitespace(element.textContent)),
    ),
  );
}

function uniqueElements(elements: Element[]): Element[] {
  return [...new Set(elements)];
}

function clickDatePickerYearNextByCoordinate(
  root: Element,
  documentRef: Document,
): boolean {
  return clickDatePickerHeaderControlByCoordinate(root, documentRef, "year-next");
}

function clickDatePickerMonthNextByCoordinate(
  root: Element,
  documentRef: Document,
): boolean {
  return clickDatePickerHeaderControlByCoordinate(root, documentRef, "month-next");
}

function clickDatePickerHeaderControlByCoordinate(
  root: Element,
  documentRef: Document,
  target: "month-next" | "year-next",
): boolean {
  const rect = getElementRectIfVisible(root);
  if (!rect) {
    return false;
  }

  const xOffset = target === "year-next" ? 24 : 56;
  return triggerUserClickAtPoint(root, documentRef, {
    x: rect.right - xOffset,
    y: rect.top + 25,
  });
}

function clickDatePickerDayByGridCoordinate(
  root: Element,
  targetDate: LocalDateParts,
  documentRef: Document,
): boolean {
  const rect = getElementRectIfVisible(root);
  if (!rect) {
    return false;
  }

  const firstDayOfWeek = new Date(targetDate.year, targetDate.month - 1, 1).getDay();
  const dayIndex = firstDayOfWeek + targetDate.day - 1;
  const column = dayIndex % 7;
  const row = Math.floor(dayIndex / 7);
  const cellWidth = rect.width / 7;
  const cellHeight = Math.max(28, Math.min(36, (rect.height - 140) / 6));
  const x = rect.left + cellWidth * (column + 0.5);
  const y = rect.top + 88 + cellHeight * (row + 0.5);

  if (y >= rect.bottom - 44) {
    return false;
  }

  return triggerUserClickAtPoint(root, documentRef, { x, y });
}

function triggerUserClickAtPoint(
  root: Element,
  documentRef: Document,
  point: { x: number; y: number },
): boolean {
  const target = documentRef.elementFromPoint(point.x, point.y);
  if (!target || !root.contains(target)) {
    return false;
  }

  const clickable = findClickableDateElement(target) ?? target;
  if (!root.contains(clickable) || isDisabled(clickable) || !isVisible(clickable)) {
    return false;
  }

  triggerUserClick(clickable);
  return true;
}

function isDatePickerDayControl(element: Element): boolean {
  const text = normalizeWhitespace(element.textContent);
  return /^\d{1,2}$/.test(text) && !isOutOfMonthDateCell(element);
}

function isDatePickerFooterControl(element: Element): boolean {
  const haystack = buildDatePickerControlHaystack(element);
  return (
    haystack.includes("이번달") ||
    haystack.includes("이번 달") ||
    haystack.includes("이달") ||
    haystack.includes("오늘") ||
    haystack.includes("this month") ||
    haystack.includes("current month") ||
    haystack.includes("today") ||
    haystack.includes("close") ||
    haystack.includes("cancel") ||
    haystack.includes("confirm") ||
    haystack.includes("닫기") ||
    haystack.includes("취소") ||
    haystack.includes("확인")
  );
}

function isDatePickerMonthHeaderControl(element: Element): boolean {
  const text = normalizeWhitespace(element.textContent);
  return (
    /\d{4}\s*[.\-/]\s*\d{1,2}/.test(text) ||
    /\d{4}\s*년\s*\d{1,2}\s*월/.test(text)
  );
}

function sortDatePickerNavigationControls(controls: Element[]): Element[] {
  return controls
    .map((element, index) => ({ element, index }))
    .sort((left, right) => {
      const leftRect = getElementRectIfVisible(left.element);
      const rightRect = getElementRectIfVisible(right.element);
      if (leftRect && rightRect) {
        const topDelta = leftRect.top - rightRect.top;
        if (Math.abs(topDelta) > 8) {
          return topDelta;
        }

        return leftRect.left - rightRect.left;
      }

      return left.index - right.index;
    })
    .map(({ element }) => element);
}

function buildDatePickerControlHaystack(element: Element): string {
  const htmlElement = element as HTMLElement;
  const datasetText = Object.entries(htmlElement.dataset ?? {})
    .map(([key, value]) => `${key} ${value ?? ""}`)
    .join(" ");
  const descendantText = Array.from(element.querySelectorAll("*"))
    .slice(0, 8)
    .map((child) => {
      const childHtmlElement = child as HTMLElement;
      const childDatasetText = Object.entries(childHtmlElement.dataset ?? {})
        .map(([key, value]) => `${key} ${value ?? ""}`)
        .join(" ");

      return [
        child.getAttribute("aria-label"),
        child.getAttribute("title"),
        child.getAttribute("class"),
        child.getAttribute("id"),
        childDatasetText,
      ].join(" ");
    })
    .join(" ");

  return normalizeWhitespace(
    [
      element.textContent,
      element.getAttribute("aria-label"),
      element.getAttribute("title"),
      element.getAttribute("class"),
      element.getAttribute("id"),
      datasetText,
      descendantText,
    ].join(" "),
  );
}

function findTimePickerForDate(
  documentRef: Document,
  today: LocalDateParts,
): Element | undefined {
  const headers = buildDateHeaderCandidates(today);
  const candidates = Array.from(
    documentRef.querySelectorAll("div, section, article, table, tbody, ul"),
  ).filter((element) => {
    const text = normalizeWhitespace(element.textContent);
    return (
      isVisible(element) &&
      headers.some((header) => text.includes(normalizeWhitespace(header))) &&
      findAvailableTimeOption(element, documentRef, "earliest") !== undefined
    );
  });

  return candidates.sort((left, right) => {
    const leftText = normalizeWhitespace(left.textContent);
    const rightText = normalizeWhitespace(right.textContent);
    return leftText.length - rightText.length;
  }).at(0);
}

function buildMonthHeaderCandidates(today: LocalDateParts): string[] {
  const paddedMonth = String(today.month).padStart(2, "0");
  return [
    `${today.year}.${paddedMonth}`,
    `${today.year}. ${paddedMonth}`,
    `${today.year}-${paddedMonth}`,
    `${today.year}년 ${today.month}월`,
    `${today.year}년${today.month}월`,
  ];
}

function buildDateHeaderCandidates(today: LocalDateParts): string[] {
  const paddedMonth = String(today.month).padStart(2, "0");
  const paddedDay = String(today.day).padStart(2, "0");
  return [
    `${today.year}.${paddedMonth}.${paddedDay}.`,
    `${today.year}.${paddedMonth}.${paddedDay}`,
    `${today.year}. ${paddedMonth}. ${paddedDay}`,
    `${today.year}-${paddedMonth}-${paddedDay}`,
    `${today.year}년 ${today.month}월 ${today.day}일`,
    `${today.year}년${today.month}월${today.day}일`,
  ];
}

function containsDatePickerWeekdays(text: string): boolean {
  return ["일", "월", "화", "수", "목", "금", "토"].filter((day) =>
    text.includes(day),
  ).length >= 4;
}

function findDatePickerDayButton(
  root: Element,
  today: LocalDateParts,
  documentRef: Document,
): Element | undefined {
  const dayText = String(today.day);
  const candidates = Array.from(
    root.querySelectorAll("button, a, [role='button'], td, span, div"),
  ).filter((element) => isVisible(element) && !isUnavailableDateCandidate(element));

  const isoMatch = candidates.find((element) => {
    const haystack = [
      resolveElementText(element, documentRef),
      element.getAttribute("data-date"),
      element.getAttribute("title"),
      element.getAttribute("aria-label"),
      element.getAttribute("value"),
    ].join(" ");
    return normalizeWhitespace(haystack).includes(today.isoDate);
  });
  if (isoMatch) {
    return resolveDatePickerDayClickTarget(isoMatch);
  }

  const exactText = candidates
    .filter((element) => {
      const text = normalizeWhitespace(element.textContent);
      return text === dayText;
    })
    .sort(compareDateTextClickTarget)
    .map(resolveDatePickerDayClickTarget)
    .filter((element): element is Element => Boolean(element))
    .at(0);
  if (exactText) {
    return exactText;
  }

  return undefined;
}

function resolveDatePickerDayClickTarget(element: Element): Element | undefined {
  const clickTarget = findClickableDateElement(element) ?? element;
  if (isUnavailableDateCandidate(clickTarget)) {
    return undefined;
  }

  return getElementVisibleArea(element) > 0 ? element : clickTarget;
}

function isUnavailableDateCandidate(element: Element): boolean {
  const closestDateContainer = element.closest("button, a, [role='button'], td, li");
  const candidates = [element, closestDateContainer].filter(
    (candidate): candidate is Element => Boolean(candidate),
  );

  return candidates.some(
    (candidate) => isDisabled(candidate) || isOutOfMonthDateCell(candidate),
  );
}

function findLatestAvailableDateButton(root: Element): Element | undefined {
  const candidates = Array.from(
    root.querySelectorAll("button, a, [role='button'], td, span, div"),
  ).flatMap((element): { element: Element; day: number }[] => {
    const text = normalizeWhitespace(element.textContent);
    if (!/^\d{1,2}$/.test(text)) {
      return [];
    }

    if (!isVisible(element) || isDisabled(element) || isOutOfMonthDateCell(element)) {
      return [];
    }

    const clickable = findClickableDateElement(element) ?? element;
    if (!isVisible(clickable) || isDisabled(clickable) || isOutOfMonthDateCell(clickable)) {
      return [];
    }

    return [{ element: clickable, day: Number(text) }];
  });

  return candidates.sort((left, right) => right.day - left.day).at(0)?.element;
}

function findAvailableTimeOption(
  root: Element,
  documentRef: Document,
  preference: TimeSelectionPreference,
): TimeOptionCandidate | undefined {
  const candidates = Array.from(
    root.querySelectorAll("button, a, [role='button'], td, span, div"),
  ).flatMap((element): TimeOptionCandidate[] => {
    if (!isVisible(element)) {
      return [];
    }

    const label = extractTimeOptionLabel(element, documentRef);
    if (!label) {
      return [];
    }

    const textElement = findExactTimeTextElement(element, label) ?? element;
    const clickable = findClickableDateElement(textElement) ?? textElement;
    if (
      isExplicitlyUnavailableTimeOption(element) ||
      isExplicitlyUnavailableTimeOption(textElement) ||
      isExplicitlyUnavailableTimeOption(clickable) ||
      isVisuallyUnavailableTimeOption(textElement) ||
      !isVisible(textElement) ||
      !isVisible(clickable) ||
      isTimeOptionInsideUnavailableParent(textElement) ||
      isInsideExplicitUnavailableTimeParent(textElement, root)
    ) {
      return [];
    }

    return [
      {
        element: clickable,
        textElement,
        label,
        minutes: timeLabelToMinutes(label),
      },
    ];
  });

  return candidates
    .sort((left, right) => {
      const timeOrder =
        preference === "earliest"
          ? left.minutes - right.minutes
          : right.minutes - left.minutes;
      return timeOrder === 0
        ? compareDateTextClickTarget(left.element, right.element)
        : timeOrder;
    })
    .at(0);
}

function clickTimeOptionByCoordinate(
  root: Element,
  option: TimeOptionCandidate,
  documentRef: Document,
): boolean {
  const targets = uniqueElements([option.element, option.textElement]);
  for (const target of targets) {
    const rect = getElementRectIfVisible(target);
    if (!rect) {
      continue;
    }

    if (
      triggerUserClickAtPoint(root, documentRef, {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      })
    ) {
      return true;
    }
  }

  return false;
}

function clickTimeOptionByGridCoordinate(
  root: Element,
  option: TimeOptionCandidate,
  documentRef: Document,
): boolean {
  const point = getTimeOptionGridPoint(root, option);
  if (!point) {
    return false;
  }

  return triggerUserClickAtPoint(root, documentRef, point);
}

function getTimeOptionGridPoint(
  root: Element,
  option: TimeOptionCandidate,
): { x: number; y: number } | undefined {
  const rect = getElementRectIfVisible(root);
  if (!rect) {
    return undefined;
  }

  const hour = Math.floor(option.minutes / 60);
  const column = hour % 4;
  const row = Math.floor(hour / 4);
  const headerHeight = Math.max(46, Math.min(64, rect.height * 0.22));
  const cellWidth = rect.width / 4;
  const cellHeight = Math.max(24, (rect.height - headerHeight) / 6);
  const x = rect.left + cellWidth * (column + 0.5);
  const y = rect.top + headerHeight + cellHeight * (row + 0.5);

  if (y >= rect.bottom) {
    return undefined;
  }

  return { x, y };
}

function findExactTimeTextElement(root: Element, label: string): Element | undefined {
  const normalizedLabel = normalizeWhitespace(label);
  const child = Array.from(root.querySelectorAll("span, div, button, a, [role='button'], td"))
    .filter((element) => normalizeWhitespace(element.textContent) === normalizedLabel)
    .sort(compareDateTextClickTarget)
    .at(0);
  if (child) {
    return child;
  }

  return normalizeWhitespace(root.textContent) === normalizedLabel ? root : undefined;
}

function extractTimeOptionLabel(
  element: Element,
  _documentRef: Document,
): string | undefined {
  const directText = normalizeWhitespace(element.textContent);
  const directMatch = directText.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  if (directMatch) {
    return `${Number(directMatch[1])}:${directMatch[2]}`;
  }

  const attributeText = [
    element.getAttribute("aria-label"),
    element.getAttribute("title"),
    element.getAttribute("data-time"),
    element.getAttribute("value"),
  ].join(" ");
  const match = normalizeWhitespace(attributeText).match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  if (!match) {
    return undefined;
  }

  return `${Number(match[1])}:${match[2]}`;
}

function timeLabelToMinutes(label: string): number {
  const [hour = "0", minute = "0"] = label.split(":");
  return Number(hour) * 60 + Number(minute);
}

function isTimeOptionInsideUnavailableParent(element: Element): boolean {
  const parentOption = element.closest("button, a, [role='button']");
  return Boolean(
    parentOption &&
      parentOption !== element &&
      isExplicitlyUnavailableTimeOption(parentOption),
  );
}

function isInsideExplicitUnavailableTimeParent(element: Element, root: Element): boolean {
  let current = element.parentElement;
  while (current && current !== root) {
    if (isExplicitlyUnavailableTimeOption(current)) {
      return true;
    }

    current = current.parentElement;
  }

  return false;
}

function isExplicitlyUnavailableTimeOption(element: Element): boolean {
  const className =
    typeof (element as HTMLElement).className === "string"
      ? (element as HTMLElement).className
      : "";

  if (
    isDisabled(element) ||
    element.getAttribute("aria-disabled") === "true" ||
    element.hasAttribute("disabled") ||
    /\b(disabled|readonly|is-disabled|unavailable|inactive)\b/i.test(className)
  ) {
    return true;
  }

  if (!(element instanceof HTMLElement)) {
    return false;
  }

  const style = element.ownerDocument.defaultView?.getComputedStyle(element);
  if (!style) {
    return false;
  }

  const opacity = Number.parseFloat(style.opacity);
  return (
    style.display === "none" ||
    style.visibility === "hidden" ||
    style.pointerEvents === "none" ||
    (!Number.isNaN(opacity) && opacity < 0.1)
  );
}

function isVisuallyUnavailableTimeOption(element: Element): boolean {
  const className =
    typeof (element as HTMLElement).className === "string"
      ? (element as HTMLElement).className
      : "";

  if (/\b(muted|dimmed)\b/i.test(className)) {
    return true;
  }

  if (!(element instanceof HTMLElement)) {
    return false;
  }

  const style = element.ownerDocument.defaultView?.getComputedStyle(element);
  if (!style) {
    return false;
  }

  const opacity = Number.parseFloat(style.opacity);
  return (
    (!Number.isNaN(opacity) && opacity < 0.5) ||
    isMutedTimeTextColor(style.color)
  );
}

function isMutedTimeTextColor(color: string): boolean {
  const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/i);
  if (!match) {
    return false;
  }

  const red = Number(match[1]);
  const green = Number(match[2]);
  const blue = Number(match[3]);
  const alpha = match[4] === undefined ? 1 : Number(match[4]);
  if (!Number.isNaN(alpha) && alpha < 0.7) {
    return true;
  }

  if ([red, green, blue].some((value) => Number.isNaN(value))) {
    return false;
  }

  const maxChannel = Math.max(red, green, blue);
  const minChannel = Math.min(red, green, blue);
  return minChannel >= 170 && maxChannel - minChannel <= 40;
}

function findClickableDateElement(element: Element): Element | undefined {
  return (
    element.closest("button, a, [role='button'], td, li, [tabindex]") ??
    (element instanceof HTMLElement ? element : undefined)
  );
}

function compareDateTextClickTarget(left: Element, right: Element): number {
  const leftArea = getElementVisibleArea(left);
  const rightArea = getElementVisibleArea(right);
  if (leftArea > 0 && rightArea > 0 && leftArea !== rightArea) {
    return leftArea - rightArea;
  }

  if (leftArea > 0 && rightArea === 0) {
    return -1;
  }

  if (leftArea === 0 && rightArea > 0) {
    return 1;
  }

  const leftDepth = getElementDepth(left);
  const rightDepth = getElementDepth(right);
  return rightDepth - leftDepth;
}

function getElementVisibleArea(element: Element): number {
  if (!(element instanceof HTMLElement)) {
    return 0;
  }

  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0 ? rect.width * rect.height : 0;
}

function getElementRectIfVisible(element: Element): DOMRect | undefined {
  if (!(element instanceof HTMLElement)) {
    return undefined;
  }

  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0 ? rect : undefined;
}

function getElementDepth(element: Element): number {
  let depth = 0;
  let current: Element | null = element;
  while (current) {
    depth += 1;
    current = current.parentElement;
  }

  return depth;
}

function isOutOfMonthDateCell(element: Element): boolean {
  const className =
    typeof (element as HTMLElement).className === "string"
      ? (element as HTMLElement).className
      : "";
  const ariaDisabled = element.getAttribute("aria-disabled");
  return (
    ariaDisabled === "true" ||
    /\b(prev|next|other|outside|disabled|muted)\b/i.test(className)
  );
}

function isCalendarLikeButton(element: Element, documentRef: Document): boolean {
  const htmlElement = element as HTMLElement;
  const datasetText = Object.entries(htmlElement.dataset ?? {})
    .map(([key, value]) => `${key} ${value ?? ""}`)
    .join(" ");
  const haystack = [
    resolveElementText(element, documentRef),
    element.getAttribute("class"),
    element.getAttribute("id"),
    element.getAttribute("name"),
    datasetText,
  ].join(" ");

  return includesAny(haystack, CALENDAR_BUTTON_HINTS);
}

function selectControlByHints(
  element: Element,
  hints: readonly string[],
  documentRef: Document,
): { ok: boolean; note: string } {
  const select = element instanceof HTMLSelectElement ? element : element.querySelector("select");
  if (select instanceof HTMLSelectElement) {
    const option = findSelectOptionByHints(select, hints);
    if (!option) {
      return { ok: false, note: "matching select option was not found." };
    }

    select.value = option.value;
    dispatchInputEvents(select);
    return { ok: true, note: `selected ${option.textContent ?? option.value}` };
  }

  const directMatch =
    findOptionByHints(element, hints, documentRef) ??
    (includesAny(resolveElementText(element, documentRef), hints) ? element : undefined);
  if (!directMatch) {
    return { ok: false, note: "matching option was not found." };
  }

  if (isOptionSelected(directMatch)) {
    return { ok: true, note: "option already selected." };
  }

  scrollElementIntoView(directMatch);
  return clickOption(directMatch)
    ? { ok: true, note: "option clicked." }
    : { ok: false, note: "matching option was not clickable." };
}

function findSelectOptionByHints(
  select: HTMLSelectElement,
  hints: readonly string[],
): HTMLOptionElement | undefined {
  const options = Array.from(select.options);
  const normalizedHints = hints.map(normalizeWhitespace);
  const exact = options.find((option) => {
    const text = normalizeWhitespace(option.textContent);
    const value = normalizeWhitespace(option.value);
    return normalizedHints.some((hint) => text === hint || value === hint);
  });

  if (exact) {
    return exact;
  }

  return options.find((option) => {
    const text = normalizeWhitespace(`${option.textContent ?? ""} ${option.value}`);
    if (text.includes("판매중지") || text.includes("판매 중지")) {
      return false;
    }

    return normalizedHints.some((hint) => text.includes(hint));
  });
}

function clickOption(element: Element): boolean {
  if (element instanceof HTMLInputElement) {
    if (isDisabled(element)) {
      return false;
    }

    element.click();
    dispatchInputEvents(element);
    return true;
  }

  if (element instanceof HTMLOptionElement) {
    const select = element.parentElement;
    if (select instanceof HTMLSelectElement) {
      select.value = element.value;
      dispatchInputEvents(select);
      return true;
    }
  }

  if (element instanceof HTMLElement && !isDisabled(element)) {
    const input = element.querySelector("input");
    if (input instanceof HTMLInputElement && !isDisabled(input)) {
      input.click();
      dispatchInputEvents(input);
      return true;
    }

    triggerUserClick(element);
    return true;
  }

  return false;
}

function writeDateLikeValue(element: Element, value: string): boolean {
  const input = findLastWritableInput(element, (candidate) =>
    ["date", "datetime-local", "text", "search", ""].includes(candidate.type),
  );
  if (input) {
    return writeTextInput(input, formatValueForInput(input, value));
  }

  const select = element instanceof HTMLSelectElement ? element : element.querySelector("select");
  if (select instanceof HTMLSelectElement) {
    const exact = Array.from(select.options).find((option) =>
      `${option.value} ${option.textContent ?? ""}`.includes(value),
    );
    const target = exact ?? Array.from(select.options).at(-1);
    if (!target) {
      return false;
    }

    select.value = target.value;
    dispatchInputEvents(select);
    return true;
  }

  return false;
}

function formatValueForInput(input: HTMLInputElement, value: string): string {
  if (input.type === "datetime-local") {
    return value.includes("T") ? value : `${value}T23:59`;
  }

  if (input.type === "date") {
    return value.slice(0, 10);
  }

  return value.replace("T", " ");
}

function findWritableTextInput(element?: Element | null): HTMLInputElement | HTMLTextAreaElement | undefined {
  if (!element) {
    return undefined;
  }

  if (isWritableTextControl(element)) {
    return element;
  }

  return Array.from(element.querySelectorAll("input, textarea")).find(isWritableTextControl);
}

function findLastWritableInput(
  element: Element,
  predicate: (input: HTMLInputElement) => boolean,
): HTMLInputElement | undefined {
  const inputs = Array.from(
    element instanceof HTMLInputElement ? [element] : element.querySelectorAll("input"),
  ).filter((input): input is HTMLInputElement => input instanceof HTMLInputElement);

  return inputs.filter((input) => !isDisabled(input) && predicate(input)).at(-1);
}

function findInputByLabelHints(
  root: Element,
  hints: readonly string[],
  documentRef: Document,
): HTMLInputElement | HTMLTextAreaElement | undefined {
  const labels = Array.from(root.querySelectorAll("label")).filter((label) =>
    includesAny(label.textContent, hints),
  );

  for (const label of labels) {
    const forId = label.getAttribute("for");
    const byFor = forId ? documentRef.getElementById(forId) : null;
    const input = findWritableTextInput(byFor ?? label);
    if (input) {
      return input;
    }
  }

  const controls = Array.from(root.querySelectorAll("input, textarea")).filter(isWritableTextControl);
  return controls.find((control) =>
    includesAny(
      [
        control.getAttribute("aria-label"),
        control.getAttribute("placeholder"),
        control.getAttribute("name"),
        control.id,
      ].join(" "),
      hints,
    ),
  );
}

function findNthTextInput(
  root: Element,
  index: number,
): HTMLInputElement | HTMLTextAreaElement | undefined {
  return Array.from(root.querySelectorAll("input, textarea"))
    .filter(isWritableTextControl)
    .at(index);
}

function writeTextInput(
  input: HTMLInputElement | HTMLTextAreaElement,
  value: string,
): boolean {
  if (isDisabled(input)) {
    return false;
  }

  input.value = value;
  dispatchInputEvents(input);
  return input.value === value;
}

function isWritableTextControl(
  element: Element,
): element is HTMLInputElement | HTMLTextAreaElement {
  if (element instanceof HTMLTextAreaElement) {
    return !isDisabled(element);
  }

  return (
    element instanceof HTMLInputElement &&
    !isDisabled(element) &&
    !["button", "checkbox", "file", "hidden", "image", "radio", "reset", "submit"].includes(
      element.type,
    )
  );
}

function isOptionSelected(element: Element): boolean {
  if (element instanceof HTMLInputElement) {
    return element.checked;
  }

  if (element instanceof HTMLOptionElement) {
    return element.selected;
  }

  const htmlElement = element as HTMLElement;
  const className = typeof htmlElement.className === "string" ? htmlElement.className : "";

  if (element.getAttribute("aria-checked") === "true") {
    return true;
  }

  if (element.getAttribute("aria-selected") === "true") {
    return true;
  }

  if (/\b(selected|checked|active|on)\b/i.test(className)) {
    return true;
  }

  return element.querySelector(
    "[aria-checked='true'], [aria-selected='true'], input:checked, option:checked",
  ) !== null;
}

function isDisabled(element: Element): boolean {
  if (
    element instanceof HTMLInputElement ||
    element instanceof HTMLButtonElement ||
    element instanceof HTMLSelectElement ||
    element instanceof HTMLTextAreaElement
  ) {
    return element.disabled;
  }

  return (
    element.getAttribute("aria-disabled") === "true" ||
    element.hasAttribute("disabled") ||
    /\b(disabled|readonly|is-disabled)\b/i.test(
      typeof (element as HTMLElement).className === "string"
        ? (element as HTMLElement).className
        : "",
    )
  );
}

function isVisible(element: Element): boolean {
  if (!(element instanceof HTMLElement)) {
    return true;
  }

  let current: HTMLElement | null = element;
  while (current) {
    if (current.hidden || current.getAttribute("aria-hidden") === "true") {
      return false;
    }

    const style = current.ownerDocument.defaultView?.getComputedStyle(current);
    if (
      style &&
      (style.display === "none" ||
        style.visibility === "hidden" ||
        style.pointerEvents === "none" ||
        Number.parseFloat(style.opacity || "1") === 0)
    ) {
      return false;
    }

    current = current.parentElement;
  }

  const rect = element.getBoundingClientRect();
  if (rect.width > 0 && rect.height > 0) {
    return true;
  }

  if (element.getClientRects().length > 0) {
    return true;
  }

  if (documentHasLayoutMetrics(element.ownerDocument)) {
    return false;
  }

  return true;
}

function documentHasLayoutMetrics(documentRef: Document): boolean {
  const bodyRect = documentRef.body?.getBoundingClientRect();
  const documentRect = documentRef.documentElement?.getBoundingClientRect();
  return Boolean(
    (bodyRect && (bodyRect.width > 0 || bodyRect.height > 0)) ||
      (documentRect && (documentRect.width > 0 || documentRect.height > 0)),
  );
}

function triggerClick(element: Element): void {
  if (element instanceof HTMLElement) {
    element.click();
  }
}

function triggerUserClick(element: Element): void {
  if (!(element instanceof HTMLElement)) {
    return;
  }

  element.focus();
  const windowRef = element.ownerDocument.defaultView;
  const center = getElementCenterPoint(element);
  const baseMouseInit: MouseEventInit = {
    bubbles: true,
    cancelable: true,
    composed: true,
    detail: 1,
    button: 0,
    buttons: 1,
    clientX: center?.x ?? 0,
    clientY: center?.y ?? 0,
    screenX: center?.x ?? 0,
    screenY: center?.y ?? 0,
  };
  const upMouseInit: MouseEventInit = {
    ...baseMouseInit,
    buttons: 0,
  };
  const pointerCtor = windowRef?.PointerEvent;
  const mouseCtor = windowRef?.MouseEvent ?? MouseEvent;
  if (pointerCtor) {
    element.dispatchEvent(
      new pointerCtor("pointerover", {
        ...baseMouseInit,
        pointerId: 1,
        pointerType: "mouse",
        isPrimary: true,
      }),
    );
    element.dispatchEvent(
      new pointerCtor("pointerenter", {
        ...baseMouseInit,
        pointerId: 1,
        pointerType: "mouse",
        isPrimary: true,
      }),
    );
  }
  element.dispatchEvent(new mouseCtor("mouseover", baseMouseInit));
  element.dispatchEvent(new mouseCtor("mouseenter", baseMouseInit));
  element.dispatchEvent(new mouseCtor("mousemove", baseMouseInit));
  if (pointerCtor) {
    element.dispatchEvent(
      new pointerCtor("pointerdown", {
        ...baseMouseInit,
        pointerId: 1,
        pointerType: "mouse",
        isPrimary: true,
      }),
    );
  }
  element.dispatchEvent(new mouseCtor("mousedown", baseMouseInit));
  if (pointerCtor) {
    element.dispatchEvent(
      new pointerCtor("pointerup", {
        ...upMouseInit,
        pointerId: 1,
        pointerType: "mouse",
        isPrimary: true,
      }),
    );
  }
  element.dispatchEvent(new mouseCtor("mouseup", upMouseInit));
  element.dispatchEvent(new mouseCtor("click", upMouseInit));
}

function triggerKeyboardActivation(element: Element): void {
  if (!(element instanceof HTMLElement)) {
    return;
  }

  element.focus();
  const windowRef = element.ownerDocument.defaultView;
  const keyboardCtor = windowRef?.KeyboardEvent ?? KeyboardEvent;
  for (const key of ["Enter", " "]) {
    const code = key === "Enter" ? "Enter" : "Space";
    const init: KeyboardEventInit = {
      bubbles: true,
      cancelable: true,
      composed: true,
      key,
      code,
    };
    element.dispatchEvent(new keyboardCtor("keydown", init));
    element.dispatchEvent(new keyboardCtor("keypress", init));
    element.dispatchEvent(new keyboardCtor("keyup", init));
  }
}

function getElementCenterPoint(element: HTMLElement): { x: number; y: number } | undefined {
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    return undefined;
  }

  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };
}

function scrollElementIntoView(element: Element): void {
  if (element instanceof HTMLElement && typeof element.scrollIntoView === "function") {
    element.scrollIntoView({ block: "center", inline: "nearest" });
  }
}

function getLocalToday(DateCtor: DateConstructor = Date): LocalDateParts {
  const now = new DateCtor();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const day = now.getDate();
  return buildLocalDateParts(year, month, day);
}

function addYearsClamped(date: LocalDateParts, years: number): LocalDateParts {
  const targetYear = date.year + years;
  const maxDay = new Date(targetYear, date.month, 0).getDate();
  return buildLocalDateParts(targetYear, date.month, Math.min(date.day, maxDay));
}

function buildLocalDateParts(year: number, month: number, day: number): LocalDateParts {
  const paddedMonth = String(month).padStart(2, "0");
  const paddedDay = String(day).padStart(2, "0");

  return {
    year,
    month,
    day,
    isoDate: `${year}-${paddedMonth}-${paddedDay}`,
  };
}

function buildDateTimeInputValue(
  input: HTMLInputElement,
  date: LocalDateParts,
  timeLabel: string,
): string {
  const time = normalizeTimeLabelForInput(timeLabel);
  if (input.type === "datetime-local") {
    return `${date.isoDate}T${time}`;
  }

  if (input.type === "date") {
    return date.isoDate;
  }

  const paddedMonth = String(date.month).padStart(2, "0");
  const paddedDay = String(date.day).padStart(2, "0");
  const dotDate = `${date.year}.${paddedMonth}.${paddedDay}.`;
  const currentValue = input.value.trim();
  if (currentValue.includes(date.isoDate) || /\d{4}-\d{2}-\d{2}T/.test(currentValue)) {
    return `${date.isoDate}T${time}`;
  }

  return `${dotDate} ${time}`;
}

function normalizeTimeLabelForInput(label: string): string {
  const [hour = "0", minute = "0"] = label.split(":");
  return `${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`;
}

function writeInputValueWithNativeSetter(input: HTMLInputElement, value: string): boolean {
  try {
    const prototype = Object.getPrototypeOf(input) as HTMLInputElement;
    const descriptor =
      Object.getOwnPropertyDescriptor(prototype, "value") ??
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
    if (descriptor?.set) {
      descriptor.set.call(input, value);
    } else {
      input.value = value;
    }
    return input.value === value;
  } catch {
    return false;
  }
}

function dispatchInputEvents(element: Element): void {
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
  element.dispatchEvent(new Event("blur", { bubbles: true }));
}

function dispatchEscape(element: Element): void {
  const documentRef = element.ownerDocument;
  const windowRef = documentRef.defaultView;
  const keyboardCtor = windowRef?.KeyboardEvent ?? KeyboardEvent;
  const init: KeyboardEventInit = {
    bubbles: true,
    cancelable: true,
    composed: true,
    key: "Escape",
    code: "Escape",
  };
  element.dispatchEvent(new keyboardCtor("keydown", init));
  element.dispatchEvent(new keyboardCtor("keyup", init));
  documentRef.dispatchEvent(new keyboardCtor("keydown", init));
  documentRef.dispatchEvent(new keyboardCtor("keyup", init));
}

function resolveElementText(element: Element, documentRef: Document): string {
  const htmlFor = element.getAttribute("for");
  const labelledBy = element.getAttribute("aria-labelledby");
  const labelText = labelledBy
    ?.split(/\s+/)
    .map((id) => documentRef.getElementById(id)?.textContent ?? "")
    .join(" ");

  return normalizeWhitespace(
    [
      element.textContent,
      element.getAttribute("aria-label"),
      element.getAttribute("title"),
      labelText,
      htmlFor ? documentRef.getElementById(htmlFor)?.textContent : undefined,
      element instanceof HTMLInputElement ? element.value : undefined,
      element instanceof HTMLOptionElement ? element.value : undefined,
    ]
      .filter(Boolean)
      .join(" "),
  );
}

function getVisibleElementText(root: Element): string {
  const parts: string[] = [];
  const elements = [root, ...Array.from(root.querySelectorAll("*"))];

  for (const element of elements) {
    if (!isVisible(element)) {
      continue;
    }

    for (const node of Array.from(element.childNodes)) {
      if (node.nodeType === 3) {
        parts.push(node.textContent ?? "");
      }
    }

    parts.push(
      element.getAttribute("aria-label") ?? "",
      element.getAttribute("title") ?? "",
      element instanceof HTMLInputElement ? element.value : "",
      element instanceof HTMLOptionElement ? element.value : "",
    );
  }

  return normalizeWhitespace(parts.join(" "));
}

function includesAny(value: string | null | undefined, hints: readonly string[]): boolean {
  const normalized = normalizeWhitespace(value);
  return hints.some((hint) => normalized.includes(normalizeWhitespace(hint)));
}

function normalizeRequiredOptions(
  options: readonly RequiredOption[] | null | undefined = DEFAULT_REQUIRED_OPTIONS,
): RequiredOption[] {
  const source = options ?? DEFAULT_REQUIRED_OPTIONS;
  const normalized = source
    .map((option) => ({
      name: option.name.trim(),
      value: option.value.trim(),
    }))
    .filter((option) => option.name.length > 0 && option.value.length > 0)
    .slice(0, 20);

  return normalized.length > 0
    ? normalized
    : DEFAULT_REQUIRED_OPTIONS.map((option) => ({ ...option }));
}

function normalizeWhitespace(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}
