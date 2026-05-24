// Path: C:\smart-store\apps\chrome-extension\src\infrastructure\product-list-pagination.navigator.ts
import { WaitStrategy } from "./wait-strategy.js";

const PAGINATION_CHANGE_TIMEOUT_MS = 8_000;
const PAGINATION_POLL_MS = 150;

export interface PaginationMoveResult {
  ok: boolean;
  note: string;
}

export class ProductListPaginationNavigator {
  private readonly waitStrategy: WaitStrategy;

  public constructor(
    private readonly documentRef: Document = document,
    private readonly windowRef: Window = window,
  ) {
    this.waitStrategy = new WaitStrategy(this.windowRef, this.documentRef);
  }

  public async moveToNextResultPage(): Promise<PaginationMoveResult> {
    await this.waitStrategy.waitForReady({ timeoutMs: 5_000, retries: 0 });

    const nextControl = findNextPaginationControl(this.documentRef);
    if (!nextControl) {
      return {
        ok: false,
        note: "상품목록 pagination에서 다음 페이지 버튼을 찾지 못했습니다.",
      };
    }

    const beforeSignature = readPaginationSignature(this.documentRef);
    triggerClick(nextControl);
    const changed = await waitUntil(
      this.windowRef,
      () => readPaginationSignature(this.documentRef) !== beforeSignature,
      PAGINATION_CHANGE_TIMEOUT_MS,
      PAGINATION_POLL_MS,
    );
    await this.waitStrategy.waitForReady({ timeoutMs: 5_000, retries: 0 });

    return {
      ok: true,
      note: changed
        ? "상품목록 pagination의 다음 페이지 버튼을 클릭했습니다."
        : "상품목록 pagination의 다음 페이지 버튼을 클릭했지만 페이지 변경 신호를 확인하지 못했습니다.",
    };
  }
}

function findNextPaginationControl(documentRef: Document): Element | null {
  const candidates = uniqueElements(
    [
      'ul.pagination._pc_pagination[data-nclicks-code="itg.page"] li._page.ag-paging-button a[ref="btNext"]',
      'ul.pagination._pc_pagination li._page.ag-paging-button a[aria-label*="다음"]',
      'ul.pagination[data-nclicks-code="itg.page"] a[ref="btNext"]',
      'a[ref="btNext"][aria-label*="다음 페이지"]',
    ].flatMap((selector) => safeQuerySelectorAll(documentRef, selector)),
  );

  return (
    candidates.find((candidate) => {
      const owner = candidate.closest("li, button, a") ?? candidate;
      return isVisibleElement(candidate) && !isPaginationControlDisabled(owner);
    }) ?? null
  );
}

function isPaginationControlDisabled(element: Element): boolean {
  const descriptor = normalizeWhitespace(
    [
      element.getAttribute("class"),
      element.getAttribute("aria-disabled"),
      element.getAttribute("disabled"),
      element.getAttribute("data-disabled"),
    ].join(" "),
  ).toLowerCase();

  return (
    descriptor.includes("disabled") ||
    descriptor.includes("ag-disabled") ||
    descriptor.includes("true")
  );
}

function readPaginationSignature(documentRef: Document): string {
  const activePage = documentRef.querySelector(
    'ul.pagination._pc_pagination li._page.active, ul.pagination li._page.active',
  );
  const rowIds = safeQuerySelectorAll(
    documentRef,
    [
      '.ag-body-viewport .ag-pinned-left-cols-container [role="row"].ag-row',
      '.ag-body-viewport .ag-pinned-left-cols-container [role="row"][row-id]',
      '.ag-root [ref="eLeftContainer"] [role="row"][row-id]',
      "table tbody tr",
    ].join(","),
  )
    .slice(0, 5)
    .map((row) => {
      return [
        row.getAttribute("row-id"),
        row.getAttribute("row-index"),
        normalizeWhitespace(row.textContent).slice(0, 80),
      ].filter(Boolean).join(":");
    })
    .join("|");

  return [
    activePage?.getAttribute("data-page"),
    normalizeWhitespace(activePage?.textContent),
    rowIds,
  ].join("::");
}

function safeQuerySelectorAll(root: ParentNode, selector: string): Element[] {
  try {
    return Array.from(root.querySelectorAll(selector));
  } catch {
    return [];
  }
}

function uniqueElements(elements: Element[]): Element[] {
  const seen = new Set<Element>();
  const unique: Element[] = [];

  for (const element of elements) {
    if (seen.has(element)) {
      continue;
    }

    seen.add(element);
    unique.push(element);
  }

  return unique;
}

function isVisibleElement(element: Element): boolean {
  const htmlElement = element as HTMLElement & {
    checkVisibility?: (options?: {
      checkOpacity?: boolean;
      checkVisibilityCSS?: boolean;
    }) => boolean;
  };

  if (typeof htmlElement.checkVisibility === "function") {
    return htmlElement.checkVisibility({
      checkOpacity: true,
      checkVisibilityCSS: true,
    });
  }

  if (htmlElement.hidden) {
    return false;
  }

  const style = window.getComputedStyle?.(htmlElement);
  if (
    style &&
    (style.display === "none" ||
      style.visibility === "hidden" ||
      style.opacity === "0")
  ) {
    return false;
  }

  return true;
}

function triggerClick(element: Element): void {
  if (element instanceof HTMLElement) {
    element.click();
    return;
  }

  element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
}

function normalizeWhitespace(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

async function waitUntil(
  windowRef: Window,
  predicate: () => boolean,
  timeoutMs: number,
  pollMs: number,
): Promise<boolean> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (predicate()) {
      return true;
    }

    await new Promise<void>((resolve) => {
      windowRef.setTimeout(resolve, pollMs);
    });
  }

  return predicate();
}
