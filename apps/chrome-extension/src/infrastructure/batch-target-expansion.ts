// Path: C:\smart-store\apps\chrome-extension\src\infrastructure\batch-target-expansion.ts
import {
  ProductProcessingState,
  type BatchExecutionCheckpoint,
  type PersistedBatchTarget,
  type Product,
} from "../domain/index.js";

export const MAX_PAGINATION_ADVANCE_ATTEMPTS = 100;
export const ALL_PAGES_COMPLETED_MESSAGE =
  "모든 페이지를 확인했고 더 이상 변경할 상품이 없습니다. 다 바꿨습니다.";

const PAGINATION_STOP_PRODUCT_ID = "__pagination__";

export function buildKnownProductIds(checkpoint: BatchExecutionCheckpoint): Set<string> {
  return new Set([
    ...checkpoint.targets.map((target) => target.productId),
    ...checkpoint.results
      .filter((result) => result.state === ProductProcessingState.SUCCEEDED)
      .map((result) => result.productId),
  ]);
}

export function filterNewProducts(
  products: readonly Product[],
  knownProductIds: ReadonlySet<string>,
): Product[] {
  return products.filter((product) => {
    return !knownProductIds.has(product.id.toString());
  });
}

export function appendPaginationTargets(
  checkpoint: BatchExecutionCheckpoint,
  products: readonly Product[],
  serializeTarget: (product: Product) => PersistedBatchTarget,
  updatedAt: string,
): BatchExecutionCheckpoint {
  return {
    ...checkpoint,
    status: "running",
    stopRequested: false,
    updatedAt,
    targets: [
      ...checkpoint.targets,
      ...products.map((product) => serializeTarget(product)),
    ],
  };
}

export function completePaginationCheckpoint(
  checkpoint: BatchExecutionCheckpoint,
  updatedAt: string,
): BatchExecutionCheckpoint {
  return {
    ...checkpoint,
    status: "completed",
    stopRequested: false,
    updatedAt,
  };
}

export function stopPaginationCheckpoint(
  checkpoint: BatchExecutionCheckpoint,
  message: string,
  updatedAt: string,
): BatchExecutionCheckpoint {
  return {
    ...checkpoint,
    status: "stopped",
    stopRequested: true,
    updatedAt,
    results: mergeCheckpointResults(checkpoint.results, [
      {
        productId: PAGINATION_STOP_PRODUCT_ID,
        state: ProductProcessingState.STOPPED,
        message,
        retryable: true,
        planNotes: [],
        artifacts: [],
      },
    ]),
  };
}

function mergeCheckpointResults(
  previous: BatchExecutionCheckpoint["results"],
  next: BatchExecutionCheckpoint["results"],
): BatchExecutionCheckpoint["results"] {
  const map = new Map(previous.map((entry) => [entry.productId, entry]));
  for (const entry of next) {
    map.set(entry.productId, entry);
  }

  return [...map.values()];
}
