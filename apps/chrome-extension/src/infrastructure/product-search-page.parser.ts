// Path: C:\smart-store\apps\chrome-extension\src\infrastructure\product-search-page.parser.ts
import type {
  ProductSearchPageParserPort,
  ProductListPageDraft,
  SelectorKeyInspection,
  SelectorRegistryPort,
  SellerCenterPageGatewayPort,
} from "../application/index.js";
import { ProductId, type Product } from "../domain/index.js";
import { DomExplorer } from "./dom-explorer.js";
import { ElementLocator } from "./element-locator.js";
import { ProductListPaginationNavigator } from "./product-list-pagination.navigator.js";
import { WaitStrategy } from "./wait-strategy.js";

const BUNDLE_DELIVERY_TERMS = [
  "묶음배송",
  "묶음 배송",
  "배송비 묶음",
  "배송비묶음",
  "bundle delivery",
  "bundle-delivery",
  "bundle_delivery",
  "bundledelivery",
  "delivery bundle",
  "delivery-bundle",
  "delivery_bundle",
  "deliverybundle",
  "combine delivery",
  "combine-delivery",
  "combine_delivery",
  "combinedelivery",
  "combined delivery",
  "combined-delivery",
  "combined_delivery",
  "combineddelivery",
  "group delivery",
  "group-delivery",
  "group_delivery",
  "groupdelivery",
];

const DELIVERY_FEE_TERMS = ["배송비", "배송비결제", "delivery fee", "deliveryfee"];
const CURRENT_PAGE_FALLBACK_LIMIT = 20;
const EDIT_ACTION_READY_TIMEOUT_MS = 3_500;
const EDIT_ACTION_POLL_MS = 80;

const APPLIED_FILTER_SELECTORS = [
  "[class*='chip']",
  "[class*='Chip']",
  "[class*='tag']",
  "[class*='Tag']",
  "[class*='badge']",
  "[class*='Badge']",
  "[class*='condition']",
  "[class*='Condition']",
  "[class*='summary']",
  "[class*='Summary']",
  "[class*='applied']",
  "[class*='Applied']",
  "[role='listitem']",
  "[aria-label*='조건']",
  "[aria-label*='필터']",
];

const ROW_ACTION_TEXTS = new Set([
  "수정",
  "복사",
  "삭제",
  "보기",
  "상세",
  "관리",
  "선택",
  "해제",
  "미리보기",
]);

const ROW_STATUS_TEXTS = new Set([
  "대기",
  "판매중",
  "판매 중",
  "판매대기",
  "품절",
  "승인대기",
  "판매중지",
  "판매종료",
  "판매금지",
]);

export class ProductSearchPageParser implements ProductSearchPageParserPort {
  private readonly locator: ElementLocator;
  private readonly paginationNavigator: ProductListPaginationNavigator;
  private readonly waitStrategy: WaitStrategy;

  public constructor(
    private readonly gateway: SellerCenterPageGatewayPort,
    private readonly selectorRegistry: SelectorRegistryPort,
    private readonly explorer: DomExplorer,
    private readonly documentRef: Document = document,
    private readonly windowRef: Window = window,
  ) {
    this.locator = new ElementLocator(this.selectorRegistry, this.explorer);
    this.paginationNavigator = new ProductListPaginationNavigator(
      this.documentRef,
      this.windowRef,
    );
    this.waitStrategy = new WaitStrategy(this.windowRef, this.documentRef);
  }

  public async inspectCurrentPage(): Promise<ProductListPageDraft> {
    await this.waitStrategy.waitForReady({ timeoutMs: 8_000, retries: 1 });

    const keys = this.selectorRegistry.keysForPageType("product_search");
    const matchedSelectorKeys = keys.map<SelectorKeyInspection>((key) => {
      const candidateInspections = this.selectorRegistry
        .list(key)
        .map((candidate) => this.explorer.inspectCandidate(candidate));

      return {
        key,
        verificationStatus: "verification_required",
        candidateInspections,
        summary: summarize(key, candidateInspections),
      };
    });

    return {
      pageType: "product_search",
      verificationStatus: "verification_required",
      rowCandidateCount: this.resolveRowCandidates().length,
      matchedSelectorKeys,
      notes: [
        "Product search parser uses heuristics until selectors are live-verified.",
        `Current url=${this.gateway.getPageUrl()}`,
      ],
    };
  }

  public async collectBundleDeliveryTargets(): Promise<{
    products: Product[];
    verificationStatus: "verified" | "verification_required";
    note: string;
  }> {
    if (!this.gateway.isSellerCenterSurface()) {
      return {
        products: [],
        verificationStatus: "verification_required",
        note: "verification required | current tab is not the seller center surface.",
      };
    }

    await this.waitStrategy.waitForReady({ timeoutMs: 10_000, retries: 1 });

    const filterStatus = this.inspectBundleDeliveryFilter();
    if (!filterStatus.applied) {
      return {
        products: [],
        verificationStatus: "verification_required",
        note: filterStatus.note,
      };
    }

    const rows = this.resolveRowCandidates();
    const products: Product[] = [];
    const skippedNotes: string[] = [];

    rows.forEach((row, rowIndex) => {
      const parsed = this.parseRow(row);
      if (parsed) {
        products.push(parsed);
        return;
      }

      skippedNotes.push(`row[${rowIndex}] skipped because product id or edit url could not be resolved`);
    });

    const uniqueProducts = dedupeProducts(products);

    return {
      products: uniqueProducts,
      verificationStatus: filterStatus.verificationStatus,
      note: [
        filterStatus.note,
        `collected=${uniqueProducts.length}`,
        products.length > uniqueProducts.length
          ? `deduped=${products.length - uniqueProducts.length}`
          : undefined,
        ...skippedNotes.slice(0, 5),
      ].filter(Boolean).join(" | "),
    };
  }

  private inspectBundleDeliveryFilter(): {
    applied: boolean;
    verificationStatus: "verified" | "verification_required";
    note: string;
  } {
    const candidates = this.locator.resolveAll("search.bundleDeliveryFilter");
    const appliedSummary = this.findAppliedBundleDeliverySummary();
    if (appliedSummary) {
      return {
        applied: true,
        verificationStatus: "verified",
        note: `Bundle-delivery filter appears applied in ${appliedSummary}.`,
      };
    }

    const selectedControlSummary = this.findSelectedBundleDeliveryControl();
    if (selectedControlSummary) {
      return {
        applied: true,
        verificationStatus: "verified",
        note: `Bundle-delivery filter appears selected in ${selectedControlSummary}.`,
      };
    }

    const currentPageScope = this.inspectCurrentPageResultScope();
    if (currentPageScope.accepted) {
      return {
        applied: true,
        verificationStatus: "verified",
        note: currentPageScope.note,
      };
    }

    if (candidates.length === 0) {
      return {
        applied: false,
        verificationStatus: "verification_required",
        note: "Bundle-delivery filter could not be located. Please apply the filter manually and re-run.",
      };
    }

    const activeMatch = candidates.find((element) => isElementActive(element));
    if (!activeMatch) {
      return {
        applied: false,
        verificationStatus: "verification_required",
        note: "Bundle-delivery filter candidates were found, but none looked active. Please confirm 상세검색 > 묶음배송 is already applied.",
      };
    }

    return {
      applied: true,
      verificationStatus: "verified",
      note: "Bundle-delivery filter appears active via heuristic inspection.",
    };
  }

  private findAppliedBundleDeliverySummary(): string | null {
    const pageUrl = decodeURIComponentSafe(this.gateway.getPageUrl());
    if (containsBundleDeliveryTerm(pageUrl)) {
      return "current URL";
    }

    const unique = new Set<Element>();
    for (const selector of APPLIED_FILTER_SELECTORS) {
      for (const element of safeQuerySelectorAll(this.documentRef, selector)) {
        unique.add(element);
      }
    }

    for (const element of unique) {
      if (isAppliedBundleDeliveryElement(element)) {
        return describeElement(element);
      }
    }

    return null;
  }

  private findSelectedBundleDeliveryControl(): string | null {
    const controls = safeQuerySelectorAll(
      this.documentRef,
      [
        "input",
        "select",
        "option",
        "[role='option']",
        "[aria-selected='true']",
        "[aria-checked='true']",
        "[aria-pressed='true']",
        "[data-selected='true']",
        "[data-active='true']",
      ].join(","),
    );

    for (const control of controls) {
      if (isSelectedBundleDeliveryControl(control)) {
        return describeElement(control);
      }
    }

    return null;
  }

  private inspectCurrentPageResultScope(): {
    accepted: boolean;
    note: string;
  } {
    const rows = this.resolveRowCandidates();
    const displayedTotal = readDisplayedProductTotal(this.documentRef);

    if (rows.length === 0) {
      return {
        accepted: false,
        note: "No visible product rows were found.",
      };
    }

    if (!hasDeliveryFeeSearchControl(this.documentRef)) {
      return {
        accepted: false,
        note: "Delivery-fee search control was not visible.",
      };
    }

    if (
      displayedTotal === undefined ||
      displayedTotal <= 0 ||
      displayedTotal > CURRENT_PAGE_FALLBACK_LIMIT ||
      rows.length !== displayedTotal
    ) {
      return {
        accepted: false,
        note: [
          "Current-page fallback was not accepted.",
          displayedTotal !== undefined ? `displayedTotal=${displayedTotal}` : "displayedTotal=unknown",
          `visibleRows=${rows.length}`,
        ].join(" "),
      };
    }

    return {
      accepted: true,
      note: [
        "Bundle-delivery filter value was hidden by the seller-center UI.",
        "Proceeding with the visible current-page product list only.",
        `visibleRows=${rows.length}`,
      ].join(" "),
    };
  }

  private resolveRowCandidates(): Element[] {
    const scopedRows = findProductListScopedRows(this.documentRef);
    const fallbackRows =
      scopedRows.length > 0
        ? scopedRows
        : this.locator.resolveAll("search.resultRows");
    const unique = new Set<Element>(fallbackRows);

    return [...unique].filter(isVisibleProductRowCandidate);
  }

  private parseRow(row: Element): Product | null {
    const editUrl = this.resolveEditUrl(row);
    const productIdValue = this.resolveProductId(row, editUrl);
    if (!productIdValue) {
      return null;
    }

    const name = extractRowName(row);
    const channelProductNo = extractParam(editUrl, "channelProductNo");
    const originProductNo = extractParam(editUrl, "originProductNo");

    return {
      id: ProductId.create(productIdValue),
      name,
      channelProductNo: channelProductNo ?? undefined,
      originProductNo: originProductNo ?? undefined,
      editUrl: editUrl ?? undefined,
      rowTextPreview: normalizeWhitespace(row.textContent).slice(0, 160),
      sourceScope: "bundle-delivery-search-result",
      sourceVerification: "verified",
    };
  }

  public async openEditForProduct(productId: string): Promise<boolean> {
    if (this.clickEditForProduct(productId)) {
      return true;
    }

    const startedAt = Date.now();
    while (Date.now() - startedAt < EDIT_ACTION_READY_TIMEOUT_MS) {
      await delay(this.windowRef, EDIT_ACTION_POLL_MS);
      if (this.clickEditForProduct(productId)) {
        return true;
      }
    }

    return false;
  }

  public async moveToNextResultPage(): Promise<{ ok: boolean; note: string }> {
    return this.paginationNavigator.moveToNextResultPage();
  }

  private resolveEditUrl(row: Element): string | null {
    const explicitMatches = this.locator.resolveAll("search.editAction", row);
    for (const match of explicitMatches) {
      const href = resolveEditHrefFromAction(match);
      if (href) {
        return toAbsoluteUrl(href, this.windowRef.location.href);
      }
    }

    const genericLinks = Array.from(row.querySelectorAll("a[href]"));
    for (const link of genericLinks) {
      const href = readHref(link);
      if (!href || !isProductEditNavigationHref(href)) {
        continue;
      }

      return toAbsoluteUrl(href, this.windowRef.location.href);
    }

    return null;
  }

  private clickEditForProduct(productId: string): boolean {
    const row = this.resolveRowCandidates().find((candidate) => {
      return this.resolveProductId(candidate, this.resolveEditUrl(candidate)) === productId;
    });

    if (!row) {
      return false;
    }

    const editAction = this.resolveEditActionElement(row);
    if (!editAction) {
      return false;
    }

    triggerClick(editAction);
    return true;
  }

  private resolveEditActionElement(row: Element): Element | null {
    const agGridEditButton = findAgGridEditButton(row);
    if (agGridEditButton) {
      return agGridEditButton;
    }

    const explicitMatches = this.locator.resolveAll("search.editAction", row);
    for (const match of explicitMatches) {
      const action = resolveClickableEditAction(match);
      if (action) {
        return action;
      }
    }

    return Array.from(row.querySelectorAll("a, button, [role='button']")).find(
      (element) => isEditActionElement(element),
    ) ?? null;
  }

  private resolveProductId(row: Element, editUrl: string | null): string | null {
    const fromRow = extractRowProductId(row);
    if (fromRow) {
      return fromRow;
    }

    const fromUrl =
      extractParam(editUrl, "originProductNo") ??
      extractParam(editUrl, "channelProductNo") ??
      extractTrailingNumber(editUrl);

    if (fromUrl) {
      return fromUrl;
    }

    return extractNumericProductId(row.textContent);
  }
}

function summarize(
  key: string,
  candidateInspections: SelectorKeyInspection["candidateInspections"],
): string {
  const matches = candidateInspections
    .filter((inspection) => inspection.matchedCount > 0)
    .map((inspection) => `${inspection.candidate.strategy}:${inspection.matchedCount}`);

  return matches.length > 0
    ? `${key} => ${matches.join(", ")}`
    : `${key} => no candidate matches`;
}

function isElementActive(element: Element): boolean {
  if (element instanceof HTMLInputElement) {
    return element.checked && containsBundleDeliveryTerm(readInputText(element));
  }

  if (element instanceof HTMLSelectElement) {
    const selected = element.selectedOptions[0];
    return containsBundleDeliveryTerm(selected?.textContent ?? element.value);
  }

  const attributes = [
    element.getAttribute("aria-checked"),
    element.getAttribute("aria-selected"),
    element.getAttribute("aria-pressed"),
    element.getAttribute("data-selected"),
    element.getAttribute("data-active"),
    element.getAttribute("class"),
    element.textContent,
  ]
    .map((value) => normalizeWhitespace(value))
    .join(" ");

  const active =
    attributes.includes("true") ||
    attributes.includes("selected") ||
    attributes.includes("active");

  return active && containsBundleDeliveryTerm(attributes);
}

function isAppliedBundleDeliveryElement(element: Element): boolean {
  const text = normalizeWhitespace(element.textContent);
  const descriptor = normalizeWhitespace(
    [
      element.getAttribute("class"),
      element.getAttribute("role"),
      element.getAttribute("aria-label"),
      element.getAttribute("title"),
      element.getAttribute("data-testid"),
      element.getAttribute("data-test"),
    ].join(" "),
  );

  if (!containsBundleDeliveryTerm(`${descriptor} ${text}`)) {
    return false;
  }

  const hasAppliedShape =
    descriptor.includes("chip") ||
    descriptor.includes("tag") ||
    descriptor.includes("badge") ||
    descriptor.includes("condition") ||
    descriptor.includes("summary") ||
    descriptor.includes("applied") ||
    descriptor.includes("listitem");

  const hasAppliedText =
    text.includes("검색조건") ||
    text.includes("검색 조건") ||
    text.includes("적용") ||
    text.includes("선택됨") ||
    text.includes("필터");

  const hasRemoveAction = Array.from(
    element.querySelectorAll("button, [role='button'], a"),
  ).some((action) =>
    normalizeWhitespace(
      [
        action.textContent,
        action.getAttribute("aria-label"),
        action.getAttribute("title"),
      ].join(" "),
    ).includes("삭제"),
  );

  return hasAppliedShape || hasAppliedText || hasRemoveAction;
}

function containsBundleDeliveryTerm(value: string | null | undefined): boolean {
  const normalized = normalizeWhitespace(value).toLowerCase();
  const compact = compactSearchText(normalized);
  return BUNDLE_DELIVERY_TERMS.some((term) => {
    const normalizedTerm = normalizeWhitespace(term).toLowerCase();
    return (
      normalized.includes(normalizedTerm) ||
      compact.includes(compactSearchText(normalizedTerm))
    );
  });
}

function readInputText(element: HTMLInputElement): string {
  return [
    element.value,
    element.getAttribute("aria-label"),
    element.getAttribute("title"),
    ...Array.from(element.labels ?? []).map((label) => label.textContent ?? ""),
  ].join(" ");
}

function isSelectedBundleDeliveryControl(element: Element): boolean {
  if (element instanceof HTMLInputElement) {
    const type = element.type.toLowerCase();
    const descriptor = readControlDescriptor(element);

    if (type === "checkbox" || type === "radio") {
      return element.checked && containsBundleDeliveryTerm(descriptor);
    }

    return containsBundleDeliveryTerm(descriptor) && containsDeliveryFeeTerm(descriptor);
  }

  if (element instanceof HTMLSelectElement) {
    const selectedText = Array.from(element.selectedOptions)
      .map((option) => readControlDescriptor(option))
      .join(" ");
    const descriptor = `${readControlDescriptor(element)} ${selectedText}`;
    return containsBundleDeliveryTerm(descriptor);
  }

  if (element instanceof HTMLOptionElement) {
    return element.selected && containsBundleDeliveryTerm(readControlDescriptor(element));
  }

  const selected =
    element.getAttribute("aria-selected") === "true" ||
    element.getAttribute("aria-checked") === "true" ||
    element.getAttribute("aria-pressed") === "true" ||
    element.getAttribute("data-selected") === "true" ||
    element.getAttribute("data-active") === "true";

  return selected && containsBundleDeliveryTerm(readControlDescriptor(element));
}

function readControlDescriptor(element: Element): string {
  const htmlElement = element as HTMLElement;
  return [
    element.textContent,
    element.getAttribute("value"),
    element.getAttribute("name"),
    element.getAttribute("id"),
    element.getAttribute("class"),
    element.getAttribute("role"),
    element.getAttribute("aria-label"),
    element.getAttribute("title"),
    element.getAttribute("data-testid"),
    element.getAttribute("data-test"),
    ...Object.entries(htmlElement.dataset ?? {}).flatMap(([key, value]) => [key, value ?? ""]),
  ]
    .map((value) => normalizeWhitespace(value))
    .join(" ");
}

function hasDeliveryFeeSearchControl(documentRef: Document): boolean {
  const candidates = safeQuerySelectorAll(
    documentRef,
    "button, input, select, label, [role='button'], [role='combobox'], [aria-label], [title], div, span",
  );

  return candidates.some((element) => {
    if (!isVisibleElement(element)) {
      return false;
    }

    const text = readControlDescriptor(element);
    return containsDeliveryFeeTerm(text);
  });
}

function containsDeliveryFeeTerm(value: string | null | undefined): boolean {
  const normalized = normalizeWhitespace(value).toLowerCase();
  const compact = compactSearchText(normalized);
  return DELIVERY_FEE_TERMS.some((term) => {
    const normalizedTerm = normalizeWhitespace(term).toLowerCase();
    return (
      normalized.includes(normalizedTerm) ||
      compact.includes(compactSearchText(normalizedTerm))
    );
  });
}

function findProductListScopedRows(documentRef: Document): Element[] {
  const agGridRows = findAgGridProductRows(documentRef);
  if (agGridRows.length > 0) {
    return agGridRows;
  }

  const productListTables = safeQuerySelectorAll(documentRef, "table")
    .filter(isVisibleElement)
    .filter(isProductListTable);

  if (productListTables.length > 0) {
    const rows = productListTables.flatMap((table) =>
      safeQuerySelectorAll(table, "tbody tr, [role='row']"),
    );
    if (rows.length > 0) {
      return rows;
    }
  }

  const productListContainers = findProductListContainers(documentRef);
  if (productListContainers.length > 0) {
    return productListContainers.flatMap((container) =>
      safeQuerySelectorAll(container, "table tbody tr, [role='row']"),
    );
  }

  return [];
}

function findAgGridProductRows(documentRef: Document): Element[] {
  const rows = uniqueElements(
    [
      ".ag-body-viewport .ag-pinned-left-cols-container [role='row'].ag-row",
      ".ag-pinned-left-cols-container [role='row'][row-id]",
      ".ag-root [ref='eLeftContainer'] [role='row'][row-id]",
    ].flatMap((selector) => safeQuerySelectorAll(documentRef, selector)),
  );

  return rows.filter(isAgGridProductRow);
}

function isAgGridProductRow(row: Element): boolean {
  return Boolean(findAgGridEditButton(row) && extractAgGridProductId(row));
}

function isProductListTable(table: Element): boolean {
  const headerText = normalizeWhitespace(
    safeQuerySelectorAll(table, "thead, th, [role='columnheader']")
      .map((element) => element.textContent ?? "")
      .join(" "),
  );

  return (
    headerText.includes("상품번호") &&
    headerText.includes("상품명") &&
    (headerText.includes("수정") || headerText.includes("판매"))
  );
}

function findProductListContainers(documentRef: Document): Element[] {
  const markerPattern = /상품\s*목록\s*\(\s*총\s*[\d,]+\s*개\s*\)/;
  const markerElements = safeQuerySelectorAll(
    documentRef,
    "main, section, article, div, [role='region']",
  ).filter((element) =>
    markerPattern.test(normalizeWhitespace(element.textContent)),
  );
  const containers: Element[] = [];

  for (const marker of markerElements) {
    let current: Element | null = marker;

    for (let depth = 0; current && depth < 6; depth += 1) {
      if (
        isVisibleElement(current) &&
        current.querySelector("table, [role='row']") &&
        normalizeWhitespace(current.textContent).includes("상품번호") &&
        normalizeWhitespace(current.textContent).includes("상품명")
      ) {
        containers.push(current);
        break;
      }

      current = current.parentElement;
    }
  }

  return uniqueElements(containers);
}

function isVisibleProductRowCandidate(row: Element): boolean {
  if (!isVisibleElement(row)) {
    return false;
  }

  if (row.closest("thead, [aria-hidden='true'], [hidden]")) {
    return false;
  }

  if (!isRowLikeElement(row) || row.querySelector("tr, [role='row']")) {
    return false;
  }

  const text = normalizeWhitespace(row.textContent);
  if (!/\d{6,}/.test(text) && !extractTrailingNumber(readAnyHref(row))) {
    return false;
  }

  return hasEditAction(row) || hasProductEditHref(row);
}

function isRowLikeElement(element: Element): boolean {
  const tagName = element.tagName.toLowerCase();
  const role = element.getAttribute("role");

  return tagName === "tr" || role === "row";
}

function hasEditAction(row: Element): boolean {
  return Array.from(row.querySelectorAll("a, button, [role='button']")).some(
    (element) =>
      isEditActionElement(element) || isActionText(normalizeWhitespace(element.textContent)),
  );
}

function hasProductEditHref(row: Element): boolean {
  return Array.from(row.querySelectorAll("a[href]")).some((element) => {
    const href = readHref(element);
    if (!href) {
      return false;
    }

    return isProductEditNavigationHref(href);
  });
}

function readAnyHref(root: Element): string | null {
  const link = root.querySelector("a[href]");
  return link ? readHref(link) : null;
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

function dedupeProducts(products: Product[]): Product[] {
  const seen = new Set<string>();
  const unique: Product[] = [];

  for (const product of products) {
    const key = product.id.toString();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    unique.push(product);
  }

  return unique;
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

function readDisplayedProductTotal(documentRef: Document): number | undefined {
  const text = normalizeWhitespace(documentRef.body?.textContent);
  const match =
    text.match(/상품목록\s*\(\s*총\s*([\d,]+)\s*개\s*\)/) ??
    text.match(/상품\s*목록\s*총\s*([\d,]+)\s*개/);

  if (!match?.[1]) {
    return undefined;
  }

  const value = Number(match[1].replace(/,/g, ""));
  return Number.isInteger(value) && value >= 0 ? value : undefined;
}

function safeQuerySelectorAll(root: ParentNode, selector: string): Element[] {
  try {
    return Array.from(root.querySelectorAll(selector));
  } catch {
    return [];
  }
}

function decodeURIComponentSafe(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function describeElement(element: Element): string {
  const className = normalizeWhitespace(element.getAttribute("class"));
  const ariaLabel = normalizeWhitespace(element.getAttribute("aria-label"));
  const text = normalizeWhitespace(element.textContent).slice(0, 40);
  return [
    element.tagName.toLowerCase(),
    className ? `class=${className}` : "",
    ariaLabel ? `aria=${ariaLabel}` : "",
    text ? `text=${text}` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

function readHref(element: Element): string | null {
  if (element instanceof HTMLAnchorElement) {
    return element.href;
  }

  return element.getAttribute("href");
}

function extractRowProductId(row: Element): string | null {
  const agGridProductId = extractAgGridProductId(row);
  if (agGridProductId) {
    return agGridProductId;
  }

  const table = row.closest("table");
  if (table) {
    const productNumberIndex = findProductNumberColumnIndex(table);
    const cells = getRowCells(row);
    const productNumberCell =
      productNumberIndex !== undefined ? cells[productNumberIndex] : undefined;
    const fromColumn = extractNumericProductId(productNumberCell?.textContent);
    if (fromColumn) {
      return fromColumn;
    }
  }

  return extractNumericProductId(normalizeWhitespace(row.textContent));
}

function extractAgGridProductId(row: Element): string | null {
  const candidates = uniqueElements(
    [
      '[role="gridcell"][col-id="storefarmChannelProductNo"] a[data-nclicks-code="itg.numbersf"]',
      '[role="gridcell"][col-id="storefarmChannelProductNo"]',
      '[col-id="storefarmChannelProductNo"] a',
      '[col-id="storefarmChannelProductNo"]',
      'a[data-nclicks-code="itg.numbersf"]',
      '[col-id$="ChannelProductNo"] a',
      '[col-id$="ChannelProductNo"]',
    ].flatMap((selector) => safeQuerySelectorAll(row, selector)),
  );

  for (const candidate of candidates) {
    const fromText = extractNumericProductId(candidate.textContent);
    if (fromText) {
      return fromText;
    }

    const fromHref = extractTrailingNumber(readHref(candidate));
    if (fromHref) {
      return fromHref;
    }
  }

  return null;
}

function findProductNumberColumnIndex(table: Element): number | undefined {
  const headers = safeQuerySelectorAll(
    table,
    "thead th, thead td, [role='columnheader']",
  );

  const exactIndex = headers.findIndex((header) => {
    return normalizeWhitespace(header.textContent) === "상품번호";
  });
  if (exactIndex >= 0) {
    return exactIndex;
  }

  const includesIndex = headers.findIndex((header) => {
    const text = normalizeWhitespace(header.textContent);
    return text.includes("상품번호") && !text.includes("그룹상품번호");
  });

  return includesIndex >= 0 ? includesIndex : undefined;
}

function extractNumericProductId(value: string | null | undefined): string | null {
  const numericMatches =
    normalizeWhitespace(value)
      .match(/\d{6,}/g)
      ?.sort((left, right) => right.length - left.length) ?? [];

  return numericMatches[0] ?? null;
}

function resolveEditHrefFromAction(element: Element): string | null {
  const candidates = uniqueElements(
    [
      element,
      element.closest("a[href]"),
      ...safeQuerySelectorAll(element, "a[href]"),
    ].filter((candidate): candidate is Element => Boolean(candidate)),
  );

  for (const candidate of candidates) {
    if (!isEditActionElement(candidate)) {
      continue;
    }

    const href = readHref(candidate);
    if (href && isProductEditNavigationHref(href)) {
      return href;
    }

    for (const link of safeQuerySelectorAll(candidate, "a[href]")) {
      const nestedHref = readHref(link);
      if (nestedHref && isProductEditNavigationHref(nestedHref)) {
        return nestedHref;
      }
    }
  }

  return null;
}

function resolveClickableEditAction(element: Element): Element | null {
  const candidates = uniqueElements(
    [
      element,
      element.closest("a[href], button, [role='button']"),
      ...safeQuerySelectorAll(element, "a[href], button, [role='button']"),
    ].filter((candidate): candidate is Element => Boolean(candidate)),
  );

  return candidates.find((candidate) => isEditActionElement(candidate)) ?? null;
}

function findAgGridEditButton(row: Element): Element | null {
  const candidates = uniqueElements(
    [
      '[role="gridcell"][col-id="edit"] button[data-nclicks-code="itg.edit"]',
      'button[data-nclicks-code="itg.edit"]',
      '[role="gridcell"][col-id="edit"] button',
      '[col-id="edit"] button',
    ].flatMap((selector) => safeQuerySelectorAll(row, selector)),
  );

  return candidates.find((candidate) => {
    return isVisibleElement(candidate) && isEditActionElement(candidate);
  }) ?? null;
}

function isEditActionElement(element: Element): boolean {
  const htmlElement = element as HTMLElement;
  const descriptor = normalizeWhitespace(
    [
      element.textContent,
      element.getAttribute("aria-label"),
      element.getAttribute("title"),
      element.getAttribute("name"),
      element.getAttribute("id"),
      element.getAttribute("class"),
      ...Object.entries(htmlElement.dataset ?? {}).flatMap(([key, value]) => [key, value ?? ""]),
    ].join(" "),
  ).toLowerCase();

  if (
    descriptor.includes("상세") ||
    descriptor.includes("보기") ||
    descriptor.includes("복사") ||
    descriptor.includes("detail") ||
    descriptor.includes("view") ||
    descriptor.includes("copy")
  ) {
    return false;
  }

  return (
    descriptor.includes("수정") ||
    descriptor.includes("edit") ||
    descriptor.includes("modify")
  );
}

function isProductEditNavigationHref(href: string): boolean {
  const normalized = decodeURIComponentSafe(href).toLowerCase();

  if (
    normalized.startsWith("javascript:") ||
    normalized.includes("detail") ||
    normalized.includes("view") ||
    normalized.includes("preview")
  ) {
    return false;
  }

  return (
    normalized.includes("/edit") ||
    normalized.includes("edit?") ||
    normalized.includes("edit/") ||
    normalized.includes("origin-edit") ||
    normalized.includes("product-edit") ||
    normalized.includes("modify")
  );
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

function extractParam(url: string | null, key: string): string | null {
  if (!url) {
    return null;
  }

  try {
    const parsed = new URL(url, window.location.href);
    return parsed.searchParams.get(key);
  } catch {
    return null;
  }
}

function extractTrailingNumber(url: string | null): string | null {
  if (!url) {
    return null;
  }

  const matches = url.match(/\d{6,}/g);
  return matches?.at(-1) ?? null;
}

function extractRowName(row: Element): string | undefined {
  const productNameColumnText = extractProductNameColumnText(row);
  if (productNameColumnText) {
    return productNameColumnText.slice(0, 120);
  }

  const actionCells = findActionCells(row);
  const cells = Array.from(
    row.querySelectorAll("td, th, [role='cell'], [role='gridcell']"),
  ).filter((cell) => !actionCells.has(cell));
  const roots = cells.length > 0 ? cells : [row];

  const candidates = roots
    .flatMap((root) => collectNameCandidates(root, row))
    .sort((left, right) => right.score - left.score);

  return candidates[0]?.text.slice(0, 120);
}

function extractProductNameColumnText(row: Element): string | undefined {
  const agGridProductName = extractAgGridProductName(row);
  if (agGridProductName) {
    return agGridProductName;
  }

  const table = row.closest("table");
  if (!table) {
    return undefined;
  }

  const productNameIndex = findProductNameColumnIndex(table);
  if (productNameIndex === undefined) {
    return undefined;
  }

  const cells = getRowCells(row);
  const productNameCell = cells[productNameIndex];
  if (!productNameCell) {
    return undefined;
  }

  const candidates = collectNameCandidates(productNameCell, row)
    .sort((left, right) => right.score - left.score);

  return candidates[0]?.text;
}

function extractAgGridProductName(row: Element): string | undefined {
  const candidates = uniqueElements(
    [
      '[role="gridcell"][col-id="productName"]',
      '[col-id="productName"]',
    ].flatMap((selector) => safeQuerySelectorAll(row, selector)),
  )
    .flatMap((cell) => collectNameCandidates(cell, row))
    .sort((left, right) => right.score - left.score);

  return candidates[0]?.text;
}

function findProductNameColumnIndex(table: Element): number | undefined {
  const headers = safeQuerySelectorAll(
    table,
    "thead th, thead td, [role='columnheader']",
  );

  const exactIndex = headers.findIndex((header) => {
    return normalizeWhitespace(header.textContent) === "상품명";
  });
  if (exactIndex >= 0) {
    return exactIndex;
  }

  const includesIndex = headers.findIndex((header) => {
    const text = normalizeWhitespace(header.textContent);
    return text.includes("상품명") && !text.includes("전용상품명");
  });

  return includesIndex >= 0 ? includesIndex : undefined;
}

function getRowCells(row: Element): Element[] {
  const directCells = Array.from(row.children).filter(isCellElement);
  if (directCells.length > 0) {
    return directCells;
  }

  return safeQuerySelectorAll(row, "td, th, [role='cell'], [role='gridcell']");
}

function isCellElement(element: Element): boolean {
  const tagName = element.tagName.toLowerCase();
  const role = element.getAttribute("role");

  return (
    tagName === "td" ||
    tagName === "th" ||
    role === "cell" ||
    role === "gridcell"
  );
}

function normalizeWhitespace(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function compactSearchText(value: string): string {
  return value.replace(/[\s_-]+/g, "");
}

function findActionCells(row: Element): Set<Element> {
  const cells = new Set<Element>();
  const actions = Array.from(row.querySelectorAll("a, button, [role='button']"));

  for (const action of actions) {
    if (!isActionText(normalizeWhitespace(action.textContent))) {
      continue;
    }

    const cell = action.closest("td, th, [role='cell'], [role='gridcell']");
    if (cell) {
      cells.add(cell);
    }
  }

  return cells;
}

function collectNameCandidates(
  root: Element,
  row: Element,
): Array<{ text: string; score: number }> {
  const elements = [
    root,
    ...Array.from(root.querySelectorAll("a, strong, span, p, div")),
  ];
  const seen = new Set<string>();
  const candidates: Array<{ text: string; score: number }> = [];

  for (const element of elements) {
    if (isControlElement(element)) {
      continue;
    }

    const text = normalizeWhitespace(element.textContent);
    if (seen.has(text) || !isLikelyProductName(text)) {
      continue;
    }

    seen.add(text);
    candidates.push({
      text,
      score: scoreNameCandidate(text, element, row),
    });
  }

  return candidates;
}

function isControlElement(element: Element): boolean {
  return Boolean(
    element.closest("button, [role='button'], input, select, textarea"),
  );
}

function isLikelyProductName(text: string): boolean {
  if (text.length < 2 || text.length > 160) {
    return false;
  }

  if (isActionText(text) || ROW_STATUS_TEXTS.has(text)) {
    return false;
  }

  if (/^\d+$/.test(text) || /^[\d\s,._:-]+$/.test(text)) {
    return false;
  }

  if (/^\d{4}[./-]\d{1,2}[./-]\d{1,2}/.test(text)) {
    return false;
  }

  return /[가-힣a-zA-Z]/.test(text);
}

function isActionText(text: string): boolean {
  return ROW_ACTION_TEXTS.has(text);
}

function scoreNameCandidate(text: string, element: Element, row: Element): number {
  let score = Math.min(text.length, 80);
  const tagName = element.tagName.toLowerCase();

  if (/[가-힣]/.test(text)) {
    score += 30;
  }

  if (tagName === "a" || tagName === "strong") {
    score += 20;
  }

  if (tagName === "td" || tagName === "th") {
    score -= 10;
  }

  if (/\d{6,}/.test(text)) {
    score -= 40;
  }

  const rowText = normalizeWhitespace(row.textContent);
  if (rowText.startsWith(text)) {
    score -= 10;
  }

  return score;
}

function toAbsoluteUrl(value: string, baseUrl: string): string {
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return value;
  }
}
