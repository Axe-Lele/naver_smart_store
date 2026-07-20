// 더망고 상품관리/휴지통 화면에서 원문상품명 패널의 '선택삭제' 버튼이 누르는 동작.
// 화면 자체에 이미 있는 선택삭제 기능을 그대로 태운다:
//   <input type="checkbox" name="uid_check[]" value="184754">  (상품별 체크박스)
//   상품관리: <a href="#none" onclick="goods_delete('')"><span>선택삭제</span></a>
//   휴지통  : <a href="#none" onclick="goods_permanent_delete('select')"><span>선택 영구삭제</span></a>
// 두 화면 모두 같은 체크박스 이름을 쓰지만 삭제 트리거와 되돌릴 수 있는 정도가
// 다르므로, 현재 화면에 실제로 존재하는 트리거를 찾아 그것만 클릭한다.
// 우리 패널의 체크박스 선택 상태를 실제 화면의 uid_check[] 체크박스에 그대로
// 반영한 뒤(선택 안 한 상품은 확실히 해제), 화면의 삭제 링크를 클릭한다.
// 비공식 내부 API(admin_goods_ok.php 등)는 직접 호출하지 않는다.

const GOODS_CHECKBOX_NAME = "uid_check[]";

export type MangoSelectedDeleteKind = "permanent" | "normal";

export type MangoSelectedDeleteAction = {
  kind: MangoSelectedDeleteKind;
  /** 화면에 실제 표시된 문구('선택삭제' | '선택 영구삭제') */
  label: string;
};

// 상품관리 화면의 'goods_delete('는 휴지통 화면의 'goods_permanent_delete('와
// 문자열이 겹치지 않으므로, 두 패턴을 순서대로 검사해 현재 화면에 있는 쪽만 매칭한다.
const SELECTED_DELETE_TRIGGERS: ReadonlyArray<{
  kind: MangoSelectedDeleteKind;
  label: string;
  pattern: RegExp;
}> = [
  { kind: "permanent", label: "선택 영구삭제", pattern: /goods_permanent_delete\(/ },
  { kind: "normal", label: "선택삭제", pattern: /goods_delete\(/ },
];

export type ApplyMangoSelectedDeleteResult = {
  ok: boolean;
  note: string;
};

/** 확인창 문구를 만들기 위해, 클릭하지 않고 현재 화면의 삭제 동작 종류만 확인한다. */
export function detectMangoSelectedDeleteAction(
  documentRef: Document = document,
): MangoSelectedDeleteAction | null {
  const trigger = findSelectedDeleteTrigger(documentRef);
  return trigger ? { kind: trigger.kind, label: trigger.label } : null;
}

export function applyMangoSelectedDelete(
  productIds: string[],
  documentRef: Document = document,
): ApplyMangoSelectedDeleteResult {
  const checkboxes = Array.from(
    documentRef.querySelectorAll<HTMLInputElement>(`input[name="${GOODS_CHECKBOX_NAME}"]`),
  );

  if (checkboxes.length === 0) {
    return {
      ok: false,
      note: "상품 체크박스를 찾지 못했습니다. 화면 구조를 확인해주세요.",
    };
  }

  const targetIds = new Set(productIds);
  for (const checkbox of checkboxes) {
    checkbox.checked = targetIds.has(checkbox.value);
  }

  const trigger = findSelectedDeleteTrigger(documentRef);
  if (!trigger) {
    return {
      ok: false,
      note: "'선택삭제'/'선택 영구삭제' 버튼을 찾지 못했습니다. 화면 구조를 확인해주세요.",
    };
  }

  triggerClick(trigger.element);

  return {
    ok: true,
    note: `${trigger.label} 요청을 전송했습니다. 실제 반영 여부는 화면에서 확인해주세요.`,
  };
}

function findSelectedDeleteTrigger(
  documentRef: Document,
): { element: Element; kind: MangoSelectedDeleteKind; label: string } | null {
  const candidates = Array.from(documentRef.querySelectorAll("[onclick]"));
  for (const { kind, label, pattern } of SELECTED_DELETE_TRIGGERS) {
    const element = candidates.find((candidate) =>
      pattern.test(candidate.getAttribute("onclick") ?? ""),
    );
    if (element) {
      return { element, kind, label };
    }
  }
  return null;
}

function triggerClick(element: Element): void {
  if (element instanceof HTMLElement) {
    element.click();
    return;
  }

  element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
}
