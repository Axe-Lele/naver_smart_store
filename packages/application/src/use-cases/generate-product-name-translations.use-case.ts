// File: packages/application/src/use-cases/generate-product-name-translations.use-case.ts
import { z } from 'zod';

import type { ProductNameTranslatorPort } from '../ports/product-name-translator.port.js';

const DEFAULT_CANDIDATE_COUNT = 3;
const DEFAULT_MAX_NAME_LENGTH = 100;

export const productNameTranslationItemSchema = z.object({
  id: z.string().trim().min(1).max(80),
  title: z.string().trim().min(1).max(500),
  brand: z.string().trim().min(1).max(100).optional(),
  manufacturer: z.string().trim().min(1).max(100).optional(),
  categoryHint: z.string().trim().min(1).max(100).optional(),
  releaseDate: z.string().trim().min(1).max(40).optional(),
  features: z.array(z.string().trim().min(1).max(200)).max(8).optional(),
});
export type ProductNameTranslationItem = z.output<typeof productNameTranslationItemSchema>;

export const generateProductNameTranslationsInputSchema = z.object({
  items: z.array(productNameTranslationItemSchema).min(1).max(30),
  candidateCount: z.number().int().min(1).max(3).default(DEFAULT_CANDIDATE_COUNT),
  maxNameLength: z.number().int().min(20).max(120).default(DEFAULT_MAX_NAME_LENGTH),
  forbiddenTerms: z.array(z.string().trim().min(1).max(40)).max(30).default([]),
});
export type GenerateProductNameTranslationsInput = z.output<
  typeof generateProductNameTranslationsInputSchema
>;

export const productNameTranslationCandidateSchema = z.object({
  name: z.string().trim().min(1).max(120),
});
export type ProductNameTranslationCandidate = z.output<
  typeof productNameTranslationCandidateSchema
>;

export const productNameTranslationResultItemSchema = z.object({
  id: z.string().trim().min(1).max(80),
  title: z.string().trim().min(1).max(500),
  candidates: z.array(productNameTranslationCandidateSchema).max(10),
  warning: z.string().trim().min(1).max(300).optional(),
});
export type ProductNameTranslationResultItem = z.output<
  typeof productNameTranslationResultItemSchema
>;

export const productNameTranslationBatchResultSchema = z.object({
  items: z.array(productNameTranslationResultItemSchema),
  model: z.string().trim().min(1).optional(),
});
export type ProductNameTranslationBatchResult = z.output<
  typeof productNameTranslationBatchResultSchema
>;

export function parseGenerateProductNameTranslationsInput(
  input: unknown,
): GenerateProductNameTranslationsInput {
  return generateProductNameTranslationsInputSchema.parse(input);
}

export class GenerateProductNameTranslationsUseCase {
  constructor(private readonly translator: ProductNameTranslatorPort) {}

  async execute(input: GenerateProductNameTranslationsInput): Promise<ProductNameTranslationBatchResult> {
    const request = parseGenerateProductNameTranslationsInput(input);
    const translated = productNameTranslationBatchResultSchema.parse(
      await this.translator.generate(request),
    );

    return normalizeBatchResult(request, translated);
  }
}

function normalizeBatchResult(
  request: GenerateProductNameTranslationsInput,
  translated: ProductNameTranslationBatchResult,
): ProductNameTranslationBatchResult {
  const itemsById = new Map(translated.items.map((item) => [item.id, item]));

  return {
    model: translated.model,
    items: request.items.map((source) => {
      const generated = itemsById.get(source.id);
      const candidates = normalizeCandidates(
        generated?.candidates ?? [],
        request.candidateCount,
        request.maxNameLength,
        request.forbiddenTerms,
      );

      return {
        id: source.id,
        title: source.title,
        candidates,
        warning:
          candidates.length > 0
            ? generated?.warning
            : generated?.warning ?? '상품명 후보를 만들지 못했습니다.',
      };
    }),
  };
}

function normalizeCandidates(
  candidates: readonly ProductNameTranslationCandidate[],
  candidateCount: number,
  maxNameLength: number,
  forbiddenTerms: readonly string[],
): ProductNameTranslationCandidate[] {
  const normalized: ProductNameTranslationCandidate[] = [];
  const seen = new Set<string>();

  for (const candidate of candidates) {
    const name = sanitizeCandidateName(candidate.name, maxNameLength);
    const key = name.toLocaleLowerCase('ko-KR');

    if (!name || seen.has(key) || containsForbiddenTerm(name, forbiddenTerms)) {
      continue;
    }

    seen.add(key);
    normalized.push({ name });

    if (normalized.length >= candidateCount) {
      break;
    }
  }

  return normalized;
}

function sanitizeCandidateName(name: string, maxNameLength: number): string {
  const normalized = name
    .replace(/["'`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const deduped = removeRepeatedAdjacentTokens(normalized);

  if (deduped.length <= maxNameLength) {
    return deduped;
  }

  const clipped = deduped.slice(0, maxNameLength).trim();
  const lastSpaceIndex = clipped.lastIndexOf(' ');

  return lastSpaceIndex > 20 ? clipped.slice(0, lastSpaceIndex).trim() : clipped;
}

function removeRepeatedAdjacentTokens(value: string): string {
  const tokens = value.split(' ');
  const deduped: string[] = [];

  for (const token of tokens) {
    if (deduped.at(-1)?.toLocaleLowerCase('ko-KR') === token.toLocaleLowerCase('ko-KR')) {
      continue;
    }

    deduped.push(token);
  }

  return deduped.join(' ');
}

function containsForbiddenTerm(
  value: string,
  forbiddenTerms: readonly string[],
): boolean {
  const normalizedValue = value.toLocaleLowerCase('ko-KR');
  return forbiddenTerms.some((term) =>
    normalizedValue.includes(term.toLocaleLowerCase('ko-KR')),
  );
}
