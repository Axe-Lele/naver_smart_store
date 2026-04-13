export const PRODUCT_STATUSES = [
  'NOT_FOUND',
  'NOT_PREORDER',
  'EDITABLE_PREORDER',
  'LOCKED_BY_ORDER_PERIOD',
  'UI_CHANGED',
  'UNKNOWN_ERROR',
] as const;

export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

export type ActionResult =
  | 'CONVERTED'
  | 'DRY_RUN'
  | 'SKIPPED'
  | 'FAILED';

export type ResultBucket = 'success' | 'locked' | 'failed';

export type VerificationMethod =
  | 'NOT_ATTEMPTED'
  | 'DRY_RUN'
  | 'TOAST'
  | 'BANNER'
  | 'REQUERY'
  | 'TOAST_AND_REQUERY'
  | 'BANNER_AND_REQUERY';

export interface ProductTask {
  productNo: string;
  rowNumber: number;
}

export interface ClassificationSignals {
  pageReady: boolean;
  editPageIdentityVisible: boolean;
  notFoundMessageVisible: boolean;
  preorderSectionVisible: boolean;
  preorderSelected: boolean;
  normalSelected: boolean;
  normalOptionVisible: boolean;
  normalOptionDisabled: boolean;
  preorderFieldDisabled: boolean;
  orderPeriodLockMessageVisible: boolean;
  lockBannerVisible: boolean;
  saveButtonVisible: boolean;
  unexpectedLayoutDetected: boolean;
}

export interface ClassificationDecision {
  status: ProductStatus;
  reason: string;
  signals: ClassificationSignals;
}

export interface ArtifactPaths {
  screenshotPath?: string;
  htmlPath?: string;
}

export interface ProductProcessResult {
  productNo: string;
  rowNumber: number;
  status: ProductStatus;
  actionResult: ActionResult;
  verificationMethod: VerificationMethod;
  outputBucket: ResultBucket;
  reason: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  workerId: number;
  dryRun: boolean;
  artifactPaths?: ArtifactPaths;
  errorMessage?: string;
}

export interface InputReadResult {
  tasks: ProductTask[];
  totalRows: number;
  invalidRowCount: number;
  duplicateCount: number;
}

export interface RunSummary {
  runId: string;
  mode: 'poc' | 'full';
  inputFile: string;
  outputDir: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  dryRun: boolean;
  requestedMaxItems?: number;
  actualProcessedItems: number;
  skippedByResume: number;
  invalidRowCount: number;
  duplicateCount: number;
  stoppedEarly: boolean;
  stopReason?: string;
  concurrency: number;
  delayMs: number;
  counts: Record<ProductStatus, number>;
  convertedCount: number;
  dryRunEligibleCount: number;
  lockedCount: number;
  failedCount: number;
  successCount: number;
}

export function createEmptyStatusCounts(): Record<ProductStatus, number> {
  return PRODUCT_STATUSES.reduce<Record<ProductStatus, number>>((acc, status) => {
    acc[status] = 0;
    return acc;
  }, {} as Record<ProductStatus, number>);
}

export function toResultBucket(
  status: ProductStatus,
  actionResult: ActionResult,
): ResultBucket {
  if (
    status === 'EDITABLE_PREORDER' &&
    (actionResult === 'CONVERTED' || actionResult === 'DRY_RUN')
  ) {
    return 'success';
  }

  if (status === 'LOCKED_BY_ORDER_PERIOD') {
    return 'locked';
  }

  return 'failed';
}

export function isOperationalFailure(status: ProductStatus): boolean {
  return status === 'UI_CHANGED' || status === 'UNKNOWN_ERROR';
}
