// File: packages/core/src/models/product.ts
import { z } from 'zod';

import { ProductId, productIdPrimitiveSchema } from '../value-objects/product-id.js';

export const productSaleTypeSchema = z.enum(['PREORDER', 'NORMAL', 'UNKNOWN']);
export type ProductSaleType = z.infer<typeof productSaleTypeSchema>;

export const productStatusSchema = z.enum([
  'UNCLASSIFIED',
  'NOT_FOUND',
  'NOT_PREORDER',
  'EDITABLE_PREORDER',
  'LOCKED_BY_ORDER_PERIOD',
  'UI_CHANGED',
  'UNKNOWN_ERROR',
]);
export type ProductStatus = z.infer<typeof productStatusSchema>;

export const productSnapshotSchema = z.object({
  id: productIdPrimitiveSchema,
  name: z.string().trim().min(1).optional(),
  saleType: productSaleTypeSchema.default('UNKNOWN'),
  status: productStatusSchema.default('UNCLASSIFIED'),
  reason: z.string().trim().min(1).optional(),
  tags: z.array(z.string().trim().min(1)).default([]),
  metadata: z.record(z.string(), z.string()).default({}),
});

export type ProductSnapshot = z.output<typeof productSnapshotSchema>;
export type ProductInput = z.input<typeof productSnapshotSchema>;

export class Product {
  private constructor(
    public readonly id: ProductId,
    public readonly name: string | undefined,
    public readonly saleType: ProductSaleType,
    public readonly status: ProductStatus,
    public readonly reason: string | undefined,
    public readonly tags: readonly string[],
    public readonly metadata: Readonly<Record<string, string>>,
  ) {}

  static create(input: ProductInput): Product {
    const parsed = productSnapshotSchema.parse(input);

    return new Product(
      ProductId.create(parsed.id),
      parsed.name,
      parsed.saleType,
      parsed.status,
      parsed.reason,
      parsed.tags,
      parsed.metadata,
    );
  }

  classify(status: ProductStatus, options?: { saleType?: ProductSaleType; reason?: string }): Product {
    return new Product(
      this.id,
      this.name,
      options?.saleType ?? this.saleType,
      status,
      options?.reason ?? this.reason,
      this.tags,
      this.metadata,
    );
  }

  canConvertPreorderToNormal(): boolean {
    return this.status === 'EDITABLE_PREORDER' || this.saleType === 'PREORDER';
  }

  isLocked(): boolean {
    return this.status === 'LOCKED_BY_ORDER_PERIOD';
  }

  toSnapshot(): ProductSnapshot {
    return {
      id: this.id.toString(),
      name: this.name,
      saleType: this.saleType,
      status: this.status,
      reason: this.reason,
      tags: [...this.tags],
      metadata: { ...this.metadata },
    };
  }
}
