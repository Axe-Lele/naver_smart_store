// File: packages/application/src/ports/run-event.port.ts
import type { BatchJobId, BatchJobStatus, LoginSessionStatus } from '@smart-store/core';

export type RunLogLevel = 'debug' | 'info' | 'warn' | 'error';

export type RunEvent =
  | {
      type: 'log';
      createdAt: string;
      level: RunLogLevel;
      message: string;
      jobId?: string;
      context?: Readonly<Record<string, string | number | boolean | null>>;
    }
  | {
      type: 'job-state';
      createdAt: string;
      jobId: string;
      status: BatchJobStatus;
      stopReason?: string;
    }
  | {
      type: 'job-progress';
      createdAt: string;
      jobId: string;
      processedItems: number;
      totalItems: number;
      successCount: number;
      lockedCount: number;
      failedCount: number;
    }
  | {
      type: 'session-state';
      createdAt: string;
      status: LoginSessionStatus;
      message: string;
    };

export interface RunEventPublisherPort {
  publish(event: RunEvent): Promise<void> | void;
}

export const noopRunEventPublisher: RunEventPublisherPort = {
  publish: async () => undefined,
};
