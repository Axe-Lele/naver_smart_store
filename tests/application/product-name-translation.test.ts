import { describe, expect, it } from 'vitest';

import {
  GenerateProductNameTranslationsUseCase,
  type GenerateProductNameTranslationsInput,
  type ProductNameTranslationBatchResult,
  type ProductNameTranslatorPort,
} from '../../packages/application/src/index.js';

class FakeTranslator implements ProductNameTranslatorPort {
  constructor(private readonly result: ProductNameTranslationBatchResult) {}

  async generate(
    _input: GenerateProductNameTranslationsInput,
  ): Promise<ProductNameTranslationBatchResult> {
    return this.result;
  }
}

describe('product name translation', () => {
  it('keeps generated candidates in the source item order', async () => {
    const useCase = new GenerateProductNameTranslationsUseCase(
      new FakeTranslator({
        model: 'fake-model',
        items: [
          {
            id: 'second',
            title: 'バキ 範馬勇次郎 ハンガーフィギュア',
            candidates: [{ name: '바키 한마 유지로 행거 피규어' }],
          },
          {
            id: 'first',
            title: 'threezero バンブルビー',
            candidates: [{ name: 'threezero 트랜스포머 범블비 액션 피규어' }],
          },
        ],
      }),
    );

    const result = await useCase.execute({
      items: [
        { id: 'first', title: 'threezero バンブルビー' },
        { id: 'second', title: 'バキ 範馬勇次郎 ハンガーフィギュア' },
      ],
      candidateCount: 3,
      maxNameLength: 100,
      forbiddenTerms: [],
    });

    expect(result.items.map((item) => item.id)).toEqual(['first', 'second']);
    expect(result.items[0].candidates[0].name).toBe(
      'threezero 트랜스포머 범블비 액션 피규어',
    );
  });

  it('removes duplicates, forbidden terms, and overlong suffixes', async () => {
    const useCase = new GenerateProductNameTranslationsUseCase(
      new FakeTranslator({
        items: [
          {
            id: 'item-1',
            title: 'バキ 範馬勇次郎 ハンガーフィギュア',
            candidates: [
              { name: '"바키 바키 한마 유지로 행거 피규어 공식"' },
              { name: '바키 한마 유지로 행거 피규어 공식' },
              { name: '바키 한마 유지로 행거 피규어 예약판매 한정판 초회 특전 포함' },
              { name: '바키 한마 유지로 행거 피규어' },
            ],
          },
        ],
      }),
    );

    const result = await useCase.execute({
      items: [{ id: 'item-1', title: 'バキ 範馬勇次郎 ハンガーフィギュア' }],
      candidateCount: 3,
      maxNameLength: 24,
      forbiddenTerms: ['공식', '예약판매'],
    });

    expect(result.items[0].candidates).toEqual([
      { name: '바키 한마 유지로 행거 피규어' },
    ]);
  });
});
