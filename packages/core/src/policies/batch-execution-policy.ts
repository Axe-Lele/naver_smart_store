// File: packages/core/src/policies/batch-execution-policy.ts
import type { ChangePlanItem } from '../models/change-plan.js';
import {
  type BatchJobItemResult,
  isOperationalFailureStatus,
} from '../models/execution.js';
import type { ProductStatus } from '../models/product.js';
import type { RunPolicy } from '../value-objects/run-policy.js';

export type BatchContinuationReason =
  | 'CONTINUE'
  | 'STOP_REQUESTED'
  | 'CONSECUTIVE_FAILURE_LIMIT_REACHED';

export interface BatchContinuationDecision {
  shouldContinue: boolean;
  reason: BatchContinuationReason;
}

export function shouldAttemptConversion(status: ProductStatus): boolean {
  return status === 'EDITABLE_PREORDER';
}

export function isRetryableFailure(result: BatchJobItemResult): boolean {
  return (
    result.outputBucket === 'failed' &&
    (result.failureCategory === 'OPERATIONAL' ||
      result.failureCategory === 'SESSION' ||
      result.failureCategory === 'ACCESS' ||
      isOperationalFailureStatus(result.status))
  );
}

export function nextConsecutiveFailureCount(
  previousCount: number,
  result: BatchJobItemResult,
): number {
  if (isRetryableFailure(result)) {
    return previousCount + 1;
  }

  return 0;
}

export function evaluateBatchContinuation(input: {
  runPolicy: RunPolicy;
  stopRequested: boolean;
  consecutiveFailureCount: number;
}): BatchContinuationDecision {
  if (input.stopRequested) {
    return {
      shouldContinue: false,
      reason: 'STOP_REQUESTED',
    };
  }

  if (input.consecutiveFailureCount >= input.runPolicy.consecutiveFailureLimit) {
    return {
      shouldContinue: false,
      reason: 'CONSECUTIVE_FAILURE_LIMIT_REACHED',
    };
  }

  return {
    shouldContinue: true,
    reason: 'CONTINUE',
  };
}

export function filterPendingItems<T extends { productId: { toString(): string } }>(
  items: readonly T[],
  processedProductIds: ReadonlySet<string>,
): T[] {
  return items.filter((item) => !processedProductIds.has(item.productId.toString()));
}
