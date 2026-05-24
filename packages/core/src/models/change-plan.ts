// File: packages/core/src/models/change-plan.ts
import { z } from 'zod';

import { BatchJobId, batchJobIdPrimitiveSchema } from '../value-objects/batch-job-id.js';
import { ProductId, productIdPrimitiveSchema } from '../value-objects/product-id.js';
import {
  RunPolicy,
  runPolicySchema,
  type RunPolicyInput,
  type RunPolicyPrimitives,
} from '../value-objects/run-policy.js';
import { DomainValidationError } from '../errors.js';

export const changeActionSchema = z.enum(['SET_BUNDLE_DELIVERY_PRODUCT_TO_PREORDER']);
export type ChangeAction = z.infer<typeof changeActionSchema>;

export const changePlanSourceSchema = z.enum([
  'MANUAL_SELECTION',
  'FAILED_ITEMS_RETRY',
  'CHECKPOINT_RESUME',
]);
export type ChangePlanSource = z.infer<typeof changePlanSourceSchema>;

export const changePlanItemSchema = z.object({
  productId: productIdPrimitiveSchema,
  requestedAction: changeActionSchema.default('SET_BUNDLE_DELIVERY_PRODUCT_TO_PREORDER'),
});

export type ChangePlanItemInput = z.input<typeof changePlanItemSchema>;
export type ChangePlanItemSnapshot = z.output<typeof changePlanItemSchema>;

export class ChangePlanItem {
  private constructor(
    public readonly productId: ProductId,
    public readonly requestedAction: ChangeAction,
  ) {}

  static create(input: ChangePlanItemInput): ChangePlanItem {
    const parsed = changePlanItemSchema.parse(input);
    return new ChangePlanItem(
      ProductId.create(parsed.productId),
      parsed.requestedAction,
    );
  }

  toSnapshot(): ChangePlanItemSnapshot {
    return {
      productId: this.productId.toString(),
      requestedAction: this.requestedAction,
    };
  }
}

export const changePlanSnapshotSchema = z.object({
  jobId: batchJobIdPrimitiveSchema,
  source: changePlanSourceSchema.default('MANUAL_SELECTION'),
  dryRun: z.boolean().default(false),
  createdAt: z.string().datetime(),
  requestedBy: z.string().trim().min(1).optional(),
  runPolicy: runPolicySchema,
  items: z.array(changePlanItemSchema).min(1),
});

export type ChangePlanInput = Omit<z.input<typeof changePlanSnapshotSchema>, 'runPolicy'> & {
  runPolicy: RunPolicyInput;
};
export type ChangePlanSnapshot = Omit<
  z.output<typeof changePlanSnapshotSchema>,
  'runPolicy'
> & {
  runPolicy: RunPolicyPrimitives;
};

export class ChangePlan {
  private constructor(
    public readonly jobId: BatchJobId,
    public readonly source: ChangePlanSource,
    public readonly dryRun: boolean,
    public readonly createdAt: string,
    public readonly requestedBy: string | undefined,
    public readonly runPolicy: RunPolicy,
    public readonly items: readonly ChangePlanItem[],
  ) {}

  static create(input: ChangePlanInput): ChangePlan {
    const parsed = changePlanSnapshotSchema.parse({
      ...input,
      runPolicy: input.runPolicy,
    });
    const items = parsed.items.map((item) => ChangePlanItem.create(item));
    const uniqueIds = new Set(items.map((item) => item.productId.toString()));

    if (uniqueIds.size !== items.length) {
      throw new DomainValidationError(
        'ChangePlan cannot contain duplicated product identifiers.',
      );
    }

    return new ChangePlan(
      BatchJobId.create(parsed.jobId),
      parsed.source,
      parsed.dryRun,
      parsed.createdAt,
      parsed.requestedBy,
      RunPolicy.create(parsed.runPolicy),
      items,
    );
  }

  static createNew(input: {
    jobId?: BatchJobId;
    source?: ChangePlanSource;
    dryRun?: boolean;
    requestedBy?: string;
    runPolicy: RunPolicy;
    productIds: readonly ProductId[];
    requestedAction?: ChangeAction;
    createdAt?: string;
  }): ChangePlan {
    if (input.productIds.length === 0) {
      throw new DomainValidationError(
        'At least one product must be selected to create a ChangePlan.',
      );
    }

    return new ChangePlan(
      input.jobId ?? BatchJobId.createNew(),
      input.source ?? 'MANUAL_SELECTION',
      input.dryRun ?? input.runPolicy.dryRun,
      input.createdAt ?? new Date().toISOString(),
      input.requestedBy,
      input.runPolicy,
      input.productIds.map((productId) =>
        ChangePlanItem.create({
          productId: productId.toString(),
          requestedAction:
            input.requestedAction ?? 'SET_BUNDLE_DELIVERY_PRODUCT_TO_PREORDER',
        }),
      ),
    );
  }

  get itemCount(): number {
    return this.items.length;
  }

  includesProduct(productId: ProductId): boolean {
    return this.items.some((item) => item.productId.equals(productId));
  }

  toSnapshot(): ChangePlanSnapshot {
    return {
      jobId: this.jobId.toString(),
      source: this.source,
      dryRun: this.dryRun,
      createdAt: this.createdAt,
      requestedBy: this.requestedBy,
      runPolicy: this.runPolicy.toPrimitives(),
      items: this.items.map((item) => item.toSnapshot()),
    };
  }
}
