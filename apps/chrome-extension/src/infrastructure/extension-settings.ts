// Path: C:\smart-store\apps\chrome-extension\src\infrastructure\extension-settings.ts
import { z } from "zod";
import {
  DEFAULT_REQUIRED_OPTIONS,
  DEFAULT_RUN_POLICY,
  type RequiredOption,
  type RunPolicy,
} from "../domain/index.js";

const RequiredOptionSchema = z.object({
  name: z.string().trim().min(1).max(80),
  value: z.string().trim().min(1).max(200),
});

export const ExtensionSettingsSchema = z.object({
  sellerCenterOrigin: z.string().url().default("https://sell.smartstore.naver.com"),
  hybridBridgeUrl: z.string().url().default("http://127.0.0.1:45873"),
  timezone: z.literal("Asia/Seoul").default("Asia/Seoul"),
  delayMs: z.number().int().min(0).max(60_000).default(DEFAULT_RUN_POLICY.delayMs),
  maxItems: z
    .number()
    .int()
    .positive()
    .max(5_000)
    .nullable()
    .default(DEFAULT_RUN_POLICY.maxItems),
  stopOnConsecutiveFailures: z
    .number()
    .int()
    .positive()
    .max(100)
    .default(DEFAULT_RUN_POLICY.stopOnConsecutiveFailures),
  allowAutoApplyBundleFilter: z.boolean().default(false),
  progressStorageKey: z
    .string()
    .min(1)
    .default("smartstore.bundle-preorder.progress"),
  batchStorageKey: z.string().min(1).default("smartstore.bundle-preorder.batch"),
  selectorProfileId: z
    .string()
    .min(1)
    .default("smartstore-seller-center-unverified"),
  requiredOptions: z
    .array(RequiredOptionSchema)
    .min(1)
    .max(20)
    .default(() => DEFAULT_REQUIRED_OPTIONS.map((option) => ({ ...option }))),
});

export type ExtensionSettings = z.infer<typeof ExtensionSettingsSchema>;

export const defaultExtensionSettings: ExtensionSettings =
  ExtensionSettingsSchema.parse({});

export function normalizeRequiredOptions(
  options?: readonly RequiredOption[] | null,
): RequiredOption[] {
  const parsed = z
    .array(RequiredOptionSchema)
    .min(1)
    .max(20)
    .safeParse(options);

  return parsed.success
    ? parsed.data
    : DEFAULT_REQUIRED_OPTIONS.map((option) => ({ ...option }));
}

export function buildExtensionSettings(
  overrides: Partial<ExtensionSettings> = {},
): ExtensionSettings {
  return ExtensionSettingsSchema.parse({
    ...defaultExtensionSettings,
    ...overrides,
  });
}

export function toRunPolicy(
  settings: ExtensionSettings,
  dryRun: boolean,
): RunPolicy {
  return {
    dryRun,
    delayMs: settings.delayMs,
    maxItems: settings.maxItems,
    retryFailedOnly: false,
    resumeFromCheckpoint: true,
    stopOnConsecutiveFailures: settings.stopOnConsecutiveFailures,
    timezone: settings.timezone,
    requiredOptions: normalizeRequiredOptions(settings.requiredOptions),
  };
}
