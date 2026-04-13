// File: apps/desktop-electron/src/renderer/helpers.ts
import type { RunEvent } from '@smart-store/application';
import type { BatchJobItemResultSnapshot } from '@smart-store/core';

export type ViewId =
  | 'dashboard'
  | 'session'
  | 'products'
  | 'batch'
  | 'results'
  | 'retry'
  | 'settings';

export type NoticeTone = 'info' | 'success' | 'error';
export type ResultBucketFilter = 'all' | 'success' | 'locked' | 'failed';

export function formatDateTime(value?: string): string {
  if (!value) {
    return '-';
  }

  return new Date(value).toLocaleString('ko-KR', {
    hour12: false,
  });
}

export function formatDuration(durationMs?: number): string {
  if (durationMs === undefined) {
    return '-';
  }

  if (durationMs < 1_000) {
    return `${durationMs} ms`;
  }

  return `${(durationMs / 1_000).toFixed(1)} s`;
}

export function normalizeProductIdsText(input: string): string[] {
  return input
    .split(/[\s,]+/)
    .map((value) => value.trim())
    .filter((value) => /^\d+$/.test(value));
}

export function normalizePositiveInt(input: string): number | undefined {
  const numeric = Number(input);

  if (!Number.isFinite(numeric) || numeric <= 0) {
    return undefined;
  }

  return Math.floor(numeric);
}

export function filterResultItems(
  items: readonly BatchJobItemResultSnapshot[],
  bucket: ResultBucketFilter,
  searchText: string,
): BatchJobItemResultSnapshot[] {
  const lowered = searchText.trim().toLowerCase();

  return items.filter((item) => {
    if (bucket !== 'all' && item.outputBucket !== bucket) {
      return false;
    }

    if (!lowered) {
      return true;
    }

    return [item.productId, item.status, item.reason, item.errorMessage]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(lowered));
  });
}

export function describeRunEvent(event: RunEvent): string {
  if (event.type === 'log') {
    return `${event.level.toUpperCase()} · ${event.message}`;
  }

  if (event.type === 'job-state') {
    return `JOB ${event.jobId} · ${event.status}${event.stopReason ? ` · ${event.stopReason}` : ''}`;
  }

  if (event.type === 'job-progress') {
    return `JOB ${event.jobId} · ${event.processedItems}/${event.totalItems} 처리 · 성공 ${event.successCount} · 잠금 ${event.lockedCount} · 실패 ${event.failedCount}`;
  }

  return `SESSION · ${event.status} · ${event.message}`;
}

export function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'object' && error !== null && 'message' in error) {
    return String((error as { message: unknown }).message);
  }

  return String(error);
}
