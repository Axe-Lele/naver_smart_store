// File: packages/core/src/value-objects/product-id.ts
import { z } from 'zod';

export const productIdPrimitiveSchema = z.coerce
  .string()
  .trim()
  .regex(/^\d+$/, 'ProductId must be a numeric string.');

export type ProductIdInput = z.input<typeof productIdPrimitiveSchema>;

export class ProductId {
  private constructor(public readonly value: string) {}

  static create(input: ProductIdInput): ProductId {
    return new ProductId(productIdPrimitiveSchema.parse(input));
  }

  equals(other: ProductId): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }

  toJSON(): string {
    return this.value;
  }
}
