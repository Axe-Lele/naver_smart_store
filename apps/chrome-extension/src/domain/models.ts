// Path: C:\smart-store\apps\chrome-extension\src\domain\models.ts
import { ProductId } from "./product-id.js";
import { ProductProcessingState } from "./product-processing-state.js";

export type VerificationStatus = "verified" | "verification_required";

export interface Product {
  id: ProductId;
  name?: string;
  channelProductNo?: string;
  originProductNo?: string;
  editUrl?: string;
  rowTextPreview?: string;
  sourceScope: "bundle-delivery-search-result";
  sourceVerification: VerificationStatus;
}

export interface ResolvedUiDate {
  strategy: "ui-max";
  value?: string;
  verificationStatus: VerificationStatus;
  note: string;
}

export interface RequiredOption {
  name: string;
  value: string;
}

export const DEFAULT_REQUIRED_OPTIONS: readonly RequiredOption[] = [
  {
    name: "해외 유통구조상 예약캔슬 불가",
    value: "동의합니다.",
  },
];

export interface PreorderChangePlan {
  productId: ProductId;
  dryRun: boolean;
  targetScope: "bundle-delivery-search-result";
  requestedChanges: {
    productType: "PREORDER";
    orderPeriodEnd: string;
    postPreorderSaleStatus: "ON_SALE";
    dispatchCompletionDueDate: string;
    requiredOption: {
      enabled: true;
      type: "SINGLE";
      name: string;
      value: string;
    };
    requiredOptions?: RequiredOption[];
  };
  notes: string[];
}

export interface FailureArtifact {
  kind: "screenshot" | "html" | "log";
  path?: string;
  note: string;
}

export interface ProcessingResult {
  productId: ProductId;
  state: ProductProcessingState;
  message: string;
  retryable: boolean;
  plan?: PreorderChangePlan;
  artifacts: FailureArtifact[];
}

export interface PersistedProcessingResult {
  productId: string;
  state: ProductProcessingState;
  message: string;
  retryable: boolean;
  planNotes: string[];
  artifacts: FailureArtifact[];
}

export interface PersistedBatchTarget {
  productId: string;
  name?: string;
  channelProductNo?: string;
  originProductNo?: string;
  editUrl?: string;
  rowTextPreview?: string;
  sourceScope: "bundle-delivery-search-result";
  sourceVerification: VerificationStatus;
}

export interface BatchExecutionCheckpoint {
  status: "idle" | "running" | "stopped" | "completed";
  mode: "dry-run" | "execute";
  searchPageUrl: string;
  startedAt: string;
  updatedAt: string;
  currentIndex: number;
  stopRequested: boolean;
  delayMs: number;
  skipSucceeded: boolean;
  consecutiveFailureCount: number;
  stopOnConsecutiveFailures: number;
  requiredOptions?: RequiredOption[];
  targets: PersistedBatchTarget[];
  results: PersistedProcessingResult[];
}
