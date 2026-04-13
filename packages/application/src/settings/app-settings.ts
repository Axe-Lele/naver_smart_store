// File: packages/application/src/settings/app-settings.ts
import { z } from 'zod';

import { RunPolicy, type RunPolicyInput } from '@smart-store/core';

export const loginModeSchema = z.enum(['storageState', 'persistent']);
export type LoginMode = z.infer<typeof loginModeSchema>;

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
    consecutiveFailureLimit: z.number().int().min(1).max(100).default(20),
    captureScreenshotOnFailure: z.boolean().default(true),
    captureHtmlOnFailure: z.boolean().default(true),
    selectorProfileId: z.string().trim().min(1).default('smartstore-default'),
    selectorConfigPath: z.string().trim().min(1).optional(),
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
  return appSettingsSchema.parse(input);
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
    consecutiveFailureLimit: settings.consecutiveFailureLimit,
    productsUrl: settings.productsUrl,
    captureScreenshotOnFailure: settings.captureScreenshotOnFailure,
    captureHtmlOnFailure: settings.captureHtmlOnFailure,
    selectorProfileId: settings.selectorProfileId,
    ...overrides,
  });
}
