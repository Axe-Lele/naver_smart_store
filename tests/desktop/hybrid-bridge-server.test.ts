import { afterEach, describe, expect, it, vi } from 'vitest';

import { HybridBridgeServer } from '../../apps/desktop-electron/src/main/hybrid-bridge-server.js';

const sellerCenterUrl = 'https://sell.smartstore.naver.com/#/products/origin-list';

let server: HybridBridgeServer | undefined;

describe('HybridBridgeServer', () => {
  afterEach(async () => {
    vi.useRealTimers();
    await server?.stop();
    server = undefined;
  });

  it('targets the product-list tab when multiple seller-center tabs are connected', async () => {
    server = new HybridBridgeServer({
      extensionBuildPath: process.cwd(),
      chromeExtensionsUrl: 'chrome://extensions',
      sellerCenterUrl,
      port: 0,
    });
    await server.start();

    const serverUrl = server.getState().serverUrl;
    await postHeartbeat(serverUrl, {
      clientId: 'product-list-tab',
      pageUrl: sellerCenterUrl,
      pageTitle: '상품 조회/수정',
      visibilityState: 'hidden',
      hasFocus: false,
    });
    await postHeartbeat(serverUrl, {
      clientId: 'other-seller-tab',
      pageUrl: 'https://sell.smartstore.naver.com/#/seller/home',
      pageTitle: '판매자센터 홈',
      visibilityState: 'visible',
      hasFocus: true,
    });

    expect(server.getState().activeClientId).toBe('product-list-tab');

    const queued = server.enqueueCommand('collect-targets');
    expect(queued.targetClientId).toBe('product-list-tab');

    await expect(pollCommand(serverUrl, 'other-seller-tab')).resolves.toEqual({
      command: null,
    });
    await expect(pollCommand(serverUrl, 'product-list-tab')).resolves.toMatchObject({
      command: {
        commandId: queued.commandId,
        type: 'collect-targets',
      },
    });
  });

  it('does not queue a batch command when no product-list tab is connected', async () => {
    server = new HybridBridgeServer({
      extensionBuildPath: process.cwd(),
      chromeExtensionsUrl: 'chrome://extensions',
      sellerCenterUrl,
      port: 0,
    });
    await server.start();

    const queued = server.enqueueCommand('start-batch', {
      selectedProductIds: ['123456'],
    });

    expect(queued.status).toBe('FAILED');
    expect(queued.targetClientId).toBeUndefined();
    expect(queued.respondedAt).toBeDefined();
    expect(queued.message).toContain('상품 조회/수정 탭');
    expect(server.getState().pendingCommands).toBe(0);
  });

  it('does not target a login tab for batch start', async () => {
    server = new HybridBridgeServer({
      extensionBuildPath: process.cwd(),
      chromeExtensionsUrl: 'chrome://extensions',
      sellerCenterUrl,
      port: 0,
    });
    await server.start();

    const serverUrl = server.getState().serverUrl;
    await postHeartbeat(serverUrl, {
      clientId: 'login-tab',
      pageUrl: 'https://sell.smartstore.naver.com/login',
      pageTitle: '로그인',
      visibilityState: 'visible',
      hasFocus: true,
    });

    const queued = server.enqueueCommand('start-batch', {
      selectedProductIds: ['123456'],
    });

    expect(queued.status).toBe('FAILED');
    expect(queued.targetClientId).toBeUndefined();
    expect(server.getState().pendingCommands).toBe(0);
    await expect(pollCommand(serverUrl, 'login-tab')).resolves.toEqual({
      command: null,
    });
  });

  it('fails an unanswered stop command after three seconds', async () => {
    server = new HybridBridgeServer({
      extensionBuildPath: process.cwd(),
      chromeExtensionsUrl: 'chrome://extensions',
      sellerCenterUrl,
      port: 0,
    });
    await server.start();

    const serverUrl = server.getState().serverUrl;
    await postHeartbeat(serverUrl, {
      clientId: 'product-list-tab',
      pageUrl: sellerCenterUrl,
      pageTitle: '상품 조회/수정',
      visibilityState: 'visible',
      hasFocus: true,
    });

    const queued = server.enqueueCommand('stop-batch');
    expect(queued.status).toBe('QUEUED');
    expect(server.getState().pendingCommands).toBe(1);

    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.now() + 3_001));

    const expiredState = server.getState();
    expect(expiredState.pendingCommands).toBe(0);
    expect(expiredState.lastCommand).toMatchObject({
      commandId: queued.commandId,
      status: 'FAILED',
    });
    expect(expiredState.lastCommand?.message).toContain('3초');
  });

  it('keeps a hidden seller-center tab connected through normal background timer delays', async () => {
    server = new HybridBridgeServer({
      extensionBuildPath: process.cwd(),
      chromeExtensionsUrl: 'chrome://extensions',
      sellerCenterUrl,
      port: 0,
    });
    await server.start();

    const serverUrl = server.getState().serverUrl;
    await postHeartbeat(serverUrl, {
      clientId: 'product-list-tab',
      pageUrl: sellerCenterUrl,
      pageTitle: '상품 조회/수정',
      visibilityState: 'hidden',
      hasFocus: false,
    });

    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.now() + 30_000));

    const hiddenState = server.getState();
    expect(hiddenState.connected).toBe(true);
    expect(hiddenState.activeClientId).toBe('product-list-tab');
  });

  it('releases a background tab long-poll as soon as a command is queued', async () => {
    server = new HybridBridgeServer({
      extensionBuildPath: process.cwd(),
      chromeExtensionsUrl: 'chrome://extensions',
      sellerCenterUrl,
      port: 0,
    });
    await server.start();

    const serverUrl = server.getState().serverUrl;
    await postHeartbeat(serverUrl, {
      clientId: 'product-list-tab',
      pageUrl: sellerCenterUrl,
      pageTitle: '상품 조회/수정',
      visibilityState: 'hidden',
      hasFocus: false,
    });

    const pollPromise = pollCommand(serverUrl, 'product-list-tab', 30_000);
    await delay(25);

    const queued = server.enqueueCommand('collect-targets');

    await expect(pollPromise).resolves.toMatchObject({
      command: {
        commandId: queued.commandId,
        type: 'collect-targets',
      },
    });
  });

  it('fails a product load command when its Chrome extension client disconnects', async () => {
    server = new HybridBridgeServer({
      extensionBuildPath: process.cwd(),
      chromeExtensionsUrl: 'chrome://extensions',
      sellerCenterUrl,
      port: 0,
    });
    await server.start();

    const serverUrl = server.getState().serverUrl;
    await postHeartbeat(serverUrl, {
      clientId: 'product-list-tab',
      pageUrl: sellerCenterUrl,
      pageTitle: '상품 조회/수정',
      visibilityState: 'visible',
      hasFocus: true,
    });

    const queued = server.enqueueCommand('collect-targets');
    await expect(pollCommand(serverUrl, 'product-list-tab')).resolves.toMatchObject({
      command: {
        commandId: queued.commandId,
        type: 'collect-targets',
      },
    });

    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.now() + 45_001));

    const disconnectedState = server.getState();
    expect(disconnectedState.connected).toBe(false);
    expect(disconnectedState.pendingCommands).toBe(0);
    expect(disconnectedState.lastCommand).toMatchObject({
      commandId: queued.commandId,
      status: 'FAILED',
    });
    expect(disconnectedState.lastCommand?.message).toContain('상품 불러오기를 취소했습니다');
    expect(disconnectedState.lastCommand?.message).toContain('Chrome 확장 연결이 끊겼습니다');
  });
});

async function postHeartbeat(
  serverUrl: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const response = await fetch(`${serverUrl}/bridge/heartbeat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });

  expect(response.ok).toBe(true);
}

async function pollCommand(
  serverUrl: string,
  clientId: string,
  waitMs?: number,
): Promise<unknown> {
  const query = new URLSearchParams({ clientId });
  if (waitMs !== undefined) {
    query.set('waitMs', String(waitMs));
  }

  const response = await fetch(
    `${serverUrl}/bridge/commands?${query.toString()}`,
  );

  expect(response.ok).toBe(true);
  return response.json();
}

function delay(delayMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}
