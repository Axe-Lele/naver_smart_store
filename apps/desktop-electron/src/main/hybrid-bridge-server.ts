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
const CLIENT_STALE_MS = 45_000;
const CLAIM_STALE_MS = 30_000;
const DEFAULT_COMMAND_STALE_MS = 90_000;
const STOP_COMMAND_STALE_MS = 3_000;
// 클레임한 클라이언트가 하트비트를 유지하는 동안에는 명령을 시간 초과로 실패시키지
// 않지만(대량 상품 수집은 수 분씩 걸린다), 무한정 매달리지 않도록 이 절대 상한은 둔다.
const CLAIMED_COMMAND_MAX_AGE_MS = 30 * 60_000;
const MAX_COMMAND_POLL_WAIT_MS = 30_000;

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

type PendingCommandPoll = {
  clientId: string;
  response: ServerResponse;
  timeoutId: ReturnType<typeof setTimeout>;
};

export class HybridBridgeServer {
  private server?: Server;

  private startPromise?: Promise<void>;

  // 이 데스크톱 세션에서 start/resume-batch 명령을 보낸 적이 있는지.
  // 없는데 실행 중(executing) 하트비트가 오면, 앱을 껐다 켜기 전 세션의 배치가
  // 작업 브라우저에서 계속 돌고 있다는 뜻이므로 자동으로 중단을 요청한다.
  private batchCommandSentThisSession = false;

  // 클라이언트별 마지막 자동 중단 요청 시각. 실패했을 때만 일정 간격으로 재시도한다.
  private readonly autoStopAttemptAtByClientId = new Map<string, number>();

  private readonly clients = new Map<string, ClientRecord>();

  private readonly commands: CommandRecord[] = [];

  private readonly pendingPolls = new Map<string, PendingCommandPoll>();

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

    this.completeAllPendingPolls();

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

    // 이 데스크톱 세션에서 배치를 시작/재개한 적이 있는지 기록한다.
    // 앱을 껐다 켠 직후 이전 세션의 배치가 돌고 있으면 자동 중단하는 판단 기준.
    if (type === 'start-batch' || type === 'resume-batch') {
      this.batchCommandSentThisSession = true;
    }

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
    this.flushPendingPolls();
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
        this.handleCommandPoll(url, request, response);
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
    this.stopForeignRunningBatch(payload, now);

    response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    response.end(
      JSON.stringify({
        ok: true,
        activeClientId: this.getActiveClientId(),
      }),
    );
  }

  // 앱을 껐다 켠 뒤, 이전 세션이 시작해 둔 배치가 작업 브라우저에서 계속 돌고 있으면
  // 자동으로 중단을 요청한다. 이 데스크톱 세션에서 배치를 시작/재개한 적이 있으면
  // 정상 실행 중이므로 건드리지 않는다.
  private stopForeignRunningBatch(payload: HybridHeartbeatPayload, now: number): void {
    if (this.batchCommandSentThisSession) {
      return;
    }

    const phase =
      typeof payload.progress === 'object' && payload.progress !== null
        ? (payload.progress as { phase?: unknown }).phase
        : undefined;
    if (phase !== 'executing') {
      return;
    }

    // 중단이 처리될 시간을 준 뒤에도 여전히 executing 이면 재시도한다.
    const lastAttemptAt = this.autoStopAttemptAtByClientId.get(payload.clientId) ?? 0;
    if (now - lastAttemptAt < 30_000) {
      return;
    }
    this.autoStopAttemptAtByClientId.set(payload.clientId, now);

    const queuedAt = new Date(now).toISOString();
    const command: CommandRecord = {
      commandId: randomUUID(),
      type: 'stop-batch',
      status: 'QUEUED',
      queuedAt,
      targetClientId: payload.clientId,
      message: '앱이 다시 시작되어 이전 세션의 예약구매 작업을 자동으로 중단합니다.',
    };
    this.commands.unshift(command);
    this.flushPendingPolls();
  }

  private handleCommandPoll(
    url: URL,
    request: IncomingMessage,
    response: ServerResponse,
  ): void {
    const clientId = url.searchParams.get('clientId');

    if (!clientId) {
      response.writeHead(400, { 'content-type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify({ message: 'clientId is required.' }));
      return;
    }

    const command = this.claimNextCommand(clientId);
    if (command) {
      this.writeCommandPollResponse(response, command);
      return;
    }

    const waitMs = parseCommandPollWaitMs(url);
    if (waitMs <= 0) {
      this.writeCommandPollResponse(response, null);
      return;
    }

    this.registerPendingPoll(clientId, request, response, waitMs);
  }

  private registerPendingPoll(
    clientId: string,
    request: IncomingMessage,
    response: ServerResponse,
    waitMs: number,
  ): void {
    this.completePendingPoll(clientId, null);

    const pending: PendingCommandPoll = {
      clientId,
      response,
      timeoutId: setTimeout(() => {
        this.completePendingPoll(clientId, null);
      }, waitMs),
    };

    this.pendingPolls.set(clientId, pending);
    request.on('close', () => {
      if (this.pendingPolls.get(clientId) === pending) {
        clearTimeout(pending.timeoutId);
        this.pendingPolls.delete(clientId);
      }
    });
  }

  private flushPendingPolls(): void {
    for (const clientId of [...this.pendingPolls.keys()]) {
      const command = this.claimNextCommand(clientId);
      if (command) {
        this.completePendingPoll(clientId, command);
      }
    }
  }

  private completePendingPoll(
    clientId: string,
    command: CommandRecord | null,
  ): void {
    const pending = this.pendingPolls.get(clientId);
    if (!pending) {
      return;
    }

    clearTimeout(pending.timeoutId);
    this.pendingPolls.delete(clientId);
    this.writeCommandPollResponse(pending.response, command);
  }

  private completeAllPendingPolls(): void {
    for (const clientId of [...this.pendingPolls.keys()]) {
      this.completePendingPoll(clientId, null);
    }
  }

  private writeCommandPollResponse(
    response: ServerResponse,
    command: CommandRecord | null,
  ): void {
    if (response.writableEnded) {
      return;
    }

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

      // 시간 초과 판정:
      // - stop-batch 는 즉각 반응해야 하는 명령이라 예외 없이 3초 기준으로 실패시킨다.
      // - 그 외 명령은, 클레임한 클라이언트가 여전히 하트비트를 보내는 중이면 대량
      //   수집/변경처럼 오래 걸리는 작업일 수 있으므로 기본 시간 초과(90초)를 적용하지
      //   않는다. 클라이언트가 실제로 죽으면 아래 연결 끊김 검사가 잡아낸다.
      const queuedAgeMs = now - Date.parse(command.queuedAt);
      const claimedByConnectedClient =
        command.claimedByClientId !== undefined &&
        connectedClientIds.has(command.claimedByClientId);
      const allowLongRun = command.type !== 'stop-batch' && claimedByConnectedClient;
      if (
        queuedAgeMs > CLAIMED_COMMAND_MAX_AGE_MS ||
        (queuedAgeMs > getCommandStaleMs(command.type) && !allowLongRun)
      ) {
        command.status = 'FAILED';
        command.respondedAt = new Date(now).toISOString();
        command.claimedByClientId = undefined;
        command.claimedAt = undefined;
        command.message = getCommandTimeoutMessage(command.type);
        continue;
      }

      // 클레임 해제는 클라이언트 연결이 끊긴 경우에만 한다. (예전에는 30초 무조건
      // 해제였는데, 그러면 장시간 명령을 실행 중인 클레임이 풀려 위의 시간 초과
      // 예외 판정이 무력화된다. 연결이 끊긴 클라이언트의 명령은 어차피 바로 아래
      // 검사에서 실패 처리되므로, 이 해제는 사실상 방어적 정리다.)
      if (
        command.claimedByClientId &&
        command.claimedAt &&
        now - command.claimedAt > CLAIM_STALE_MS &&
        !connectedClientIds.has(command.claimedByClientId)
      ) {
        command.claimedByClientId = undefined;
        command.claimedAt = undefined;
      }

      if (
        command.targetClientId &&
        (staleClientIds.has(command.targetClientId) ||
          !connectedClientIds.has(command.targetClientId))
      ) {
        command.status = 'FAILED';
        command.respondedAt = new Date(now).toISOString();
        command.claimedByClientId = undefined;
        command.claimedAt = undefined;
        command.message = getCommandDisconnectedMessage(command.type);
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

function parseCommandPollWaitMs(url: URL): number {
  const raw = Number(url.searchParams.get('waitMs') ?? 0);
  if (!Number.isFinite(raw) || raw <= 0) {
    return 0;
  }

  return Math.min(Math.floor(raw), MAX_COMMAND_POLL_WAIT_MS);
}

function getCommandTimeoutMessage(type: HybridCommandType): string {
  if (type === 'stop-batch') {
    return '중단 요청에 3초 동안 응답이 없습니다. 확장프로그램이 꺼졌거나 작업용 브라우저 탭 연결이 끊겼을 수 있습니다. 판매자센터 탭을 새로고침한 뒤 상태를 확인해 주세요.';
  }

  return '작업용 브라우저 탭이 요청에 응답하지 않았습니다. 판매자센터 상품 목록 탭을 새로고침한 뒤 다시 실행해 주세요.';
}

function getCommandDisconnectedMessage(type: HybridCommandType): string {
  if (type === 'collect-targets') {
    return '상품 불러오기를 취소했습니다. 브라우저 확장 연결이 끊겼습니다. 판매자센터 상품 조회/수정 탭을 새로고침한 뒤 다시 불러와 주세요.';
  }

  if (type === 'stop-batch') {
    return '중단 요청을 취소했습니다. 브라우저 확장 연결이 끊겼습니다. 판매자센터 탭을 새로고침한 뒤 상태를 확인해 주세요.';
  }

  return '요청을 취소했습니다. 브라우저 확장 연결이 끊겼습니다. 판매자센터 탭을 새로고침한 뒤 다시 실행해 주세요.';
}

function describeHybridCommand(type: HybridCommandType): string {
  switch (type) {
    case 'check-surface':
      return '현재 작업용 브라우저 탭이 판매자센터 작업 표면인지 확인합니다.';
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
    return '작업용 브라우저 판매자센터 상품 조회/수정 탭이 연결되어 있지 않습니다. 상품 목록 탭을 열고 Ctrl+R로 새로고침한 뒤 다시 실행해 주세요.';
  }

  if (requiresProductWorkClient(type)) {
    return '작업용 브라우저 판매자센터 상품 탭이 연결되어 있지 않습니다. 상품 목록 또는 상품 수정 탭을 열고 Ctrl+R로 새로고침한 뒤 다시 실행해 주세요.';
  }

  return '작업용 브라우저 판매자센터 탭이 연결되어 있지 않습니다. 판매자센터 탭을 열고 Ctrl+R로 새로고침한 뒤 다시 실행해 주세요.';
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
