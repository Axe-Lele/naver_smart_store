// File: packages/core/src/models/execution.ts
import { z } from 'zod';

import { BatchJobId, batchJobIdPrimitiveSchema } from '../value-objects/batch-job-id.js';
import { ProductId, productIdPrimitiveSchema } from '../value-objects/product-id.js';
import { productStatusSchema, type ProductStatus } from './product.js';

export const batchJobStatusSchema = z.enum([
  'READY',
  'RUNNING',
  'STOP_REQUESTED',
  'STOPPED',
  'COMPLETED',
  'FAILED',
]);
export type BatchJobStatus = z.infer<typeof batchJobStatusSchema>;

export const actionResultSchema = z.enum([
  'PENDING',
  'DRY_RUN',
  'CONVERTED',
  'SKIPPED',
  'FAILED',
]);
export type ActionResult = z.infer<typeof actionResultSchema>;

export const verificationMethodSchema = z.enum([
  'NOT_ATTEMPTED',
  'DRY_RUN',
  'TOAST',
  'BANNER',
  'REQUERY',
  'TOAST_AND_REQUERY',
  'BANNER_AND_REQUERY',
]);
export type VerificationMethod = z.infer<typeof verificationMethodSchema>;

export const resultBucketSchema = z.enum(['success', 'locked', 'failed']);
export type ResultBucket = z.infer<typeof resultBucketSchema>;

export const failureCategorySchema = z.enum([
  'BUSINESS',
  'OPERATIONAL',
  'SESSION',
  'ACCESS',
]);
export type FailureCategory = z.infer<typeof failureCategorySchema>;

export const failureArtifactSchema = z.object({
  screenshotPath: z.string().trim().min(1).optional(),
  htmlPath: z.string().trim().min(1).optional(),
  capturedAt: z.string().datetime().optional(),
});
export type FailureArtifactSnapshot = z.output<typeof failureArtifactSchema>;

export class FailureArtifact {
  private constructor(private readonly snapshot: FailureArtifactSnapshot) {}

  static create(input: z.input<typeof failureArtifactSchema>): FailureArtifact {
    return new FailureArtifact(failureArtifactSchema.parse(input));
  }

  toSnapshot(): FailureArtifactSnapshot {
    return {
      ...this.snapshot,
    };
  }
}

export const batchJobItemResultSchema = z.object({
  productId: productIdPrimitiveSchema,
  status: productStatusSchema,
  actionResult: actionResultSchema,
  verificationMethod: verificationMethodSchema.default('NOT_ATTEMPTED'),
  reason: z.string().trim().min(1),
  outputBucket: resultBucketSchema.optional(),
  failureCategory: failureCategorySchema.optional(),
  errorMessage: z.string().trim().min(1).optional(),
  startedAt: z.string().datetime(),
  finishedAt: z.string().datetime(),
  durationMs: z.number().int().min(0),
  attemptNumber: z.number().int().min(1).default(1),
  artifact: failureArtifactSchema.optional(),
});

export type BatchJobItemResultInput = z.input<typeof batchJobItemResultSchema>;
export type BatchJobItemResultSnapshot = z.output<typeof batchJobItemResultSchema>;

export class BatchJobItemResult {
  private constructor(private readonly snapshot: BatchJobItemResultSnapshot) {}

  static create(input: BatchJobItemResultInput): BatchJobItemResult {
    const parsed = batchJobItemResultSchema.parse(input);

    return new BatchJobItemResult({
      ...parsed,
      outputBucket:
        parsed.outputBucket ?? deriveResultBucket(parsed.status, parsed.actionResult),
    });
  }

  get productId(): ProductId {
    return ProductId.create(this.snapshot.productId);
  }

  get status(): ProductStatus {
    return this.snapshot.status;
  }

  get actionResult(): ActionResult {
    return this.snapshot.actionResult;
  }

  get outputBucket(): ResultBucket {
    return this.snapshot.outputBucket!;
  }

  get failureCategory(): FailureCategory | undefined {
    return this.snapshot.failureCategory;
  }

  get reason(): string {
    return this.snapshot.reason;
  }

  get finishedAt(): string {
    return this.snapshot.finishedAt;
  }

  toSnapshot(): BatchJobItemResultSnapshot {
    return {
      ...this.snapshot,
      artifact: this.snapshot.artifact ? { ...this.snapshot.artifact } : undefined,
    };
  }
}

export const changeExecutionSnapshotSchema = z.object({
  jobId: batchJobIdPrimitiveSchema,
  status: batchJobStatusSchema.default('READY'),
  startedAt: z.string().datetime().optional(),
  finishedAt: z.string().datetime().optional(),
  stopRequested: z.boolean().default(false),
  stopReason: z.string().trim().min(1).optional(),
  processedCount: z.number().int().min(0).default(0),
  successCount: z.number().int().min(0).default(0),
  lockedCount: z.number().int().min(0).default(0),
  failedCount: z.number().int().min(0).default(0),
});

export type ChangeExecutionInput = z.input<typeof changeExecutionSnapshotSchema>;
export type ChangeExecutionSnapshot = z.output<typeof changeExecutionSnapshotSchema>;

export class ChangeExecution {
  private constructor(private readonly snapshot: ChangeExecutionSnapshot) {}

  static create(input: ChangeExecutionInput): ChangeExecution {
    return new ChangeExecution(changeExecutionSnapshotSchema.parse(input));
  }

  static createNew(jobId: BatchJobId, startedAt?: string): ChangeExecution {
    return ChangeExecution.create({
      jobId: jobId.toString(),
      status: startedAt ? 'RUNNING' : 'READY',
      startedAt,
      stopRequested: false,
    });
  }

  get jobId(): BatchJobId {
    return BatchJobId.create(this.snapshot.jobId);
  }

  get status(): BatchJobStatus {
    return this.snapshot.status;
  }

  get stopRequested(): boolean {
    return this.snapshot.stopRequested;
  }

  markRunning(startedAt = new Date().toISOString()): ChangeExecution {
    return new ChangeExecution({
      ...this.snapshot,
      status: 'RUNNING',
      startedAt,
    });
  }

  requestStop(reason?: string): ChangeExecution {
    return new ChangeExecution({
      ...this.snapshot,
      status: this.snapshot.status === 'RUNNING' ? 'STOP_REQUESTED' : this.snapshot.status,
      stopRequested: true,
      stopReason: reason,
    });
  }

  applyResult(result: BatchJobItemResult): ChangeExecution {
    const item = result.toSnapshot();

    return new ChangeExecution({
      ...this.snapshot,
      processedCount: this.snapshot.processedCount + 1,
      successCount:
        this.snapshot.successCount + (item.outputBucket === 'success' ? 1 : 0),
      lockedCount:
        this.snapshot.lockedCount + (item.outputBucket === 'locked' ? 1 : 0),
      failedCount:
        this.snapshot.failedCount + (item.outputBucket === 'failed' ? 1 : 0),
    });
  }

  markStopped(finishedAt = new Date().toISOString(), reason?: string): ChangeExecution {
    return new ChangeExecution({
      ...this.snapshot,
      status: 'STOPPED',
      finishedAt,
      stopRequested: true,
      stopReason: reason ?? this.snapshot.stopReason,
    });
  }

  markCompleted(finishedAt = new Date().toISOString()): ChangeExecution {
    return new ChangeExecution({
      ...this.snapshot,
      status: 'COMPLETED',
      finishedAt,
    });
  }

  markFailed(finishedAt = new Date().toISOString(), reason?: string): ChangeExecution {
    return new ChangeExecution({
      ...this.snapshot,
      status: 'FAILED',
      finishedAt,
      stopReason: reason ?? this.snapshot.stopReason,
    });
  }

  toSnapshot(): ChangeExecutionSnapshot {
    return {
      ...this.snapshot,
    };
  }
}

const checkpointProcessedEntrySchema = z.object({
  status: productStatusSchema,
  actionResult: actionResultSchema,
  finishedAt: z.string().datetime(),
});

export const executionCheckpointSnapshotSchema = z.object({
  jobId: batchJobIdPrimitiveSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  stopRequested: z.boolean().default(false),
  stopReason: z.string().trim().min(1).optional(),
  processed: z.record(z.string(), checkpointProcessedEntrySchema).default({}),
});

export type ExecutionCheckpointInput = z.input<typeof executionCheckpointSnapshotSchema>;
export type ExecutionCheckpointSnapshot = z.output<typeof executionCheckpointSnapshotSchema>;

export class ExecutionCheckpoint {
  private constructor(private readonly snapshot: ExecutionCheckpointSnapshot) {}

  static create(input: ExecutionCheckpointInput): ExecutionCheckpoint {
    return new ExecutionCheckpoint(executionCheckpointSnapshotSchema.parse(input));
  }

  static createNew(jobId: BatchJobId, createdAt = new Date().toISOString()): ExecutionCheckpoint {
    return ExecutionCheckpoint.create({
      jobId: jobId.toString(),
      createdAt,
      updatedAt: createdAt,
      stopRequested: false,
      processed: {},
    });
  }

  get jobId(): BatchJobId {
    return BatchJobId.create(this.snapshot.jobId);
  }

  isProcessed(productId: ProductId): boolean {
    return productId.toString() in this.snapshot.processed;
  }

  markProcessed(result: BatchJobItemResult): ExecutionCheckpoint {
    const item = result.toSnapshot();

    return new ExecutionCheckpoint({
      ...this.snapshot,
      updatedAt: item.finishedAt,
      processed: {
        ...this.snapshot.processed,
        [item.productId]: {
          status: item.status,
          actionResult: item.actionResult,
          finishedAt: item.finishedAt,
        },
      },
    });
  }

  requestStop(reason?: string): ExecutionCheckpoint {
    return new ExecutionCheckpoint({
      ...this.snapshot,
      updatedAt: new Date().toISOString(),
      stopRequested: true,
      stopReason: reason,
    });
  }

  toSnapshot(): ExecutionCheckpointSnapshot {
    return {
      ...this.snapshot,
      processed: {
        ...this.snapshot.processed,
      },
    };
  }
}

export function deriveResultBucket(
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

export function isOperationalFailureStatus(status: ProductStatus): boolean {
  return status === 'UI_CHANGED' || status === 'UNKNOWN_ERROR';
}
