// File: packages/shared/src/desktop-contracts.ts
import { z } from 'zod';

import {
  appSettingsSchema,
  preorderRequiredOptionSchema,
  type AppSettings,
} from '@smart-store/application';
import type { RunEvent } from '@smart-store/application';
import {
  batchJobIdPrimitiveSchema,
  productIdPrimitiveSchema,
  productStatusSchema,
  type BatchJobItemResultSnapshot,
  type BatchJobResultSnapshot,
  type BatchJobSnapshot,
  type LoginSessionSnapshot,
  type ProductSnapshot,
} from '@smart-store/core';

export const DESKTOP_INVOKE_CHANNEL = 'desktop:invoke';
export const DESKTOP_EVENT_CHANNEL = 'desktop:event';

export const loadProductsInputSchema = z.object({
  searchText: z.string().trim().optional(),
  productIds: z.array(productIdPrimitiveSchema).optional(),
  statuses: z.array(productStatusSchema).optional(),
  limit: z.number().int().min(1).max(500).optional(),
});
export type LoadProductsInput = z.output<typeof loadProductsInputSchema>;

export const executeBatchInputSchema = z.object({
  selectedProductIds: z.array(productIdPrimitiveSchema).min(1),
  dryRun: z.boolean().default(false),
  requestedBy: z.string().trim().min(1).optional(),
});
export type ExecuteBatchInput = z.output<typeof executeBatchInputSchema>;

export const resumeBatchInputSchema = z.object({
  jobId: batchJobIdPrimitiveSchema,
});
export type ResumeBatchInput = z.output<typeof resumeBatchInputSchema>;

export const stopBatchInputSchema = z.object({
  jobId: batchJobIdPrimitiveSchema.optional(),
  reason: z.string().trim().min(1).optional(),
});
export type StopBatchInput = z.output<typeof stopBatchInputSchema>;

export const retryFailedItemsInputSchema = z.object({
  jobId: batchJobIdPrimitiveSchema,
  dryRun: z.boolean().default(false),
  includeAllFailed: z.boolean().default(false),
  requestedBy: z.string().trim().min(1).optional(),
});
export type RetryFailedItemsInput = z.output<typeof retryFailedItemsInputSchema>;

export const listRecentRunsInputSchema = z.object({
  limit: z.number().int().min(1).max(100).optional(),
});
export type ListRecentRunsInput = z.output<typeof listRecentRunsInputSchema>;

export const getRunDetailInputSchema = z.object({
  jobId: batchJobIdPrimitiveSchema,
});
export type GetRunDetailInput = z.output<typeof getRunDetailInputSchema>;

export const exportRunReportInputSchema = z.object({
  jobId: batchJobIdPrimitiveSchema,
  targetPath: z.string().trim().min(1).optional(),
});
export type ExportRunReportInput = z.output<typeof exportRunReportInputSchema>;

export const openPathInputSchema = z.object({
  targetPath: z.string().trim().min(1),
});
export type OpenPathInput = z.output<typeof openPathInputSchema>;

export const copyTextInputSchema = z.object({
  text: z.string(),
});
export type CopyTextInput = z.output<typeof copyTextInputSchema>;

export const updateSettingsInputSchema = appSettingsSchema;
export type UpdateSettingsInput = z.output<typeof updateSettingsInputSchema>;

export const hybridCommandTypeSchema = z.enum([
  'check-surface',
  'run-dom-inspection',
  'collect-targets',
  'run-dry-run',
  'start-batch',
  'resume-batch',
  'stop-batch',
]);
export type HybridCommandType = z.output<typeof hybridCommandTypeSchema>;

export const hybridCommandPayloadSchema = z.object({
  selectedProductIds: z.array(productIdPrimitiveSchema).optional(),
  preorderRequiredOptions: z.array(preorderRequiredOptionSchema).min(1).max(20).optional(),
});
export type HybridCommandPayload = z.output<typeof hybridCommandPayloadSchema>;

export const hybridSendCommandInputSchema = z.object({
  type: hybridCommandTypeSchema,
  payload: hybridCommandPayloadSchema.optional(),
});
export type HybridSendCommandInput = z.output<typeof hybridSendCommandInputSchema>;

export interface HybridBridgeClientState {
  clientId: string;
  pageUrl: string;
  pageTitle: string;
  lastHeartbeatAt: string;
  visibilityState?: string;
  hasFocus?: boolean;
  pageRole?: 'product-list' | 'product-edit' | 'login' | 'seller-center' | 'other';
  progress?: unknown;
}

export interface HybridBridgeCommandState {
  commandId: string;
  type: HybridCommandType;
  payload?: HybridCommandPayload;
  status: 'QUEUED' | 'COMPLETED' | 'FAILED';
  queuedAt: string;
  respondedAt?: string;
  targetClientId?: string;
  message?: string;
  response?: unknown;
}

export interface HybridBridgeState {
  serverUrl: string;
  connected: boolean;
  activeClientId?: string;
  activeClient?: HybridBridgeClientState;
  clients: readonly HybridBridgeClientState[];
  pendingCommands: number;
  lastCommand?: HybridBridgeCommandState;
  extensionBuildPath: string;
  extensionPackageAvailable: boolean;
  chromeExtensionsUrl: string;
  sellerCenterUrl: string;
  lastError?: string;
}

export const bootStateSchema = z.object({
  appInfo: z.object({
    name: z.string().min(1),
    version: z.string().min(1),
    packaged: z.boolean(),
  }),
  settings: appSettingsSchema,
  session: z.custom<LoginSessionSnapshot>(),
  recentRuns: z.array(z.custom<BatchJobResultSnapshot>()),
  eventHistory: z.array(z.custom<RunEvent>()),
  currentJobId: z.string().trim().min(1).optional(),
});

export interface BootState {
  appInfo: {
    name: string;
    version: string;
    packaged: boolean;
  };
  settings: AppSettings;
  session: LoginSessionSnapshot;
  recentRuns: readonly BatchJobResultSnapshot[];
  eventHistory: readonly RunEvent[];
  currentJobId?: string;
}

export interface RunDetail {
  job: BatchJobSnapshot | null;
  result: BatchJobResultSnapshot | null;
  itemResults: readonly BatchJobItemResultSnapshot[];
}

export interface SerializedDesktopError {
  code: string;
  message: string;
  details?: string;
  stack?: string;
  recoveryCommand?: string;
  session?: LoginSessionSnapshot;
}

export type DesktopInvokeRequest =
  | { command: 'app:getBootState' }
  | { command: 'app:updateSettings'; payload: UpdateSettingsInput }
  | { command: 'hybrid:getState' }
  | { command: 'hybrid:sendCommand'; payload: HybridSendCommandInput }
  | { command: 'hybrid:openChromeExtensions' }
  | { command: 'hybrid:openSellerCenter' }
  | { command: 'system:openPath'; payload: OpenPathInput }
  | { command: 'system:copyText'; payload: CopyTextInput };

export type DesktopInvokeResponse<T> =
  | {
      ok: true;
      data: T;
    }
  | {
      ok: false;
      error: SerializedDesktopError;
    };

export interface DesktopApi {
  app: {
    getBootState(): Promise<BootState>;
    updateSettings(input: UpdateSettingsInput): Promise<AppSettings>;
  };
  hybrid: {
    getState(): Promise<HybridBridgeState>;
    sendCommand(input: HybridSendCommandInput): Promise<HybridBridgeCommandState>;
    openChromeExtensions(): Promise<void>;
    openSellerCenter(): Promise<void>;
  };
  system: {
    openPath(input: OpenPathInput): Promise<void>;
    copyText(input: CopyTextInput): Promise<void>;
  };
  events: {
    subscribe(listener: (event: RunEvent) => void): () => void;
  };
}

export function parseLoadProductsInput(input: unknown): LoadProductsInput {
  return loadProductsInputSchema.parse(input ?? {});
}

export function parseExecuteBatchInput(input: unknown): ExecuteBatchInput {
  return executeBatchInputSchema.parse(input);
}

export function parseResumeBatchInput(input: unknown): ResumeBatchInput {
  return resumeBatchInputSchema.parse(input);
}

export function parseStopBatchInput(input: unknown): StopBatchInput {
  return stopBatchInputSchema.parse(input ?? {});
}

export function parseRetryFailedItemsInput(input: unknown): RetryFailedItemsInput {
  return retryFailedItemsInputSchema.parse(input);
}

export function parseListRecentRunsInput(input: unknown): ListRecentRunsInput {
  return listRecentRunsInputSchema.parse(input ?? {});
}

export function parseGetRunDetailInput(input: unknown): GetRunDetailInput {
  return getRunDetailInputSchema.parse(input);
}

export function parseExportRunReportInput(input: unknown): ExportRunReportInput {
  return exportRunReportInputSchema.parse(input);
}

export function parseOpenPathInput(input: unknown): OpenPathInput {
  return openPathInputSchema.parse(input);
}

export function parseCopyTextInput(input: unknown): CopyTextInput {
  return copyTextInputSchema.parse(input);
}

export function parseUpdateSettingsInput(input: unknown): UpdateSettingsInput {
  return updateSettingsInputSchema.parse(input);
}

export function parseHybridSendCommandInput(input: unknown): HybridSendCommandInput {
  return hybridSendCommandInputSchema.parse(input);
}
