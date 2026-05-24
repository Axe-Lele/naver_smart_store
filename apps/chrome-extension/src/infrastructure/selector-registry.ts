// Path: C:\smart-store\apps\chrome-extension\src\infrastructure\selector-registry.ts
import type {
  SelectorCandidate,
  SelectorKey,
  SelectorRegistryPort,
  SellerCenterPageType,
} from "../application/index.js";

const TODO_NOTE =
  "TODO: verification required on the live seller center page before enabling automation.";

function candidate(
  key: SelectorKey,
  strategy: SelectorCandidate["strategy"],
  value: string,
  priority: number,
  note: string,
  fallback = false,
): SelectorCandidate {
  return {
    key,
    strategy,
    value,
    priority,
    fallback,
    verificationStatus: "verification_required",
    note,
  };
}

const UNVERIFIED_SELECTOR_PROFILE: Record<SelectorKey, SelectorCandidate[]> = {
  "search.bundleDeliveryFilter": [
    candidate(
      "search.bundleDeliveryFilter",
      "data",
      "bundle",
      1,
      `${TODO_NOTE} Heuristic only. Look for data-* attributes hinting at bundle delivery filters.`,
    ),
    candidate(
      "search.bundleDeliveryFilter",
      "aria",
      "묶음배송",
      2,
      `${TODO_NOTE} Prefer aria-label or labelled control for the bundle-delivery filter.`,
    ),
    candidate(
      "search.bundleDeliveryFilter",
      "name",
      "bundle",
      3,
      `${TODO_NOTE} Heuristic only. Check name/id fragments related to bundle delivery.`,
    ),
    candidate(
      "search.bundleDeliveryFilter",
      "text",
      "묶음배송",
      9,
      `${TODO_NOTE} Text match is fallback only and must not be treated as final.`,
      true,
    ),
  ],
  "search.searchButton": [
    candidate(
      "search.searchButton",
      "data",
      "search",
      1,
      `${TODO_NOTE} Prefer data-* hooks on the search action.`,
    ),
    candidate(
      "search.searchButton",
      "aria",
      "검색",
      2,
      `${TODO_NOTE} Prefer aria-label/name for the search button.`,
    ),
    candidate(
      "search.searchButton",
      "name",
      "search",
      3,
      `${TODO_NOTE} Heuristic only. Check name/id fragments for the search button.`,
    ),
    candidate(
      "search.searchButton",
      "text",
      "검색",
      9,
      `${TODO_NOTE} Text match is fallback only and must not be treated as final.`,
      true,
    ),
  ],
  "search.resultRows": [
    candidate(
      "search.resultRows",
      "css",
      '.ag-body-viewport .ag-pinned-left-cols-container [role="row"].ag-row',
      0,
      "Current Smart Store product list anchor: ag-grid pinned-left rows contain edit action, product number, seller code, and product name.",
    ),
    candidate(
      "search.resultRows",
      "css",
      "table tbody tr",
      4,
      `${TODO_NOTE} Product rows must stay scoped to the visible product list table.`,
      true,
    ),
  ],
  "search.editAction": [
    candidate(
      "search.editAction",
      "css",
      'button[data-nclicks-code="itg.edit"]',
      0,
      "Current Smart Store product list anchor: edit button inside the ag-grid edit column.",
    ),
    candidate(
      "search.editAction",
      "data",
      "edit",
      1,
      `${TODO_NOTE} Prefer data-* hooks on the edit action.`,
    ),
    candidate(
      "search.editAction",
      "aria",
      "수정",
      2,
      `${TODO_NOTE} Prefer aria-labelled edit action in each result row.`,
    ),
    candidate(
      "search.editAction",
      "name",
      "edit",
      3,
      `${TODO_NOTE} Heuristic only. Check name/id fragments for edit links or buttons.`,
    ),
    candidate(
      "search.editAction",
      "text",
      "수정",
      9,
      `${TODO_NOTE} Text match is fallback only and must not be treated as final.`,
      true,
    ),
  ],
  "editor.preorderSection": [
    candidate(
      "editor.preorderSection",
      "data",
      "preorder",
      1,
      `${TODO_NOTE} Heuristic only. Prefer data-* markers if the editor exposes them.`,
    ),
    candidate(
      "editor.preorderSection",
      "aria",
      "예약구매",
      2,
      `${TODO_NOTE} Prefer aria-labelled group/region/fieldset for the preorder section.`,
    ),
    candidate(
      "editor.preorderSection",
      "name",
      "preorder",
      3,
      `${TODO_NOTE} Heuristic only. Check name/id fragments for preorder section wrappers.`,
    ),
    candidate(
      "editor.preorderSection",
      "text",
      "예약구매",
      9,
      `${TODO_NOTE} Text match is fallback only and must not be treated as final.`,
      true,
    ),
  ],
  "editor.preorderProductOption": [
    candidate(
      "editor.preorderProductOption",
      "css",
      'input#preOrder1_1[data-nclicks-code="pro.on"]',
      0,
      "Current Smart Store preorder section anchor: 예약구매 설정함 radio input.",
    ),
    candidate(
      "editor.preorderProductOption",
      "aria",
      "예약구매",
      1,
      `${TODO_NOTE} Prefer aria-labelled radio/option for the preorder product type.`,
    ),
    candidate(
      "editor.preorderProductOption",
      "text",
      "예약구매",
      8,
      `${TODO_NOTE} Text match is fallback only and must not be treated as final.`,
      true,
    ),
    candidate(
      "editor.preorderProductOption",
      "text",
      "예약상품",
      9,
      `${TODO_NOTE} Text match is fallback only and must not be treated as final.`,
      true,
    ),
  ],
  "editor.normalProductOption": [
    candidate(
      "editor.normalProductOption",
      "aria",
      "일반상품",
      1,
      `${TODO_NOTE} Prefer aria-labelled radio/option for the normal product type.`,
    ),
    candidate(
      "editor.normalProductOption",
      "text",
      "일반상품",
      8,
      `${TODO_NOTE} Text match is fallback only and must not be treated as final.`,
      true,
    ),
    candidate(
      "editor.normalProductOption",
      "text",
      "일반 상품",
      9,
      `${TODO_NOTE} Text match is fallback only and must not be treated as final.`,
      true,
    ),
  ],
  "editor.orderPeriodControl": [
    candidate(
      "editor.orderPeriodControl",
      "css",
      'ncp-datetime-range-picker2[data-nclicks-code="pro.period"][start-date-name="product.saleStartDate"][end-date-name="product.saleEndDate"]',
      0,
      "Current Smart Store preorder section anchor: 주문기간 date range picker.",
    ),
    candidate(
      "editor.orderPeriodControl",
      "aria",
      "주문기간",
      1,
      `${TODO_NOTE} Prefer aria-labelled input or combobox for the preorder order period.`,
    ),
    candidate(
      "editor.orderPeriodControl",
      "name",
      "order",
      2,
      `${TODO_NOTE} Heuristic only. Check name/id fragments related to order period.`,
    ),
    candidate(
      "editor.orderPeriodControl",
      "data",
      "order",
      3,
      `${TODO_NOTE} Heuristic only. Check data-* fragments related to order period.`,
    ),
    candidate(
      "editor.orderPeriodControl",
      "text",
      "주문기간",
      9,
      `${TODO_NOTE} Text match is fallback only and must not be treated as final.`,
      true,
    ),
  ],
  "editor.postPreorderStatusControl": [
    candidate(
      "editor.postPreorderStatusControl",
      "css",
      'input#afterSaleStatus2[name="afterSaleStatus"][value="SALE"]',
      0,
      "Current Smart Store preorder section anchor: 예약구매 종료 후 판매 중 radio input.",
    ),
    candidate(
      "editor.postPreorderStatusControl",
      "aria",
      "판매상태",
      1,
      `${TODO_NOTE} Prefer aria-labelled control for post-preorder sales status.`,
    ),
    candidate(
      "editor.postPreorderStatusControl",
      "name",
      "status",
      2,
      `${TODO_NOTE} Heuristic only. Check name/id fragments related to sale status.`,
    ),
    candidate(
      "editor.postPreorderStatusControl",
      "data",
      "status",
      3,
      `${TODO_NOTE} Heuristic only. Check data-* fragments related to sale status.`,
    ),
    candidate(
      "editor.postPreorderStatusControl",
      "text",
      "판매중",
      9,
      `${TODO_NOTE} Text match is fallback only and must not be treated as final.`,
      true,
    ),
  ],
  "editor.dispatchCompletionDateControl": [
    candidate(
      "editor.dispatchCompletionDateControl",
      "css",
      'ncp-datetime-picker2[data-nclicks-code="pro.shipcompl"][date-name="product.detailAttribute.preOrderInfo.deliveryEndDate"]',
      0,
      "Current Smart Store preorder section anchor: 발송완료일 date picker.",
    ),
    candidate(
      "editor.dispatchCompletionDateControl",
      "aria",
      "발송완료일",
      1,
      `${TODO_NOTE} Prefer aria-labelled date input for dispatch completion date.`,
    ),
    candidate(
      "editor.dispatchCompletionDateControl",
      "name",
      "dispatch",
      2,
      `${TODO_NOTE} Heuristic only. Check name/id fragments related to dispatch completion date.`,
    ),
    candidate(
      "editor.dispatchCompletionDateControl",
      "data",
      "dispatch",
      3,
      `${TODO_NOTE} Heuristic only. Check data-* fragments related to dispatch completion date.`,
    ),
    candidate(
      "editor.dispatchCompletionDateControl",
      "text",
      "발송완료일",
      9,
      `${TODO_NOTE} Text match is fallback only and must not be treated as final.`,
      true,
    ),
  ],
  "editor.optionSection": [
    candidate(
      "editor.optionSection",
      "data",
      "option",
      1,
      `${TODO_NOTE} Prefer data-* markers for the product option section.`,
    ),
    candidate(
      "editor.optionSection",
      "aria",
      "옵션",
      2,
      `${TODO_NOTE} Prefer aria-labelled group/region/fieldset for option settings.`,
    ),
    candidate(
      "editor.optionSection",
      "text",
      "옵션",
      9,
      `${TODO_NOTE} Text match is fallback only and must not be treated as final.`,
      true,
    ),
  ],
  "editor.optionEnabledControl": [
    candidate(
      "editor.optionEnabledControl",
      "aria",
      "설정함",
      1,
      `${TODO_NOTE} Prefer aria-labelled radio/option for enabling product options.`,
    ),
    candidate(
      "editor.optionEnabledControl",
      "text",
      "설정함",
      9,
      `${TODO_NOTE} Text match is fallback only and must not be treated as final.`,
      true,
    ),
  ],
  "editor.optionTypeControl": [
    candidate(
      "editor.optionTypeControl",
      "aria",
      "단독형",
      1,
      `${TODO_NOTE} Prefer aria-labelled select/radio for option composition type.`,
    ),
    candidate(
      "editor.optionTypeControl",
      "text",
      "단독형",
      9,
      `${TODO_NOTE} Text match is fallback only and must not be treated as final.`,
      true,
    ),
  ],
  "editor.optionNameControl": [
    candidate(
      "editor.optionNameControl",
      "aria",
      "옵션명",
      1,
      `${TODO_NOTE} Prefer labelled input for option name.`,
    ),
    candidate(
      "editor.optionNameControl",
      "name",
      "option",
      2,
      `${TODO_NOTE} Heuristic only. Check name/id fragments related to option name.`,
    ),
  ],
  "editor.optionValueControl": [
    candidate(
      "editor.optionValueControl",
      "aria",
      "옵션값",
      1,
      `${TODO_NOTE} Prefer labelled input for option value.`,
    ),
    candidate(
      "editor.optionValueControl",
      "name",
      "value",
      2,
      `${TODO_NOTE} Heuristic only. Check name/id fragments related to option value.`,
    ),
  ],
  "editor.saveButton": [
    candidate(
      "editor.saveButton",
      "css",
      'button[data-nclicks-code="flt.save"][progress-button="vm.submit()"]',
      0,
      "Current Smart Store product editor anchor: final save action has flt.save tracking and vm.submit progress binding.",
    ),
    candidate(
      "editor.saveButton",
      "css",
      'button[data-nclicks-code="flt.save"]',
      1,
      "Current Smart Store product editor anchor: final save action uses flt.save tracking.",
    ),
    candidate(
      "editor.saveButton",
      "data",
      "save",
      2,
      `${TODO_NOTE} Prefer data-* hooks on the save action.`,
    ),
    candidate(
      "editor.saveButton",
      "aria",
      "저장",
      3,
      `${TODO_NOTE} Prefer aria-labelled save action.`,
    ),
    candidate(
      "editor.saveButton",
      "name",
      "save",
      4,
      `${TODO_NOTE} Heuristic only. Check name/id fragments for the save action.`,
    ),
    candidate(
      "editor.saveButton",
      "text",
      "저장",
      9,
      `${TODO_NOTE} Text match is fallback only and must not be treated as final.`,
      true,
    ),
  ],
  "editor.successFeedback": [
    candidate(
      "editor.successFeedback",
      "data",
      "toast",
      1,
      `${TODO_NOTE} Prefer data-* hooks for save-result feedback.`,
    ),
    candidate(
      "editor.successFeedback",
      "aria",
      "완료",
      2,
      `${TODO_NOTE} Prefer aria-live, alert, or status regions for save-result feedback.`,
    ),
    candidate(
      "editor.successFeedback",
      "text",
      "저장",
      9,
      `${TODO_NOTE} Text match is fallback only and must not be treated as final.`,
      true,
    ),
  ],
};

const PAGE_TYPE_KEYS: Record<SellerCenterPageType, SelectorKey[]> = {
  non_seller_center: [],
  unknown: [],
  other_seller_center: [],
  product_search: [
    "search.bundleDeliveryFilter",
    "search.searchButton",
    "search.resultRows",
    "search.editAction",
  ],
  product_edit: [
    "editor.preorderSection",
    "editor.preorderProductOption",
    "editor.normalProductOption",
    "editor.orderPeriodControl",
    "editor.postPreorderStatusControl",
    "editor.dispatchCompletionDateControl",
    "editor.optionSection",
    "editor.optionEnabledControl",
    "editor.optionTypeControl",
    "editor.optionNameControl",
    "editor.optionValueControl",
    "editor.saveButton",
    "editor.successFeedback",
  ],
};

export class InMemorySelectorRegistry implements SelectorRegistryPort {
  public list(key: SelectorKey): SelectorCandidate[] {
    return [...UNVERIFIED_SELECTOR_PROFILE[key]].sort(
      (left, right) => left.priority - right.priority,
    );
  }

  public keysForPageType(pageType: SellerCenterPageType): SelectorKey[] {
    return PAGE_TYPE_KEYS[pageType];
  }
}
