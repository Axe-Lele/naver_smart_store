import { describe, expect, it, vi } from 'vitest';

import {
  MangoProductNameTranslationError,
  translateMangoOriginProductName,
} from '../../apps/chrome-extension/src/infrastructure/mango-openai-product-name-translator.js';

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    text: async () => JSON.stringify(body),
  } as Response;
}

describe('translateMangoOriginProductName', () => {
  it('throws when no api key is provided', async () => {
    await expect(translateMangoOriginProductName('', '원문상품명')).rejects.toThrow(
      MangoProductNameTranslationError,
    );
  });

  it('parses candidate names from a successful output_text response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        output_text: JSON.stringify({
          items: [{ id: '1', candidates: [{ name: '후보 A' }, { name: '후보 B' }] }],
        }),
      }),
    );

    const candidates = await translateMangoOriginProductName('sk-test', '原文商品名', {
      fetch: fetchMock,
    });

    expect(candidates).toEqual(['후보 A', '후보 B']);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.openai.com/v1/responses',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer sk-test' }),
      }),
    );
  });

  it('parses candidate names from the nested output[].content[] shape', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        output: [
          {
            content: [
              {
                type: 'output_text',
                text: JSON.stringify({ items: [{ id: '1', candidates: [{ name: '후보 C' }] }] }),
              },
            ],
          },
        ],
      }),
    );

    const candidates = await translateMangoOriginProductName('sk-test', '原文商品名', {
      fetch: fetchMock,
    });

    expect(candidates).toEqual(['후보 C']);
  });

  it('throws a readable error on a non-ok response', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ error: { message: '잘못된 API 키입니다.' } }, false, 401));

    await expect(
      translateMangoOriginProductName('sk-bad', '원문상품명', { fetch: fetchMock }),
    ).rejects.toThrow('잘못된 API 키입니다.');
  });

  it('throws when no candidates are returned', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ output_text: JSON.stringify({ items: [{ id: '1', candidates: [] }] }) }),
    );

    await expect(
      translateMangoOriginProductName('sk-test', '원문상품명', { fetch: fetchMock }),
    ).rejects.toThrow('번역 후보를 받지 못했습니다.');
  });
});
