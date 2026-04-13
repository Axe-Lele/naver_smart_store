// File: packages/core/src/value-objects/batch-job-id.ts
import { z } from 'zod';

export const batchJobIdPrimitiveSchema = z
  .string()
  .trim()
  .min(3, 'BatchJobId must be at least 3 characters.')
  .max(120, 'BatchJobId must be at most 120 characters.');

export type BatchJobIdInput = z.input<typeof batchJobIdPrimitiveSchema>;

export class BatchJobId {
  private constructor(public readonly value: string) {}

  static create(input: BatchJobIdInput): BatchJobId {
    return new BatchJobId(batchJobIdPrimitiveSchema.parse(input));
  }

  static createNew(prefix = 'job'): BatchJobId {
    const random = Math.random().toString(36).slice(2, 10);
    return new BatchJobId(
      `${prefix}-${new Date().toISOString().replace(/[:.]/g, '-')}-${random}`,
    );
  }

  equals(other: BatchJobId): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }

  toJSON(): string {
    return this.value;
  }
}
