// File: apps/desktop-electron/src/main/hybrid-bridge-server.ts
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';

import type {
  HybridBridgeClientState,
  HybridBridgeCommandState,
  HybridBridgeState,
  HybridCommandPayload,
  HybridCommandType,
} from '@smart-store/shared';

const DEFAULT_BRIDGE_HOST = '127.0.0.1';
const DEFAULT_BRIDGE_PORT = 45873;
const CLIENT_STALE_MS = 20_000;
const CLAIM_STALE_MS = 30_000;
const DEFAULT_COMMAND_STALE_MS = 90_000;
const STOP_COMMAND_STALE_MS = 3_000;

type HybridHeartbeatPayload = {
  clientId: string;
  pageUrl: string;
  pageTitle: string;
  visibilityState?: string;
  hasFocus?: boolean;
  progress?: unknown;
};

type HybridCommandPollResponse = {
  command: {
    commandId: string;
    type: HybridCommandType;
    payload?: HybridCommandPayload;
  } | null;
};

type HybridCommandResultPayload = {
  clientId: string;
  commandId: string;
  ok: boolean;
  message?: string;
  response?: unknown;
};

type ClientRecord = HybridBridgeClientState & {
  receivedAt: number;
};

type CommandRecord = HybridBridgeCommandState & {
  claimedByClientId?: string;
  claimedAt?: number;
};

export class HybridBridgeServer {
  private server?: Server;

  private startPromise?: Promise<void>;

  private readonly clients = new Map<string, ClientRecord>();

  private readonly commands: CommandRecord[] = [];

  private lastError?: string;

  private boundPort?: number;

  constructor(
    private readonly options: {
      extensionBuildPath: string;
      chromeExtensionsUrl: string;
      sellerCenterUrl: string;
      host?: string;
      port?: number;
    },
  ) {}

  async start(): Promise<void> {
    if (this.server) {
      return;
    }

    if (this.startPromise) {
      return this.startPromise;
    }

    const host = this.options.host ?? DEFAULT_BRIDGE_HOST;
    const port = this.options.port ?? DEFAULT_BRIDGE_PORT;

    this.startPromise = new Promise<void>((resolve, reject) => {
      const server = createServer((request, response) => {
        void this.handleRequest(request, response);
      });

      server.on('error', (error) => {
        this.lastError = error instanceof Error ? error.message : String(error);
        reject(error);
      });

      server.listen(port, host, () => {
        this.server = server;
        const address = server.address();
        this.boundPort =
          typeof address === 'object' && address !== null ? address.port : port;
        this.lastError = undefined;
        resolve();
      });
    })
      .catch((error) => {
        this.startPromise = undefined;
        throw error;
      })
      .finally(() => {
        this.startPromise = undefined;
      });

    return this.startPromise;
  }

  async stop(): Promise<void> {
    if (!this.server) {
      return;
    }

    await new Promise<void>((resolve, reject) => {
      this.server?.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });

    this.server = undefined;
    this.boundPort = undefined;
  }

  getState(): HybridBridgeState {
    this.pruneStaleState();
    const clients = this.getPreferredClients()
      .map(({ receivedAt: _receivedAt, ...client }) => client);
    const activeClient = clients[0];
    const lastCommand = this.commands[0]
      ? this.toPublicCommandState(this.commands[0])
      : undefined;

    return {
      serverUrl: this.getServerUrl(),
      connected: Boolean(activeClient),
      activeClientId: activeClient?.clientId,
      activeClient,
      clients,
      pendingCommands: this.commands.filter((command) => command.status === 'QUEUED').length,
      lastCommand,
      extensionBuildPath: this.options.extensionBuildPath,
      extensionPackageAvailable: existsSync(
        `${this.options.extensionBuildPath}/manifest.json`,
      ),
      chromeExtensionsUrl: this.options.chromeExtensionsUrl,
      sellerCenterUrl: this.options.sellerCenterUrl,
      lastError: this.lastError,
    };
  }

  enqueueCommand(
    type: HybridCommandType,
    payload?: HybridCommandPayload,
  ): HybridBridgeCommandState {
    this.pruneStaleState();

    const activeClientId = this.getTargetClientIdForCommand(type);
    const queuedAt = new Date().toISOString();
    const command: CommandRecord = {
      commandId: randomUUID(),
      type,
      payload,
      status: activeClientId ? 'QUEUED' : 'FAILED',
      queuedAt,
      respondedAt: activeClientId ? undefined : queuedAt,
      targetClientId: activeClientId,
      message: activeClientId
        ? describeHybridCommand(type)
        : getMissingTargetMessage(type),
    };

    this.commands.unshift(command);
    return this.toPublicCommandState(command);
  }

  private async handleRequest(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    this.writeCorsHeaders(response);

    if (request.method === 'OPTIONS') {
      response.writeHead(204);
      response.end();
      return;
    }

    const url = new URL(request.url ?? '/', this.getServerUrl());

    try {
      if (request.method === 'POST' && url.pathname === '/bridge/heartbeat') {
        await this.handleHeartbeat(request, response);
        return;
      }

      if (request.method === 'GET' && url.pathname === '/bridge/commands') {
        this.handleCommandPoll(url, response);
        return;
      }

      if (request.method === 'POST' && url.pathname === '/bridge/command-result') {
        await this.handleCommandResult(request, response);
        return;
      }

      response.writeHead(404, { 'content-type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify({ message: 'Not found.' }));
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      response.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
      response.end(
        JSON.stringify({
          message: this.lastError,
        }),
      );
    }
  }

  private async handleHeartbeat(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    const payload = await this.readJsonBody<HybridHeartbeatPayload>(request);

    if (!payload.clientId || !payload.pageUrl || !payload.pageTitle) {
      response.writeHead(400, { 'content-type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify({ message: 'Invalid heartbeat payload.' }));
      return;
    }

    const now = Date.now();
    this.clients.set(payload.clientId, {
      clientId: payload.clientId,
      pageUrl: payload.pageUrl,
      pageTitle: payload.pageTitle,
      visibilityState: payload.visibilityState,
      hasFocus: payload.hasFocus,
      pageRole: classifyClientPage(payload),
      lastHeartbeatAt: new Date(now).toISOString(),
      progress: payload.progress,
      receivedAt: now,
    });
    this.pruneStaleState();

    response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    response.end(
      JSON.stringify({
        ok: true,
        activeClientId: this.getActiveClientId(),
      }),
    );
  }

  private handleCommandPoll(url: URL, response: ServerResponse): void {
    const clientId = url.searchParams.get('clientId');

    if (!clientId) {
      response.writeHead(400, { 'content-type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify({ message: 'clientId is required.' }));
      return;
    }

    const command = this.claimNextCommand(clientId);
    const payload: HybridCommandPollResponse = {
      command: command
        ? {
            commandId: command.commandId,
            type: command.type,
            payload: command.payload,
          }
        : null,
    };

    response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify(payload));
  }

  private async handleCommandResult(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    const payload = await this.readJsonBody<HybridCommandResultPayload>(request);
    const command = this.commands.find(
      (item) => item.commandId === payload.commandId,
    );

    if (!command) {
      response.writeHead(404, { 'content-type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify({ message: 'Command not found.' }));
      return;
    }

    command.status = payload.ok ? 'COMPLETED' : 'FAILED';
    command.respondedAt = new Date().toISOString();
    command.targetClientId = payload.clientId;
    command.message = payload.message ?? command.message;
    command.response = payload.response;
    command.claimedByClientId = undefined;
    command.claimedAt = undefined;

    response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    response.end(
      JSON.stringify({
        ok: true,
        command: this.toPublicCommandState(command),
      }),
    );
  }

  private claimNextCommand(clientId: string): CommandRecord | null {
    this.pruneStaleState();
    const activeClientId = this.getActiveClientId();
    const now = Date.now();

    for (const command of this.commands) {
      if (command.status !== 'QUEUED') {
        continue;
      }

      if (
        command.claimedByClientId &&
        command.claimedAt &&
        now - command.claimedAt < CLAIM_STALE_MS
      ) {
        continue;
      }

      if (command.targetClientId && command.targetClientId !== clientId) {
        continue;
      }

      if (!command.targetClientId && activeClientId && activeClientId !== clientId) {
        continue;
      }

      command.claimedByClientId = clientId;
      command.claimedAt = now;
      command.targetClientId = clientId;
      return command;
    }

    return null;
  }

  private pruneStaleState(): void {
    const now = Date.now();
    const staleClientIds = new Set<string>();

    for (const [clientId, client] of this.clients.entries()) {
      if (now - client.receivedAt > CLIENT_STALE_MS) {
        this.clients.delete(clientId);
        staleClientIds.add(clientId);
      }
    }

    const connectedClientIds = new Set(this.clients.keys());

    for (const command of this.commands) {
      if (command.status !== 'QUEUED') {
        continue;
      }

      if (now - Date.parse(command.queuedAt) > getCommandStaleMs(command.type)) {
        command.status = 'FAILED';
        command.respondedAt = new Date(now).toISOString();
        command.claimedByClientId = undefined;
        command.claimedAt = undefined;
        command.message = getCommandTimeoutMessage(command.type);
        continue;
      }

      if (
        command.claimedByClientId &&
        command.claimedAt &&
        now - command.claimedAt > CLAIM_STALE_MS
      ) {
        command.claimedByClientId = undefined;
        command.claimedAt = undefined;
      }

      if (
        command.targetClientId &&
        (staleClientIds.has(command.targetClientId) ||
          !connectedClientIds.has(command.targetClientId))
      ) {
        command.targetClientId = undefined;
        command.claimedByClientId = undefined;
        command.claimedAt = undefined;
      }
    }
  }

  private getActiveClientId(): string | undefined {
    return this.getPreferredClients()[0]?.clientId;
  }

  private getTargetClientIdForCommand(type: HybridCommandType): string | undefined {
    const client = this.getPreferredClients(type)[0];
    if (!client) {
      return undefined;
    }

    const pageRole = client.pageRole ?? classifyClientPage(client);
    if (requiresProductListClient(type) && pageRole !== 'product-list') {
      return undefined;
    }

    if (requiresProductWorkClient(type) && pageRole !== 'product-list' && pageRole !== 'product-edit') {
      return undefined;
    }

    return client.clientId;
  }

  private getPreferredClients(type?: HybridCommandType): ClientRecord[] {
    return [...this.clients.values()].sort((left, right) => {
      const scoreDelta = scoreClientForCommand(right, type) - scoreClientForCommand(left, type);
      if (scoreDelta !== 0) {
        return scoreDelta;
      }

      return right.receivedAt - left.receivedAt;
    });
  }

  private getServerUrl(): string {
    const host = this.options.host ?? DEFAULT_BRIDGE_HOST;
    const port = this.boundPort ?? this.options.port ?? DEFAULT_BRIDGE_PORT;
    return `http://${host}:${port}`;
  }

  private async readJsonBody<T>(request: IncomingMessage): Promise<T> {
    const chunks: Buffer[] = [];

    for await (const chunk of request) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }

    const raw = Buffer.concat(chunks).toString('utf8');
    if (!raw) {
      return {} as T;
    }

    return JSON.parse(raw) as T;
  }

  private writeCorsHeaders(response: ServerResponse): void {
    response.setHeader('access-control-allow-origin', '*');
    response.setHeader('access-control-allow-methods', 'GET,POST,OPTIONS');
    response.setHeader('access-control-allow-headers', 'content-type');
  }

  private toPublicCommandState(command: CommandRecord): HybridBridgeCommandState {
    return {
      commandId: command.commandId,
      type: command.type,
      payload: command.payload,
      status: command.status,
      queuedAt: command.queuedAt,
      respondedAt: command.respondedAt,
      targetClientId: command.targetClientId,
      message: command.message,
      response: command.response,
    };
  }
}

function getCommandStaleMs(type: HybridCommandType): number {
  return type === 'stop-batch' ? STOP_COMMAND_STALE_MS : DEFAULT_COMMAND_STALE_MS;
}

function getCommandTimeoutMessage(type: HybridCommandType): string {
  if (type === 'stop-batch') {
    return '중단 요청에 3초 동안 응답이 없습니다. 확장프로그램이 꺼졌거나 Chrome 탭 연결이 끊겼을 수 있습니다. 판매자센터 탭을 새로고침한 뒤 상태를 확인해 주세요.';
  }

  return 'Chrome 탭이 요청에 응답하지 않았습니다. 판매자센터 상품 목록 탭을 새로고침한 뒤 다시 실행해 주세요.';
}

function describeHybridCommand(type: HybridCommandType): string {
  switch (type) {
    case 'check-surface':
      return '현재 Chrome 탭이 판매자센터 작업 표면인지 확인합니다.';
    case 'run-dom-inspection':
      return '현재 판매자센터 DOM 구조를 점검합니다.';
    case 'collect-targets':
      return '묶음배송 검색 결과 대상 상품을 수집합니다.';
    case 'run-dry-run':
      return '저장 없이 dry-run 미리보기를 실행합니다.';
    case 'start-batch':
      return '실제 예약구매 설정 배치를 시작합니다.';
    case 'resume-batch':
      return '중단된 배치를 체크포인트에서 다시 시작합니다.';
    case 'stop-batch':
      return '현재 배치 실행을 중단 요청합니다.';
  }
}

function getMissingTargetMessage(type: HybridCommandType): string {
  if (requiresProductListClient(type)) {
    return 'Chrome 판매자센터 상품 조회/수정 탭이 연결되어 있지 않습니다. 상품 목록 탭을 열고 Ctrl+R로 새로고침한 뒤 다시 실행해 주세요.';
  }

  if (requiresProductWorkClient(type)) {
    return 'Chrome 판매자센터 상품 탭이 연결되어 있지 않습니다. 상품 목록 또는 상품 수정 탭을 열고 Ctrl+R로 새로고침한 뒤 다시 실행해 주세요.';
  }

  return 'Chrome 판매자센터 탭이 연결되어 있지 않습니다. 판매자센터 탭을 열고 Ctrl+R로 새로고침한 뒤 다시 실행해 주세요.';
}

function requiresProductListClient(type: HybridCommandType): boolean {
  return type === 'collect-targets' || type === 'run-dry-run' || type === 'start-batch';
}

function requiresProductWorkClient(type: HybridCommandType): boolean {
  return type === 'resume-batch' || type === 'stop-batch';
}

function scoreClientForCommand(
  client: HybridBridgeClientState,
  type?: HybridCommandType,
): number {
  const pageRole = client.pageRole ?? classifyClientPage(client);
  let score = 0;

  if (pageRole === 'product-list') {
    score += 1_000;
  } else if (pageRole === 'product-edit') {
    score += 500;
  } else if (pageRole === 'seller-center') {
    score += 100;
  } else if (pageRole === 'login') {
    score -= 100;
  }

  if (client.visibilityState === 'visible') {
    score += 50;
  }

  if (client.hasFocus) {
    score += 25;
  }

  switch (type) {
    case 'collect-targets':
    case 'run-dry-run':
    case 'start-batch':
      if (pageRole === 'product-list') {
        score += 1_000;
      } else if (pageRole !== 'seller-center') {
        score -= 500;
      }
      break;
    case 'run-dom-inspection':
    case 'check-surface':
      if (pageRole === 'product-list' || pageRole === 'product-edit') {
        score += 300;
      }
      break;
    case 'resume-batch':
    case 'stop-batch':
      if (pageRole === 'product-list' || pageRole === 'product-edit') {
        score += 300;
      }
      break;
  }

  return score;
}

function classifyClientPage(input: {
  pageUrl?: string;
  pageTitle?: string;
}): HybridBridgeClientState['pageRole'] {
  const pageUrl = (input.pageUrl ?? '').toLowerCase();
  const pageTitle = (input.pageTitle ?? '').toLowerCase();

  if (pageUrl.includes('login') || pageTitle.includes('로그인')) {
    return 'login';
  }

  if (
    pageUrl.includes('origin-edit') ||
    pageUrl.includes('product-edit') ||
    pageUrl.includes('/edit')
  ) {
    return 'product-edit';
  }

  if (
    pageUrl.includes('origin-list') ||
    pageUrl.includes('product-list') ||
    pageUrl.includes('/products')
  ) {
    return 'product-list';
  }

  if (pageUrl.includes('sell.smartstore.naver.com')) {
    return 'seller-center';
  }

  return 'other';
}
