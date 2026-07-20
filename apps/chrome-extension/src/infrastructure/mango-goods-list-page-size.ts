// 더망고 상품관리 목록화면의 '표시건수' select를 찾아 값을 바꿔주는 헬퍼.
// 페이지가 이미 제공하는 select 를 그대로 사용하며(값 목록을 임의로 만들지 않음),
// 값을 바꾼 뒤 change 이벤트와 근처 조회/검색 버튼 클릭까지 시도한다.
// 비공식 내부 API 호출 없이, 운영자가 직접 select 를 바꾸고 조회 버튼을 누르는 것과 동일하게 동작한다.

const COUNT_OPTION_PATTERN = /^\s*\d{1,4}\s*(개씩)?\s*(보기)?\s*$/;
const NEARBY_LABEL_TERMS = ["표시", "목록", "페이지당", "건씩"];
// 더망고 상품관리 목록의 '표시건수' select는 select2 로 감싸여 있어 원본 <select>가
// 화면에서 숨겨지고(id="ps_num"), 대신 id="s2id_ps_num" 컨테이너가 보인다.
// select2 위젯의 텍스트/구조만으로는 근처 라벨을 못 찾기 때문에 알려진 id를 우선 사용한다.
const KNOWN_SELECT_ID = "ps_num";

export type GoodsListPageSizeOption = {
  value: string;
  label: string;
};

export function findGoodsListPageSizeSelect(
  documentRef: Document = document,
): HTMLSelectElement | null {
  const known = documentRef.getElementById(KNOWN_SELECT_ID);
  if (known instanceof HTMLSelectElement) {
    return known;
  }

  const selects = Array.from(documentRef.querySelectorAll("select"));

  return (
    selects.find((select) => isPageSizeSelect(select)) ?? null
  );
}

export function readGoodsListPageSizeOptions(
  select: HTMLSelectElement,
): GoodsListPageSizeOption[] {
  return Array.from(select.options).map((option) => ({
    value: option.value,
    label: normalizeWhitespace(option.textContent) || option.value,
  }));
}

export function applyGoodsListPageSize(
  select: HTMLSelectElement,
  value: string,
  documentRef: Document = document,
): { applied: boolean; note: string } {
  if (select.value === value) {
    return { applied: false, note: "이미 선택된 표시건수입니다." };
  }

  select.value = value;
  select.dispatchEvent(new Event("input", { bubbles: true, cancelable: true }));
  select.dispatchEvent(new Event("change", { bubbles: true, cancelable: true }));

  const submitTrigger = findNearbySubmitTrigger(select, documentRef);
  if (submitTrigger) {
    triggerClick(submitTrigger);
    return { applied: true, note: "표시건수를 변경하고 재조회를 요청했습니다." };
  }

  return {
    applied: true,
    note: "표시건수를 변경했습니다. 화면이 자동으로 갱신되지 않으면 조회 버튼을 눌러주세요.",
  };
}

function isPageSizeSelect(select: HTMLSelectElement): boolean {
  const options = Array.from(select.options);
  if (options.length < 2) {
    return false;
  }

  const looksLikeCounts = options.every((option) =>
    COUNT_OPTION_PATTERN.test(option.textContent ?? option.value),
  );
  if (!looksLikeCounts) {
    return false;
  }

  return containsNearbyLabelTerm(select);
}

function containsNearbyLabelTerm(select: HTMLSelectElement): boolean {
  const descriptor = normalizeWhitespace(
    [
      select.getAttribute("name"),
      select.getAttribute("id"),
      select.closest("label")?.textContent,
      select.previousElementSibling?.textContent,
      select.parentElement?.textContent,
    ].join(" "),
  );

  return NEARBY_LABEL_TERMS.some((term) => descriptor.includes(term));
}

function findNearbySubmitTrigger(select: HTMLSelectElement, documentRef: Document): Element | null {
  const form = select.closest("form");
  const scope: ParentNode = form ?? documentRef;
  const candidates = Array.from(
    scope.querySelectorAll("button, input[type='button'], input[type='submit'], a"),
  );

  return (
    candidates.find((candidate) => {
      const text = normalizeWhitespace(
        candidate instanceof HTMLInputElement ? candidate.value : candidate.textContent,
      );
      return text === "조회" || text === "검색";
    }) ?? null
  );
}

function normalizeWhitespace(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function triggerClick(element: Element): void {
  if (element instanceof HTMLElement) {
    element.click();
    return;
  }

  element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
}
