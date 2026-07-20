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

  // 개인 크롬에 설치된 확장(작업용 브라우저 플래그 없음)은 브리지에 아예 연결하지
  // 않아야 한다. 개인 크롬 탭이 데스크톱 명령을 받아 상품을 긁어오는 사고 방지.
  it('does not poll the bridge when the profile is not the work browser', async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error('fetch must not be called');
    });
    vi.stubGlobal('fetch', fetchMock);

    try {
      const scheduledDelays: number[] = [];
      const windowRef = {
        document: { visibilityState: 'visible', hasFocus: () => true },
        setTimeout: vi.fn((_handler: TimerHandler, timeout?: number) => {
          scheduledDelays.push(timeout ?? 0);
          return 1;
        }),
        clearTimeout: vi.fn(),
        queueMicrotask: vi.fn(),
      } as unknown as Window;

      const client = new ElectronBridgeClient(
        'http://127.0.0.1:45873',
        createSellerCenterGateway(),
        createProgressStore(),
        createLogger(),
        async () => ({ ok: true, message: 'done' }),
        windowRef,
        async () => false,
      );

      client.start();

      // 재시도 예약만 하고 네트워크 요청은 하나도 보내지 않아야 한다.
      await vi.waitFor(() => {
        expect(scheduledDelays.length).toBeGreaterThan(0);
      });
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  // 대량 상품 수집처럼 오래 걸리는 명령을 실행하는 동안 하트비트가 끊기면 데스크톱이
  // 클라이언트가 죽었다고 오판해 명령을 실패 처리한다. 실행 중에도 주기적으로
  // 하트비트를 보내는지 검증한다.
  it('keeps sending heartbeats while a long command is executing', async () => {
    let resolveExecution!: (value: unknown) => void;
    const executionPromise = new Promise((resolve) => {
      resolveExecution = resolve;
    });

    const heartbeatCalls: string[] = [];
    let resultPosted = false;
    let pollCount = 0;
    const fetchMock = vi.fn(async (url: RequestInfo | URL) => {
      const href = String(url);
      if (href.includes('/bridge/heartbeat')) {
        heartbeatCalls.push(href);
        return jsonResponse({ ok: true });
      }
      if (href.includes('/bridge/commands')) {
        pollCount += 1;
        return jsonResponse({
          command:
            pollCount === 1 ? { commandId: 'cmd-1', type: 'collect-targets' } : null,
        });
      }
      if (href.includes('/bridge/command-result')) {
        resultPosted = true;
        return jsonResponse({ ok: true });
      }
      throw new Error(`unexpected url: ${href}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    try {
      const intervalCallbacks: Array<() => void> = [];
      const clearInterval = vi.fn();
      const windowRef = {
        document: {
          visibilityState: 'visible',
          hasFocus: () => true,
        },
        setTimeout: vi.fn((_handler: TimerHandler, _timeout?: number) => 1),
        clearTimeout: vi.fn(),
        setInterval: vi.fn((handler: TimerHandler) => {
          intervalCallbacks.push(handler as () => void);
          return intervalCallbacks.length;
        }),
        clearInterval,
        // 명령 완료 후 다음 tick 으로 넘어가지 않게 no-op 처리 (테스트 단순화).
        queueMicrotask: vi.fn(),
      } as unknown as Window;

      const client = new ElectronBridgeClient(
        'http://127.0.0.1:45873',
        createSellerCenterGateway(),
        createProgressStore(),
        createLogger(),
        async () => executionPromise,
        windowRef,
      );

      client.start();

      // 명령 실행이 시작되면 실행용 하트비트 인터벌이 걸려 있어야 한다.
      await vi.waitFor(() => {
        expect(intervalCallbacks.length).toBe(1);
      });

      // 인터벌이 울리면(장시간 실행 중) 하트비트가 추가로 나간다.
      const heartbeatsBefore = heartbeatCalls.length;
      intervalCallbacks[0]();
      await vi.waitFor(() => {
        expect(heartbeatCalls.length).toBe(heartbeatsBefore + 1);
      });

      // 실행이 끝나면 결과를 보고하고 인터벌을 정리한다.
      resolveExecution({ ok: true, message: 'done' });
      await vi.waitFor(() => {
        expect(resultPosted).toBe(true);
      });
      expect(clearInterval).toHaveBeenCalledWith(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

function jsonResponse(data: unknown): Response {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => data,
    text: async () => JSON.stringify(data),
  } as unknown as Response;
}

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
