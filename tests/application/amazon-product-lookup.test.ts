import { describe, expect, it } from 'vitest';

import {
  LookupAmazonProductsUseCase,
  type AmazonProductLookupPort,
  type AmazonProductLookupResult,
  type LookupAmazonProductsInput,
} from '../../packages/application/src/index.js';

class FakeAmazonLookup implements AmazonProductLookupPort {
  constructor(private readonly result: AmazonProductLookupResult) {}

  async lookup(_input: LookupAmazonProductsInput): Promise<AmazonProductLookupResult> {
    return this.result;
  }
}

describe('amazon product lookup', () => {
  it('keeps results in the requested source order', async () => {
    const useCase = new LookupAmazonProductsUseCase(
      new FakeAmazonLookup({
        items: [
          {
            id: 'second',
            source: 'B000000002',
            status: 'READY',
            asin: 'B000000002',
            title: 'Second item',
            preorderStatus: 'UNKNOWN',
            shippingStartConfidence: 'UNKNOWN',
            features: [],
            externalIds: { eans: [], upcs: [], isbns: [] },
            evidence: ['ItemInfo.Title'],
          },
          {
            id: 'first',
            source: 'B000000001',
            status: 'READY',
            asin: 'B000000001',
            title: 'First item',
            preorderStatus: 'UNKNOWN',
            shippingStartConfidence: 'UNKNOWN',
            features: [],
            externalIds: { eans: [], upcs: [], isbns: [] },
            evidence: ['ItemInfo.Title'],
          },
        ],
      }),
    );

    const result = await useCase.execute({
      queries: [{ source: 'B000000001' }, { source: 'B000000002' }],
    });

    expect(result.items.map((item) => item.source)).toEqual([
      'B000000001',
      'B000000002',
    ]);
  });

  it('adds a failed item when the adapter omits a query result', async () => {
    const useCase = new LookupAmazonProductsUseCase(
      new FakeAmazonLookup({
        items: [],
      }),
    );

    const result = await useCase.execute({
      queries: [{ source: 'B000000001' }],
    });

    expect(result.items[0]).toMatchObject({
      source: 'B000000001',
      status: 'FAILED',
      warning: 'Amazon 상품 정보를 가져오지 못했습니다.',
    });
  });
});
