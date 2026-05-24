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

export class ElectronBridgeClient {
  private readonly clientId = crypto.randomUUID();

  private timerId?: number;

  private started = false;

  private inFlight = false;

  private lastBridgeUnavailableLogAt = 0;

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
    if (!this.started || this.inFlight || !this.gateway.isSellerCenterSurface()) {
      this.scheduleNextTick();
      return;
    }

    this.inFlight = true;

    try {
      await this.sendHeartbeat();
      const command = await this.pollCommand();

      if (command) {
        let response: unknown;
        try {
          response = await this.executeCommand(command.type, command.payload);
        } catch (error) {
          response = {
            ok: false,
            message: stringifyError(error),
          };
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
      } else {
        this.logger.warn("Electron bridge poll failed", toLogMetadata(error));
      }
    } finally {
      this.inFlight = false;
      this.scheduleNextTick();
    }
  }

  private scheduleNextTick(): void {
    if (!this.started) {
      return;
    }

    this.timerId = this.windowRef.setTimeout(() => {
      void this.tick();
    }, 2_000);
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
      `${this.bridgeUrl}/bridge/commands?clientId=${encodeURIComponent(this.clientId)}`,
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
