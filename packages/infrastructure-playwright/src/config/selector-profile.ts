// File: packages/infrastructure-playwright/src/config/selector-profile.ts
import { z } from 'zod';

const selectorListSchema = z.array(z.string().trim().min(1)).min(1);
const optionalSelectorListSchema = z.array(z.string().trim().min(1)).default([]);

const authSelectorSchema = z.object({
  loginIndicators: selectorListSchema,
  challengeIndicators: selectorListSchema,
  accessDeniedIndicators: selectorListSchema,
  accessDeniedUrlPatterns: selectorListSchema,
});

const commonSelectorSchema = z.object({
  loadingIndicators: optionalSelectorListSchema,
  toastIndicators: optionalSelectorListSchema,
  bannerIndicators: optionalSelectorListSchema,
});

const productListSelectorSchema = z.object({
  pageIdentity: selectorListSchema,
  searchInput: selectorListSchema,
  searchButton: selectorListSchema,
  noResultIndicators: selectorListSchema,
  resultRows: selectorListSchema,
  editButtons: selectorListSchema,
  productLinks: selectorListSchema,
});

const productEditSelectorSchema = z.object({
  pageIdentity: selectorListSchema,
  saveButtons: selectorListSchema,
  preorderSectionContainers: selectorListSchema,
  preorderSectionHints: selectorListSchema,
  interactiveSelectors: selectorListSchema,
  normalOptionHints: selectorListSchema,
  preorderOptionHints: selectorListSchema,
  successIndicators: selectorListSchema,
  lockIndicators: selectorListSchema,
});

export const selectorProfileConfigSchema = z.object({
  id: z.string().trim().min(1),
  auth: authSelectorSchema,
  common: commonSelectorSchema,
  productList: productListSelectorSchema,
  productEdit: productEditSelectorSchema,
});

export type SelectorProfileConfig = z.output<typeof selectorProfileConfigSchema>;

export const selectorProfileOverrideSchema = z.object({
  id: z.string().trim().min(1).optional(),
  auth: authSelectorSchema.partial().optional(),
  common: commonSelectorSchema.partial().optional(),
  productList: productListSelectorSchema.partial().optional(),
  productEdit: productEditSelectorSchema.partial().optional(),
});

export type SelectorProfileOverride = z.output<typeof selectorProfileOverrideSchema>;

export interface ResolvedSelectorProfile {
  readonly id: string;
  readonly auth: {
    readonly loginIndicators: readonly string[];
    readonly challengeIndicators: readonly string[];
    readonly accessDeniedIndicators: readonly string[];
    readonly accessDeniedUrlPatterns: readonly RegExp[];
  };
  readonly common: {
    readonly loadingIndicators: readonly string[];
    readonly toastIndicators: readonly string[];
    readonly bannerIndicators: readonly string[];
  };
  readonly productList: {
    readonly pageIdentity: readonly string[];
    readonly searchInput: readonly string[];
    readonly searchButton: readonly string[];
    readonly noResultIndicators: readonly string[];
    readonly resultRows: readonly string[];
    readonly editButtons: readonly string[];
    readonly productLinks: readonly string[];
  };
  readonly productEdit: {
    readonly pageIdentity: readonly string[];
    readonly saveButtons: readonly string[];
    readonly preorderSectionContainers: readonly string[];
    readonly preorderSectionHints: readonly RegExp[];
    readonly interactiveSelectors: readonly string[];
    readonly normalOptionHints: readonly RegExp[];
    readonly preorderOptionHints: readonly RegExp[];
    readonly successIndicators: readonly string[];
    readonly lockIndicators: readonly string[];
  };
}

export function parseSelectorProfileConfig(input: unknown): SelectorProfileConfig {
  return selectorProfileConfigSchema.parse(input);
}

export function parseSelectorProfileOverride(input: unknown): SelectorProfileOverride {
  return selectorProfileOverrideSchema.parse(input);
}

export function resolveSelectorProfile(
  config: SelectorProfileConfig,
): ResolvedSelectorProfile {
  const parsed = parseSelectorProfileConfig(config);

  return {
    id: parsed.id,
    auth: {
      loginIndicators: parsed.auth.loginIndicators,
      challengeIndicators: parsed.auth.challengeIndicators,
      accessDeniedIndicators: parsed.auth.accessDeniedIndicators,
      accessDeniedUrlPatterns: parsed.auth.accessDeniedUrlPatterns.map((pattern) =>
        new RegExp(pattern, 'i'),
      ),
    },
    common: {
      loadingIndicators: parsed.common.loadingIndicators,
      toastIndicators: parsed.common.toastIndicators,
      bannerIndicators: parsed.common.bannerIndicators,
    },
    productList: {
      pageIdentity: parsed.productList.pageIdentity,
      searchInput: parsed.productList.searchInput,
      searchButton: parsed.productList.searchButton,
      noResultIndicators: parsed.productList.noResultIndicators,
      resultRows: parsed.productList.resultRows,
      editButtons: parsed.productList.editButtons,
      productLinks: parsed.productList.productLinks,
    },
    productEdit: {
      pageIdentity: parsed.productEdit.pageIdentity,
      saveButtons: parsed.productEdit.saveButtons,
      preorderSectionContainers: parsed.productEdit.preorderSectionContainers,
      preorderSectionHints: compilePatterns(parsed.productEdit.preorderSectionHints),
      interactiveSelectors: parsed.productEdit.interactiveSelectors,
      normalOptionHints: compilePatterns(parsed.productEdit.normalOptionHints),
      preorderOptionHints: compilePatterns(parsed.productEdit.preorderOptionHints),
      successIndicators: parsed.productEdit.successIndicators,
      lockIndicators: parsed.productEdit.lockIndicators,
    },
  };
}

export function mergeSelectorProfile(
  base: SelectorProfileConfig,
  override: SelectorProfileOverride,
): SelectorProfileConfig {
  return parseSelectorProfileConfig({
    ...base,
    id: override.id ?? base.id,
    auth: {
      ...base.auth,
      ...override.auth,
    },
    common: {
      ...base.common,
      ...override.common,
    },
    productList: {
      ...base.productList,
      ...override.productList,
    },
    productEdit: {
      ...base.productEdit,
      ...override.productEdit,
    },
  });
}

function compilePatterns(patterns: readonly string[]): RegExp[] {
  return patterns.map((pattern) => new RegExp(pattern, 'i'));
}
