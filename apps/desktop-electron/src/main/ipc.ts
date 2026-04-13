// File: apps/desktop-electron/src/main/ipc.ts
import { ipcMain } from 'electron';
import { ZodError } from 'zod';

import type { SerializedDesktopError, DesktopInvokeRequest, DesktopInvokeResponse } from '@smart-store/shared';
import {
  DESKTOP_INVOKE_CHANNEL,
  parseExecuteBatchInput,
  parseExportRunReportInput,
  parseGetRunDetailInput,
  parseListRecentRunsInput,
  parseLoadProductsInput,
  parseOpenPathInput,
  parseResumeBatchInput,
  parseRetryFailedItemsInput,
  parseStopBatchInput,
} from '@smart-store/shared';

type DesktopRuntime = {
  getBootState(): Promise<unknown>;
  getSettings(): Promise<unknown>;
  saveSettings(input: unknown): Promise<unknown>;
  prepareLoginSession(input?: unknown): Promise<unknown>;
  validateSession(): Promise<unknown>;
  loadProducts(input?: unknown): Promise<unknown>;
  executeBatch(input: unknown): Promise<unknown>;
  resumeBatch(input: unknown): Promise<unknown>;
  stopBatch(input?: unknown): Promise<unknown>;
  retryFailedItems(input: unknown): Promise<unknown>;
  listRecentRuns(input?: unknown): Promise<unknown>;
  getRunDetail(input: unknown): Promise<unknown>;
  exportRunReport(input: unknown): Promise<unknown>;
  openPath(targetPath: string): Promise<unknown>;
};

export function registerDesktopIpc(
  getRuntime: () => Promise<DesktopRuntime>,
): void {
  ipcMain.handle(
    DESKTOP_INVOKE_CHANNEL,
    async (
      _event,
      request: DesktopInvokeRequest,
    ): Promise<DesktopInvokeResponse<unknown>> => {
      try {
        const runtime = await getRuntime();

        switch (request.command) {
          case 'app:getBootState':
            return ok(await runtime.getBootState());
          case 'settings:get':
            return ok(await runtime.getSettings());
          case 'settings:save':
            return ok(await runtime.saveSettings(request.payload));
          case 'session:prepare':
            return ok(await runtime.prepareLoginSession(request.payload));
          case 'session:validate':
            return ok(await runtime.validateSession());
          case 'products:load':
            return ok(await runtime.loadProducts(parseLoadProductsInput(request.payload)));
          case 'batch:execute':
            return ok(await runtime.executeBatch(parseExecuteBatchInput(request.payload)));
          case 'batch:resume':
            return ok(await runtime.resumeBatch(parseResumeBatchInput(request.payload)));
          case 'batch:stop':
            return ok(await runtime.stopBatch(parseStopBatchInput(request.payload)));
          case 'batch:retry':
            return ok(await runtime.retryFailedItems(parseRetryFailedItemsInput(request.payload)));
          case 'history:listRecent':
            return ok(await runtime.listRecentRuns(parseListRecentRunsInput(request.payload)));
          case 'history:getRunDetail':
            return ok(await runtime.getRunDetail(parseGetRunDetailInput(request.payload)));
          case 'history:export':
            return ok(await runtime.exportRunReport(parseExportRunReportInput(request.payload)));
          case 'system:openPath':
            return ok(await runtime.openPath(parseOpenPathInput(request.payload).targetPath));
          default:
            return fail({
              code: 'UNKNOWN_COMMAND',
              message: `Unknown desktop IPC command: ${(request as { command?: string }).command ?? 'unknown'}`,
            });
        }
      } catch (error) {
        return fail(serializeDesktopError(error));
      }
    },
  );
}

function ok<T>(data: T): DesktopInvokeResponse<T> {
  return {
    ok: true,
    data,
  };
}

function fail(error: SerializedDesktopError): DesktopInvokeResponse<never> {
  return {
    ok: false,
    error,
  };
}

function serializeDesktopError(error: unknown): SerializedDesktopError {
  if (error instanceof ZodError) {
    return {
      code: 'VALIDATION_ERROR',
      message: 'The desktop request payload was invalid.',
      details: error.issues.map((issue) => issue.message).join('\n'),
      stack: error.stack,
    };
  }

  if (isErrorWithCode(error)) {
    return {
      code: error.code,
      message: error.message,
      details: 'recoveryCommand' in error ? String(error.recoveryCommand ?? '') : undefined,
      stack: error.stack,
      recoveryCommand:
        'recoveryCommand' in error ? String(error.recoveryCommand ?? '') : undefined,
      session: 'session' in error ? serializeSessionLike(error.session) : undefined,
    };
  }

  if (error instanceof Error) {
    return {
      code: error.name || 'DESKTOP_RUNTIME_ERROR',
      message: error.message,
      stack: error.stack,
    };
  }

  return {
    code: 'UNKNOWN_ERROR',
    message: String(error),
  };
}

function isErrorWithCode(
  value: unknown,
): value is Error & {
  code: string;
  recoveryCommand?: string;
  session?: unknown;
} {
  return (
    value instanceof Error &&
    'code' in value &&
    typeof (value as { code?: unknown }).code === 'string'
  );
}

function serializeSessionLike(value: unknown) {
  if (
    typeof value === 'object' &&
    value !== null &&
    'toSnapshot' in value &&
    typeof (value as { toSnapshot?: unknown }).toSnapshot === 'function'
  ) {
    return (value as { toSnapshot(): unknown }).toSnapshot() as {
      storageStatePath: string;
      status:
        | 'ACCESS_DENIED'
        | 'CHALLENGE_REQUIRED'
        | 'LOGIN_REQUIRED'
        | 'UNKNOWN'
        | 'READY'
        | 'MISSING'
        | 'EXPIRED'
        | 'INVALID';
    };
  }

  return (
    typeof value === 'object' &&
    value !== null &&
    'storageStatePath' in value &&
    'status' in value
  )
    ? (value as {
        storageStatePath: string;
        status:
          | 'ACCESS_DENIED'
          | 'CHALLENGE_REQUIRED'
          | 'LOGIN_REQUIRED'
          | 'UNKNOWN'
          | 'READY'
          | 'MISSING'
          | 'EXPIRED'
          | 'INVALID';
      })
    : undefined;
}
