// File: packages/core/src/models/batch-job.ts
import { z } from 'zod';

import { ChangePlan, changePlanSnapshotSchema, type ChangePlanInput, type ChangePlanSnapshot } from './change-plan.js';
import {
  BatchJobItemResult,
  ChangeExecution,
  actionResultSchema,
  batchJobStatusSchema,
  changeExecutionSnapshotSchema,
  executionCheckpointSnapshotSchema,
  type BatchJobItemResultSnapshot,
} from './execution.js';
import { ProductStatus, productStatusSchema } from './product.js';

const batchJobSnapshotSchema = z.object({
  plan: changePlanSnapshotSchema,
  execution: changeExecutionSnapshotSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type BatchJobSnapshot = z.output<typeof batchJobSnapshotSchema>;
export type BatchJobInput = {
  plan: ChangePlanInput;
  execution: z.input<typeof changeExecutionSnapshotSchema>;
  createdAt: string;
  updatedAt: string;
};

export class BatchJob {
  private constructor(
    public readonly plan: ChangePlan,
    public readonly execution: ChangeExecution,
    public readonly createdAt: string,
    public readonly updatedAt: string,
  ) {}

  static create(input: BatchJobInput): BatchJob {
    const parsed = batchJobSnapshotSchema.parse(input);

    return new BatchJob(
      ChangePlan.create(parsed.plan),
      ChangeExecution.create(parsed.execution),
      parsed.createdAt,
      parsed.updatedAt,
    );
  }

  static createNew(plan: ChangePlan, createdAt = new Date().toISOString()): BatchJob {
    return new BatchJob(
      plan,
      ChangeExecution.createNew(plan.jobId),
      createdAt,
      createdAt,
    );
  }

  get id() {
    return this.plan.jobId;
  }

  markRunning(startedAt = new Date().toISOString()): BatchJob {
    return new BatchJob(
      this.plan,
      this.execution.markRunning(startedAt),
      this.createdAt,
      startedAt,
    );
  }

  applyResult(result: BatchJobItemResult, updatedAt = new Date().toISOString()): BatchJob {
    return new BatchJob(
      this.plan,
      this.execution.applyResult(result),
      this.createdAt,
      updatedAt,
    );
  }

  requestStop(reason?: string, updatedAt = new Date().toISOString()): BatchJob {
    return new BatchJob(
      this.plan,
      this.execution.requestStop(reason),
      this.createdAt,
      updatedAt,
    );
  }

  markCompleted(finishedAt = new Date().toISOString()): BatchJob {
    return new BatchJob(
      this.plan,
      this.execution.markCompleted(finishedAt),
      this.createdAt,
      finishedAt,
    );
  }

  markStopped(finishedAt = new Date().toISOString(), reason?: string): BatchJob {
    return new BatchJob(
      this.plan,
      this.execution.markStopped(finishedAt, reason),
      this.createdAt,
      finishedAt,
    );
  }

  markFailed(finishedAt = new Date().toISOString(), reason?: string): BatchJob {
    return new BatchJob(
      this.plan,
      this.execution.markFailed(finishedAt, reason),
      this.createdAt,
      finishedAt,
    );
  }

  toSnapshot(): BatchJobSnapshot {
    return {
      plan: this.plan.toSnapshot(),
      execution: this.execution.toSnapshot(),
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}

export const batchJobResultSummarySchema = z.object({
  totalItems: z.number().int().min(0),
  processedItems: z.number().int().min(0),
  successCount: z.number().int().min(0),
  lockedCount: z.number().int().min(0),
  failedCount: z.number().int().min(0),
  convertedCount: z.number().int().min(0),
  dryRunEligibleCount: z.number().int().min(0),
  counts: z.record(productStatusSchema, z.number().int().min(0)),
});

export type BatchJobResultSummary = z.output<typeof batchJobResultSummarySchema>;

export const batchJobResultSnapshotSchema = z.object({
  jobId: z.string().trim().min(1),
  status: batchJobStatusSchema,
  startedAt: z.string().datetime().optional(),
  finishedAt: z.string().datetime(),
  stopReason: z.string().trim().min(1).optional(),
  checkpoint: executionCheckpointSnapshotSchema.optional(),
  summary: batchJobResultSummarySchema,
  items: z.array(z.any()),
});

export type BatchJobResultSnapshot = {
  jobId: string;
  status: z.infer<typeof batchJobStatusSchema>;
  startedAt?: string;
  finishedAt: string;
  stopReason?: string;
  checkpoint?: z.output<typeof executionCheckpointSnapshotSchema>;
  summary: BatchJobResultSummary;
  items: BatchJobItemResultSnapshot[];
};

export class BatchJobResult {
  private constructor(
    public readonly jobId: string,
    public readonly status: z.infer<typeof batchJobStatusSchema>,
    public readonly startedAt: string | undefined,
    public readonly finishedAt: string,
    public readonly stopReason: string | undefined,
    public readonly summary: BatchJobResultSummary,
    public readonly items: readonly BatchJobItemResult[],
    public readonly checkpoint?: z.output<typeof executionCheckpointSnapshotSchema>,
  ) {}

  static create(input: BatchJobResultSnapshot): BatchJobResult {
    batchJobResultSnapshotSchema.parse({
      ...input,
      items: input.items,
    });

    return new BatchJobResult(
      input.jobId,
      input.status,
      input.startedAt,
      input.finishedAt,
      input.stopReason,
      input.summary,
      input.items.map((item) => BatchJobItemResult.create(item)),
      input.checkpoint,
    );
  }

  static fromJob(
    job: BatchJob,
    items: readonly BatchJobItemResult[],
    options?: {
      finishedAt?: string;
      stopReason?: string;
      checkpoint?: z.output<typeof executionCheckpointSnapshotSchema>;
    },
  ): BatchJobResult {
    const counts = createEmptyStatusCounts();

    for (const item of items) {
      counts[item.status] += 1;
    }

    return new BatchJobResult(
      job.id.toString(),
      job.execution.status,
      job.execution.toSnapshot().startedAt,
      options?.finishedAt ?? new Date().toISOString(),
      options?.stopReason,
      {
        totalItems: job.plan.itemCount,
        processedItems: items.length,
        successCount: items.filter((item) => item.outputBucket === 'success').length,
        lockedCount: items.filter((item) => item.outputBucket === 'locked').length,
        failedCount: items.filter((item) => item.outputBucket === 'failed').length,
        convertedCount: items.filter((item) => item.actionResult === 'CONVERTED').length,
        dryRunEligibleCount: items.filter((item) => item.actionResult === 'DRY_RUN').length,
        counts,
      },
      items,
      options?.checkpoint,
    );
  }

  toSnapshot(): BatchJobResultSnapshot {
    return {
      jobId: this.jobId,
      status: this.status,
      startedAt: this.startedAt,
      finishedAt: this.finishedAt,
      stopReason: this.stopReason,
      checkpoint: this.checkpoint,
      summary: {
        ...this.summary,
        counts: { ...this.summary.counts },
      },
      items: this.items.map((item) => item.toSnapshot()),
    };
  }
}

function createEmptyStatusCounts(): Record<ProductStatus, number> {
  const keys = productStatusSchema.options;
  return keys.reduce<Record<ProductStatus, number>>((acc, key) => {
    acc[key] = 0;
    return acc;
  }, {} as Record<ProductStatus, number>);
}
