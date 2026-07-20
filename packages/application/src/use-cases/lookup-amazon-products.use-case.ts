// File: packages/application/src/use-cases/lookup-amazon-products.use-case.ts
import { z } from 'zod';

import type { AmazonProductLookupPort } from '../ports/amazon-product-lookup.port.js';

export const amazonProductLookupQuerySchema = z.object({
  source: z.string().trim().min(1).max(500),
});
export type AmazonProductLookupQuery = z.output<typeof amazonProductLookupQuerySchema>;

export const lookupAmazonProductsInputSchema = z.object({
  queries: z.array(amazonProductLookupQuerySchema).min(1).max(10),
});
export type LookupAmazonProductsInput = z.output<typeof lookupAmazonProductsInputSchema>;

export const amazonProductExternalIdsSchema = z.object({
  eans: z.array(z.string()).default([]),
  upcs: z.array(z.string()).default([]),
  isbns: z.array(z.string()).default([]),
});
export type AmazonProductExternalIds = z.output<typeof amazonProductExternalIdsSchema>;

export const amazonProductLookupItemSchema = z.object({
  id: z.string().trim().min(1),
  source: z.string().trim().min(1),
  status: z.enum(['READY', 'MISSING_ASIN', 'NOT_FOUND', 'FAILED']),
  asin: z.string().trim().min(1).optional(),
  detailPageUrl: z.string().url().optional(),
  title: z.string().trim().min(1).optional(),
  brand: z.string().trim().min(1).optional(),
  manufacturer: z.string().trim().min(1).optional(),
  model: z.string().trim().min(1).optional(),
  partNumber: z.string().trim().min(1).optional(),
  category: z.string().trim().min(1).optional(),
  releaseDate: z.string().trim().min(1).optional(),
  releaseMonth: z.string().trim().min(1).optional(),
  preorderStatus: z
    .enum(['PREORDER_LIKELY', 'RELEASED_OR_AVAILABLE', 'UNKNOWN'])
    .default('UNKNOWN'),
  shippingStartDate: z.string().trim().min(1).optional(),
  shippingStartConfidence: z.enum(['HIGH', 'MEDIUM', 'LOW', 'UNKNOWN']).default('UNKNOWN'),
  availabilityMessage: z.string().trim().min(1).optional(),
  priceDisplay: z.string().trim().min(1).optional(),
  imageUrl: z.string().url().optional(),
  features: z.array(z.string().trim().min(1)).default([]),
  externalIds: amazonProductExternalIdsSchema.default({
    eans: [],
    upcs: [],
    isbns: [],
  }),
  evidence: z.array(z.string().trim().min(1)).default([]),
  warning: z.string().trim().min(1).optional(),
});
export type AmazonProductLookupItem = z.output<typeof amazonProductLookupItemSchema>;

export const amazonProductLookupResultSchema = z.object({
  items: z.array(amazonProductLookupItemSchema),
});
export type AmazonProductLookupResult = z.output<typeof amazonProductLookupResultSchema>;

export function parseLookupAmazonProductsInput(input: unknown): LookupAmazonProductsInput {
  return lookupAmazonProductsInputSchema.parse(input);
}

export class LookupAmazonProductsUseCase {
  constructor(private readonly lookupPort: AmazonProductLookupPort) {}

  async execute(input: LookupAmazonProductsInput): Promise<AmazonProductLookupResult> {
    const request = parseLookupAmazonProductsInput(input);
    const result = amazonProductLookupResultSchema.parse(
      await this.lookupPort.lookup(request),
    );
    const itemsBySource = new Map(result.items.map((item) => [item.source, item]));

    return {
      items: request.queries.map((query, index) => {
        const item = itemsBySource.get(query.source);
        return (
          item ?? {
            id: `query-${index + 1}`,
            source: query.source,
            status: 'FAILED' as const,
            preorderStatus: 'UNKNOWN' as const,
            shippingStartConfidence: 'UNKNOWN' as const,
            features: [],
            externalIds: {
              eans: [],
              upcs: [],
              isbns: [],
            },
            evidence: [],
            warning: 'Amazon 상품 정보를 가져오지 못했습니다.',
          }
        );
      }),
    };
  }
}
