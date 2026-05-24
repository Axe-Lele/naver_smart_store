import { describe, expect, it, vi } from 'vitest';

import type {
  LoggerPort,
  ProgressSnapshot,
  ProgressStorePort,
  SellerCenterPageGatewayPort,
} from '../../apps/chrome-extension/src/application/index.js';
import { ElectronBridgeClient } from '../../apps/chrome-extension/src/infrastructure/electron-bridge.client.js';

const EMPTY_PROGRESS: ProgressSnapshot = {
  phase: 'idle',
  updatedAt: new Date(0).toISOString(),
  targetCount: 0,
  completedCount: 0,
  results: [],
  logs: [],
};

describe('ElectronBridgeClient', () => {
  it('stops polling when Chrome invalidates the old extension context', async () => {
    const setTimeout = vi.fn((_handler: TimerHandler, _timeout?: number) => 1);
    const logger = createLogger();
    const progressStore = createProgressStore({
      load: async () => {
        throw new Error('Extension context invalidated.');
      },
    });
    const client = new ElectronBridgeClient(
      'http://127.0.0.1:45873',
      createSellerCenterGateway(),
      progressStore,
      logger,
      async () => ({ ok: true, message: 'done' }),
      {
        document: {
          visibilityState: 'visible',
          hasFocus: () => true,
        },
        setTimeout,
        clearTimeout: vi.fn(),
      } as unknown as Window,
    );

    client.start();

    await vi.waitFor(() => {
      expect(logger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Chrome extension context was invalidated'),
        expect.objectContaining({
          name: 'Error',
          message: 'Extension context invalidated.',
        }),
      );
    });

    expect(logger.warn).not.toHaveBeenCalled();
    expect(setTimeout).not.toHaveBeenCalled();
  });
});

function createLogger(): LoggerPort {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

function createProgressStore(overrides?: {
  load?: () => Promise<ProgressSnapshot>;
}): ProgressStorePort {
  return {
    load: vi.fn(overrides?.load ?? (async () => EMPTY_PROGRESS)),
    save: vi.fn(async (_snapshot: ProgressSnapshot) => {}),
    appendLog: vi.fn(async () => {}),
    reset: vi.fn(async () => {}),
  };
}

function createSellerCenterGateway(): SellerCenterPageGatewayPort {
  return {
    getPageTitle: () => '상품 조회/수정',
    getPageUrl: () => 'https://sell.smartstore.naver.com/#/products/origin-list',
    isSellerCenterSurface: () => true,
    captureHtmlSnapshot: () => '',
    getBodyText: () => '',
  };
}
