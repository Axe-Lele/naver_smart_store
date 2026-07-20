// 더망고 상품관리 화면에서 원문상품명 패널의 '적용' 버튼이 누르는 동작.
// 페이지 자체의 상품명 수정 UI(chg1/chg2 onclick 버튼, chg_goods_name_{id} 입력창)를
// 실제로 클릭/입력해서 저장한다. 관리화면의 비공식 내부 API(admin_goods_ok.php 등)는
// 직접 호출하지 않고, 운영자가 수동으로 누르는 것과 동일한 클릭/입력만 수행한다.

const OPEN_EDIT_POLL_MS = 80;
const OPEN_EDIT_TIMEOUT_MS = 3_000;

export type ApplyMangoOriginNameResult = {
  ok: boolean;
  note: string;
};

export async function applyMangoOriginProductName(
  productId: string,
  name: string,
  documentRef: Document = document,
  windowRef: Window = window,
): Promise<ApplyMangoOriginNameResult> {
  const editTrigger = findEditOpenTrigger(productId, documentRef);
  if (!editTrigger) {
    return {
      ok: false,
      note: "'상품명수정' 버튼을 찾지 못했습니다. 화면 구조를 확인해주세요.",
    };
  }

  triggerClick(editTrigger);

  const input = await waitForNameInput(productId, documentRef, windowRef);
  if (!input) {
    return {
      ok: false,
      note: "상품명 입력창이 열리지 않았습니다. 잠시 후 다시 시도해주세요.",
    };
  }

  input.value = name;
  input.dispatchEvent(new Event("input", { bubbles: true, cancelable: true }));
  input.dispatchEvent(new Event("keyup", { bubbles: true, cancelable: true }));

  const saveTrigger = findSaveTrigger(productId, documentRef);
  if (!saveTrigger) {
    return {
      ok: false,
      note: "'상품명 변경하기' 버튼을 찾지 못했습니다. 화면 구조를 확인해주세요.",
    };
  }

  triggerClick(saveTrigger);

  return {
    ok: true,
    note: "적용 요청을 전송했습니다. 실제 반영 여부는 화면에서 확인해주세요.",
  };
}

function findEditOpenTrigger(productId: string, documentRef: Document): Element | null {
  return findByOnclickPattern(documentRef, new RegExp(`chg1\\(\\s*'${escapeRegExp(productId)}'\\s*\\)`));
}

function findSaveTrigger(productId: string, documentRef: Document): Element | null {
  return findByOnclickPattern(
    documentRef,
    new RegExp(`chg2\\(\\s*'${escapeRegExp(productId)}'\\s*,\\s*'change'`),
  );
}

function findByOnclickPattern(documentRef: Document, pattern: RegExp): Element | null {
  const candidates = Array.from(documentRef.querySelectorAll("[onclick]"));
  return candidates.find((element) => pattern.test(element.getAttribute("onclick") ?? "")) ?? null;
}

async function waitForNameInput(
  productId: string,
  documentRef: Document,
  windowRef: Window,
): Promise<HTMLInputElement | null> {
  const inputId = `chg_goods_name_${productId}`;
  const startedAt = Date.now();

  while (Date.now() - startedAt < OPEN_EDIT_TIMEOUT_MS) {
    const input = documentRef.getElementById(inputId);
    if (input instanceof HTMLInputElement && isVisibleElement(input)) {
      return input;
    }

    await delay(windowRef, OPEN_EDIT_POLL_MS);
  }

  return null;
}

function isVisibleElement(element: Element): boolean {
  const htmlElement = element as HTMLElement;
  if (htmlElement.hidden) {
    return false;
  }

  const style = window.getComputedStyle?.(htmlElement);
  return !(style && (style.display === "none" || style.visibility === "hidden"));
}

function triggerClick(element: Element): void {
  if (element instanceof HTMLElement) {
    element.click();
    return;
  }

  element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
}

function delay(windowRef: Window, delayMs: number): Promise<void> {
  return new Promise((resolve) => {
    windowRef.setTimeout(resolve, delayMs);
  });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
