// File: packages/application/src/settings/app-settings.ts
import { z } from 'zod';

import { RunPolicy, type RunPolicyInput } from '@smart-store/core';

export const DEFAULT_SMARTSTORE_PRODUCTS_URL =
  'https://sell.smartstore.naver.com/#/products/origin-list';

export const DEFAULT_PREORDER_REQUIRED_OPTIONS = [
  {
    name: '해외 유통구조상 예약캔슬 불가',
    value: '동의합니다.',
  },
];

// 기존 설치본에서 저장된 설정값이 10보다 클 수 있어도 실제 실행 정책에서는 여기서 제한합니다.
// 상품목록 복구가 계속 실패할 때 무한 반복처럼 보이지 않게 하는 최종 안전장치입니다.
export const MAX_CONSECUTIVE_FAILURE_LIMIT = 10;

const legacyProductsUrls = new Set([
  'https://sell.smartstore.naver.com',
  'https://sell.smartstore.naver.com/',
]);

export const loginModeSchema = z.enum(['storageState', 'persistent']);
export type LoginMode = z.infer<typeof loginModeSchema>;

export const preorderRequiredOptionSchema = z.object({
  name: z.string().trim().min(1).max(80),
  value: z.string().trim().min(1).max(200),
});
export type PreorderRequiredOption = z.output<typeof preorderRequiredOptionSchema>;

export const appSettingsSchema = z
  .object({
    productsUrl: z.string().url(),
    loginMode: loginModeSchema.default('storageState'),
    storageStatePath: z.string().trim().min(1),
    userDataDir: z.string().trim().min(1).optional(),
    outputDir: z.string().trim().min(1),
    headless: z.boolean().default(false),
    delayMs: z.number().int().min(0).default(1_500),
    concurrency: z.number().int().min(1).max(8).default(1),
    consecutiveFailureLimit: z.number().int().min(1).max(100).default(10),
    captureScreenshotOnFailure: z.boolean().default(true),
    captureHtmlOnFailure: z.boolean().default(true),
    selectorProfileId: z.string().trim().min(1).default('smartstore-default'),
    selectorConfigPath: z.string().trim().min(1).optional(),
    preorderRequiredOptions: z
      .array(preorderRequiredOptionSchema)
      .min(1)
      .max(20)
      .default(DEFAULT_PREORDER_REQUIRED_OPTIONS),
  })
  .superRefine((value, ctx) => {
    if (value.loginMode === 'persistent' && !value.userDataDir) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['userDataDir'],
        message: 'userDataDir is required when loginMode is persistent.',
      });
    }
  });

export type AppSettings = z.output<typeof appSettingsSchema>;
export type AppSettingsInput = z.input<typeof appSettingsSchema>;

export function parseAppSettings(input: AppSettingsInput): AppSettings {
  return appSettingsSchema.parse({
    ...input,
    productsUrl: normalizeProductsUrl(input.productsUrl),
  });
}

export function normalizeProductsUrl(productsUrl: string): string {
  const normalized = productsUrl.trim();

  if (legacyProductsUrls.has(normalized)) {
    return DEFAULT_SMARTSTORE_PRODUCTS_URL;
  }

  return normalized;
}

export function buildRunPolicyFromSettings(
  settings: AppSettings,
  overrides: Partial<RunPolicyInput> = {},
): RunPolicy {
  return RunPolicy.create({
    dryRun: false,
    delayMs: settings.delayMs,
    concurrency: settings.concurrency,
    headless: settings.headless,
    // 저장된 설정값은 보존하되, 실제 실행에는 안전 상한을 적용합니다.
    consecutiveFailureLimit: Math.min(
      settings.consecutiveFailureLimit,
      MAX_CONSECUTIVE_FAILURE_LIMIT,
    ),
    productsUrl: settings.productsUrl,
    captureScreenshotOnFailure: settings.captureScreenshotOnFailure,
    captureHtmlOnFailure: settings.captureHtmlOnFailure,
    selectorProfileId: settings.selectorProfileId,
    ...overrides,
  });
}
