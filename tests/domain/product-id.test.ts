// File: C:\smart-store\tests\domain\product-id.test.ts
import { describe, expect, it } from 'vitest';

import { ProductId } from '../../apps/chrome-extension/src/domain/product-id.js';
import { DEFAULT_RUN_POLICY } from '../../apps/chrome-extension/src/domain/run-policy.js';

describe('ProductId', () => {
  it('normalizes numeric ids', () => {
    expect(ProductId.create(' 123456 ').toString()).toBe('123456');
  });

  it('compares equality by normalized value', () => {
    const left = ProductId.create('123456');
    const right = ProductId.create(123456);

    expect(left.equals(right)).toBe(true);
  });

  it('rejects non-numeric ids', () => {
    expect(() => ProductId.create('abc-1')).toThrow(/Invalid product id/);
  });

  it('keeps the default run policy stable for Asia/Seoul dry-runs', () => {
    expect(DEFAULT_RUN_POLICY).toMatchObject({
      dryRun: true,
      resumeFromCheckpoint: true,
      timezone: 'Asia/Seoul',
    });
  });
});
