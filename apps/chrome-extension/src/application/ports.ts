// Path: C:\smart-store\apps\chrome-extension\src\application\ports.ts
import type {
  PreorderChangePlan,
  ProcessingResult,
  Product,
  RunPolicy,
  VerificationStatus,
} from "../domain/index.js";

export type SelectorKey =
  | "search.bundleDeliveryFilter"
  | "search.searchButton"
  | "search.resultRows"
  | "search.editAction"
  | "editor.preorderSection"
  | "editor.preorderProductOption"
  | "editor.normalProductOption"
  | "editor.orderPeriodControl"
  | "editor.postPreorderStatusControl"
  | "editor.dispatchCompletionDateControl"
  | "editor.optionSection"
  | "editor.optionEnabledControl"
  | "editor.optionTypeControl"
  | "editor.optionNameControl"
  | "editor.optionValueControl"
  | "editor.saveButton"
  | "editor.successFeedback";

export interface SelectorCandidate {
  key: SelectorKey;
  strategy: "css" | "text" | "aria" | "data" | "name" | "todo";
  value: string;
  priority: number;
  fallback: boolean;
  verificationStatus: VerificationStatus;
  note: string;
}

export type SellerCenterPageType =
  | "non_seller_center"
  | "product_search"
  | "product_edit"
  | "other_seller_center"
  | "unknown";

export interface PageTypeDetection {
  pageType: SellerCenterPageType;
  verificationStatus: VerificationStatus;
  note: string;
  evidence: string[];
}

export interface SelectorMatchSample {
  tagName: string;
  role?: string;
  id?: string;
  name?: string;
  ariaLabel?: string;
  dataAttributes: string[];
  textSnippet?: string;
  domPath: string;
}

export interface SelectorCandidateInspection {
  candidate: SelectorCandidate;
  matchedCount: number;
  samples: SelectorMatchSample[];
}

export interface SelectorKeyInspection {
  key: SelectorKey;
  verificationStatus: VerificationStatus;
  candidateInspections: SelectorCandidateInspection[];
  summary: string;
}

export interface SelectorInspectionReport {
  pageType: SellerCenterPageType;
  pageTitle: string;
  pageUrl: string;
  generatedAt: string;
  verificationStatus: VerificationStatus;
  keyInspections: SelectorKeyInspection[];
  summary: string[];
}

export interface ProductListPageDraft {
  pageType: SellerCenterPageType;
  verificationStatus: VerificationStatus;
  rowCandidateCount: number;
  matchedSelectorKeys: SelectorKeyInspection[];
  notes: string[];
}

export interface ProductEditPageDraft {
  pageType: SellerCenterPageType;
  verificationStatus: VerificationStatus;
  matchedSelectorKeys: SelectorKeyInspection[];
  notes: string[];
}

export interface LoggerPort {
  debug(message: string, metadata?: Record<string, unknown>): void;
  info(message: string, metadata?: Record<string, unknown>): void;
  warn(message: string, metadata?: Record<string, unknown>): void;
  error(message: string, metadata?: Record<string, unknown>): void;
}

export interface ProgressLogEntry {
  timestamp: string;
  level: "info" | "warn" | "error";
  message: string;
}

export interface ProgressSnapshot {
  phase:
    | "idle"
    | "checking"
    | "inspecting"
    | "collecting"
    | "dry-run"
    | "executing"
    | "stopped"
    | "verification-required";
  updatedAt: string;
  targetCount: number;
  completedCount: number;
  results: Array<{
    productId: string;
    state: string;
    message: string;
  }>;
  logs: ProgressLogEntry[];
}

export interface ProgressStorePort {
  load(): Promise<ProgressSnapshot>;
  save(snapshot: ProgressSnapshot): Promise<void>;
  appendLog(entry: ProgressLogEntry): Promise<void>;
  reset(): Promise<void>;
}

export interface SelectorRegistryPort {
  list(key: SelectorKey): SelectorCandidate[];
  keysForPageType(pageType: SellerCenterPageType): SelectorKey[];
}

export interface DateResolverPort {
  resolveMaximumAllowedDate(input: {
    control:
      | "editor.orderPeriodControl"
      | "editor.dispatchCompletionDateControl";
    policy: RunPolicy;
  }): Promise<{
    strategy: "ui-max";
    value?: string;
    verificationStatus: VerificationStatus;
    note: string;
  }>;
}

export interface SellerCenterPageGatewayPort {
  getPageTitle(): string;
  getPageUrl(): string;
  isSellerCenterSurface(): boolean;
  captureHtmlSnapshot(): string;
  getBodyText(): string;
}

export interface CurrentPageTypeDetectorPort {
  detect(): Promise<PageTypeDetection>;
}

export interface ProductSearchPageParserPort {
  inspectCurrentPage(): Promise<ProductListPageDraft>;
  collectBundleDeliveryTargets(options?: {
    pagination?: "current-page" | "all-pages";
  }): Promise<{
    products: Product[];
    verificationStatus: VerificationStatus;
    note: string;
  }>;
}

export interface ProductEditPageParserPort {
  inspectCurrentPage(): Promise<ProductEditPageDraft>;
}

export interface ProductEditPageDriverPort {
  preparePreorderChangePlan(
    product: Product,
    policy: RunPolicy,
  ): Promise<PreorderChangePlan | ProcessingResult>;
  applyPreorderChangePlan(plan: PreorderChangePlan): Promise<ProcessingResult>;
}
