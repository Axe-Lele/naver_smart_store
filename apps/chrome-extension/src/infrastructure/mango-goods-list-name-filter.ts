// 더망고 상품관리 목록화면에 진입했을 때, '상품명 미수정 상품만 보기' 필터를
// 자동으로 선택하고 재조회를 유도한다. select2 로 감싸진 원본 <select> 를 그대로
// 조작하며(값 변경 + change 이벤트), 비공식 내부 API 는 호출하지 않는다.

const TARGET_OPTION_LABEL = "상품명 미수정 상품만 보기";

export type ApplyUnmodifiedNameFilterResult = {
  applied: boolean;
  note: string;
};

export function applyUnmodifiedNameOnlyFilter(
  documentRef: Document = document,
): ApplyUnmodifiedNameFilterResult {
  const select = findFilterSelect(documentRef);
  if (!select) {
    return {
      applied: false,
      note: "'상품명 미수정 상품만 보기' 필터를 찾지 못했습니다.",
    };
  }

  const targetOption = Array.from(select.options).find(
    (option) => normalizeWhitespace(option.textContent) === TARGET_OPTION_LABEL,
  );
  if (!targetOption) {
    return {
      applied: false,
      note: "'상품명 미수정 상품만 보기' 옵션을 찾지 못했습니다.",
    };
  }

  if (select.value === targetOption.value) {
    return {
      applied: false,
      note: "이미 '상품명 미수정 상품만 보기'로 설정되어 있습니다.",
    };
  }

  select.value = targetOption.value;
  select.dispatchEvent(new Event("input", { bubbles: true, cancelable: true }));
  select.dispatchEvent(new Event("change", { bubbles: true, cancelable: true }));

  const submitTrigger = findNearbySubmitTrigger(select, documentRef);
  if (submitTrigger) {
    triggerClick(submitTrigger);
  }

  return {
    applied: true,
    note: "'상품명 미수정 상품만 보기'로 설정하고 재조회를 요청했습니다.",
  };
}

function findFilterSelect(documentRef: Document): HTMLSelectElement | null {
  const selects = Array.from(documentRef.querySelectorAll("select"));

  return (
    selects.find((select) =>
      Array.from(select.options).some(
        (option) => normalizeWhitespace(option.textContent) === TARGET_OPTION_LABEL,
      ),
    ) ?? null
  );
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
