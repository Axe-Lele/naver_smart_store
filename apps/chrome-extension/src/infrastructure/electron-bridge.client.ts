// Path: C:\smart-store\apps\chrome-extension\src\infrastructure\electron-bridge.client.ts
import type { ProgressStorePort } from "../application/index.js";
import type { LoggerPort, SellerCenterPageGatewayPort } from "../application/index.js";

type HybridCommandType =
  | "check-surface"
  | "run-dom-inspection"
  | "collect-targets"
  | "run-dry-run"
  | "start-batch"
  | "resume-batch"
  | "stop-batch";

type HybridCommandPayload = {
  selectedProductIds?: string[];
};

type BridgeHeartbeatPayload = {
  clientId: string;
  pageUrl: string;
  pageTitle: string;
  visibilityState?: string;
  hasFocus?: boolean;
  progress?: unknown;
};

type BridgeCommandPollResponse = {
  command: {
    commandId: string;
    type: HybridCommandType;
    payload?: HybridCommandPayload;
  } | null;
};

type BridgeCommandResultPayload = {
  clientId: string;
  commandId: string;
  ok: boolean;
  message: string;
  response: unknown;
};

const COMMAND_POLL_WAIT_MS = 25_000;
const BRIDGE_RETRY_DELAY_MS = 2_000;
// 명령 실행 중에도 이 간격으로 하트비트를 보낸다. 대량 상품 수집처럼 수 분 걸리는
// 명령을 실행하는 동안 하트비트가 끊기면, 데스크톱이 클라이언트가 죽었다고
// 오판(45초 무응답 기준)해서 진행 중인 명령을 실패 처리해버린다.
const EXECUTION_HEARTBEAT_INTERVAL_MS = 10_000;

export class ElectronBridgeClient {
  private readonly clientId = crypto.randomUUID();

  private timerId?: number;

  private started = false;

  private inFlight = false;

  private lastBridgeUnavailableLogAt = 0;

  // 작업용 브라우저 프로필로 확인되면 true 로 고정해 storage 재조회를 건너뛴다.
  private confirmedWorkBrowser = false;

  public constructor(
    private readonly bridgeUrl: string,
    private readonly gateway: SellerCenterPageGatewayPort,
    private readonly progressStore: ProgressStorePort,
    private readonly logger: LoggerPort,
    private readonly executeCommand: (
      type: HybridCommandType,
      payload?: HybridCommandPayload,
    ) => Promise<unknown>,
    private readonly windowRef: Window,
    // 이 프로필이 데스크톱이 띄운 작업용 브라우저인지 확인한다. 개인 크롬에 설치된
    // 같은 확장이 브리지에 붙어 명령을 가로채는 사고를 막는다. (기본값은 테스트 호환용)
    private readonly isWorkBrowserProfile: () => Promise<boolean> = async () => true,
  ) {}

  public start(): void {
    if (this.started) {
      return;
    }

    this.started = true;
    void this.tick();
  }

  public stop(): void {
    this.started = false;
    if (this.timerId !== undefined) {
      this.windowRef.clearTimeout(this.timerId);
      this.timerId = undefined;
    }
  }

  public getClientId(): string {
    return this.clientId;
  }

  public async flush(): Promise<void> {
    await this.sendHeartbeat();
  }

  private async tick(): Promise<void> {
    if (!this.started || this.inFlight) {
      return;
    }

    if (!this.gateway.isSellerCenterSurface()) {
      this.scheduleNextTick(BRIDGE_RETRY_DELAY_MS);
      return;
    }

    // 작업용 브라우저 프로필이 아니면 브리지에 아예 연결하지 않는다.
    // (플래그는 데스크톱이 마커 붙은 URL로 이 브라우저를 열 때 기록된다.)
    if (!this.confirmedWorkBrowser) {
      const isWorkBrowser = await this.isWorkBrowserProfile().catch(() => false);
      if (!isWorkBrowser) {
        this.scheduleNextTick(BRIDGE_RETRY_DELAY_MS);
        return;
      }
      this.confirmedWorkBrowser = true;
    }

    this.inFlight = true;
    let nextDelayMs = 0;

    try {
      await this.sendHeartbeat();
      const command = await this.pollCommand();

      if (command) {
        // 실행 중 하트비트: 연결 유지 판정용이자, progress 스냅샷이 하트비트에 실려
        // 데스크톱 화면에 진행 상황이 실시간 반영되는 통로이기도 하다.
        const executionHeartbeatId = this.windowRef.setInterval(() => {
          void this.sendHeartbeat().catch(() => undefined);
        }, EXECUTION_HEARTBEAT_INTERVAL_MS);

        let response: unknown;
        try {
          response = await this.executeCommand(command.type, command.payload);
        } catch (error) {
          response = {
            ok: false,
            message: stringifyError(error),
          };
        } finally {
          this.windowRef.clearInterval(executionHeartbeatId);
        }

        await this.postResult({
          clientId: this.clientId,
          commandId: command.commandId,
          ok: !isCommandFailure(response),
          message: getCommandMessage(response),
          response,
        });
      }
    } catch (error) {
      if (isExtensionContextInvalidatedError(error)) {
        this.logger.debug(
          "Chrome extension context was invalidated; stopping Electron bridge polling until the tab is reloaded.",
          toLogMetadata(error),
        );
        this.stop();
      } else if (isBridgeUnavailableError(error)) {
        this.logBridgeUnavailable(error);
        nextDelayMs = BRIDGE_RETRY_DELAY_MS;
      } else {
        this.logger.warn("Electron bridge poll failed", toLogMetadata(error));
        nextDelayMs = BRIDGE_RETRY_DELAY_MS;
      }
    } finally {
      this.inFlight = false;
      this.scheduleNextTick(nextDelayMs);
    }
  }

  private scheduleNextTick(delayMs = 0): void {
    if (!this.started) {
      return;
    }

    if (delayMs <= 0) {
      this.windowRef.queueMicrotask(() => {
        void this.tick();
      });
      return;
    }

    this.timerId = this.windowRef.setTimeout(() => {
      void this.tick();
    }, delayMs);
  }

  private async sendHeartbeat(): Promise<void> {
    const progress = await this.progressStore.load();
    const payload: BridgeHeartbeatPayload = {
      clientId: this.clientId,
      pageUrl: this.gateway.getPageUrl(),
      pageTitle: this.gateway.getPageTitle(),
      visibilityState: this.windowRef.document.visibilityState,
      hasFocus: this.windowRef.document.hasFocus(),
      progress,
    };

    await fetchJson(`${this.bridgeUrl}/bridge/heartbeat`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  private async pollCommand(): Promise<BridgeCommandPollResponse["command"]> {
    const result = await fetchJson<BridgeCommandPollResponse>(
      `${this.bridgeUrl}/bridge/commands?clientId=${encodeURIComponent(this.clientId)}&waitMs=${COMMAND_POLL_WAIT_MS}`,
    );
    return result.command;
  }

  private async postResult(payload: BridgeCommandResultPayload): Promise<void> {
    await fetchJson(`${this.bridgeUrl}/bridge/command-result`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  private logBridgeUnavailable(error: unknown): void {
    const now = Date.now();
    if (now - this.lastBridgeUnavailableLogAt < 30_000) {
      return;
    }

    this.lastBridgeUnavailableLogAt = now;
    this.logger.debug("Electron bridge is not ready yet; waiting for the desktop app.", {
      bridgeUrl: this.bridgeUrl,
      ...toLogMetadata(error),
    });
  }
}

async function fetchJson<T>(
  url: string,
  init?: RequestInit,
): Promise<T> {
  let response: Response;

  try {
    response = await fetch(url, {
      ...init,
      headers: {
        "content-type": "application/json",
        ...(init?.headers ?? {}),
      },
    });
  } catch (error) {
    throw new BridgeRequestError("Bridge request could not reach the desktop app.", {
      url,
      cause: error,
    });
  }

  if (!response.ok) {
    throw new BridgeRequestError(
      `Bridge request failed: ${response.status} ${response.statusText}`,
      {
        url,
        status: response.status,
        statusText: response.statusText,
        body: await readResponseText(response),
      },
    );
  }

  return (await response.json()) as T;
}

class BridgeRequestError extends Error {
  public readonly url: string;

  public readonly status?: number;

  public readonly statusText?: string;

  public readonly body?: string;

  public constructor(
    message: string,
    options: {
      url: string;
      status?: number;
      statusText?: string;
      body?: string;
      cause?: unknown;
    },
  ) {
    super(message);
    this.name = "BridgeRequestError";
    this.url = options.url;
    this.status = options.status;
    this.statusText = options.statusText;
    this.body = options.body;
    if (options.cause !== undefined) {
      this.cause = options.cause;
    }
  }
}

async function readResponseText(response: Response): Promise<string | undefined> {
  try {
    const text = await response.text();
    return text.slice(0, 500) || undefined;
  } catch {
    return undefined;
  }
}

function isCommandFailure(response: unknown): boolean {
  return (
    typeof response === "object" &&
    response !== null &&
    "ok" in response &&
    (response as { ok?: unknown }).ok === false
  );
}

function getCommandMessage(response: unknown): string {
  if (
    typeof response === "object" &&
    response !== null &&
    "message" in response &&
    typeof (response as { message?: unknown }).message === "string"
  ) {
    return (response as { message: string }).message;
  }

  return "Bridge command finished.";
}

function isBridgeUnavailableError(error: unknown): boolean {
  if (!(error instanceof BridgeRequestError)) {
    return false;
  }

  return error.status === undefined;
}

function isExtensionContextInvalidatedError(error: unknown): boolean {
  return errorMessageIncludes(error, "extension context invalidated");
}

function errorMessageIncludes(error: unknown, expectedMessage: string): boolean {
  if (error instanceof Error) {
    if (error.message.toLowerCase().includes(expectedMessage)) {
      return true;
    }

    return errorMessageIncludes(error.cause, expectedMessage);
  }

  if (typeof error === "string") {
    return error.toLowerCase().includes(expectedMessage);
  }

  return false;
}

function toLogMetadata(error: unknown): Record<string, unknown> {
  if (error instanceof BridgeRequestError) {
    return {
      name: error.name,
      message: error.message,
      url: error.url,
      status: error.status,
      statusText: error.statusText,
      body: error.body,
      cause: stringifyError(error.cause),
    };
  }

  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
    };
  }

  return {
    message: String(error),
  };
}

function stringifyError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "object" && error !== null) {
    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }

  return String(error);
}
