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
  // 현재 배치의 생명주기 상태입니다. running일 때만 다음 상품으로 이어갑니다.
  status: "idle" | "running" | "stopped" | "completed";
  // 실제 저장을 수행하는 실행인지, 대상만 확인하는 사전 점검인지 구분합니다.
  mode: "dry-run" | "execute";
  // 배치를 시작한 상품관리 목록 URL입니다. 실패 복구 때 이 URL로 돌아갑니다.
  searchPageUrl: string;
  // 배치가 처음 만들어진 시각입니다.
  startedAt: string;
  // checkpoint가 마지막으로 저장된 시각입니다.
  updatedAt: string;
  // targets 배열에서 지금 처리해야 할 상품 위치입니다.
  currentIndex: number;
  // 사용자가 중지를 누르거나 안전 제한에 걸렸을 때 true가 됩니다.
  stopRequested: boolean;
  // 상품 하나를 처리한 뒤 다음 이동 전에 쉬는 시간입니다.
  delayMs: number;
  // 이전 checkpoint의 성공 결과를 건너뛰고 이어서 실행할지 여부입니다.
  skipSucceeded: boolean;
  // 연속 실패 횟수입니다. 성공 상품이 나오면 0으로 초기화됩니다.
  consecutiveFailureCount: number;
  // 이 횟수 이상 연속 실패하면 무한 복구를 막기 위해 배치를 멈춥니다.
  stopOnConsecutiveFailures: number;
  // 예약구매 설정 시 반드시 확인해야 하는 옵션 문구입니다.
  requiredOptions?: RequiredOption[];
  // 운영자가 일부 상품만 선택해 시작한 경우 그 상품 ID만 유지합니다.
  selectedProductIds?: string[];
  // 수정/저장 흐름이 실패했을 때 true로 두고, 다음 resume에서 상품목록부터 다시 시작합니다.
  refreshTargetsOnList?: boolean;
  // 상품목록에서 수집한 처리 대상입니다. 복구 시 이미 처리한 대상은 유지하고 나머지를 다시 붙입니다.
  targets: PersistedBatchTarget[];
  // 상품별 처리 결과입니다. 성공/실패 기록은 재수집 때 중복 처리 방지 기준으로도 씁니다.
  results: PersistedProcessingResult[];
}
