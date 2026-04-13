// File: packages/shared/src/desktop-contracts.ts
import { z } from 'zod';

import { appSettingsSchema, type AppSettings } from '@smart-store/application';
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

export const bootStateSchema = z.object({
  settings: appSettingsSchema,
  session: z.custom<LoginSessionSnapshot>(),
  recentRuns: z.array(z.custom<BatchJobResultSnapshot>()),
  eventHistory: z.array(z.custom<RunEvent>()),
  currentJobId: z.string().trim().min(1).optional(),
});

export interface BootState {
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
  | { command: 'settings:get' }
  | { command: 'settings:save'; payload: AppSettings }
  | { command: 'session:prepare'; payload?: { initiatedBy?: string } }
  | { command: 'session:validate' }
  | { command: 'products:load'; payload?: LoadProductsInput }
  | { command: 'batch:execute'; payload: ExecuteBatchInput }
  | { command: 'batch:resume'; payload: ResumeBatchInput }
  | { command: 'batch:stop'; payload?: StopBatchInput }
  | { command: 'batch:retry'; payload: RetryFailedItemsInput }
  | { command: 'history:listRecent'; payload?: ListRecentRunsInput }
  | { command: 'history:getRunDetail'; payload: GetRunDetailInput }
  | { command: 'history:export'; payload: ExportRunReportInput }
  | { command: 'system:openPath'; payload: OpenPathInput };

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
  };
  settings: {
    get(): Promise<AppSettings>;
    save(input: AppSettings): Promise<AppSettings>;
  };
  session: {
    prepare(input?: { initiatedBy?: string }): Promise<LoginSessionSnapshot>;
    validate(): Promise<LoginSessionSnapshot>;
  };
  products: {
    load(input?: LoadProductsInput): Promise<readonly ProductSnapshot[]>;
  };
  batch: {
    execute(input: ExecuteBatchInput): Promise<BatchJobResultSnapshot>;
    resume(input: ResumeBatchInput): Promise<BatchJobResultSnapshot>;
    stop(input?: StopBatchInput): Promise<void>;
    retry(input: RetryFailedItemsInput): Promise<BatchJobResultSnapshot>;
  };
  history: {
    listRecent(input?: ListRecentRunsInput): Promise<readonly BatchJobResultSnapshot[]>;
    getRunDetail(input: GetRunDetailInput): Promise<RunDetail>;
    export(input: ExportRunReportInput): Promise<{
      targetPath: string;
      exportedFiles: readonly string[];
    }>;
  };
  system: {
    openPath(input: OpenPathInput): Promise<void>;
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
