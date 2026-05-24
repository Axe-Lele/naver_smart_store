// Path: C:\smart-store\apps\chrome-extension\src\infrastructure\wait-strategy.ts
export interface RetryOptions {
  retries: number;
  timeoutMs: number;
  retryDelayMs: number;
}

const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  retries: 2,
  timeoutMs: 12_000,
  retryDelayMs: 500,
};

export class WaitStrategy {
  public constructor(
    private readonly windowRef: Window,
    private readonly documentRef: Document,
  ) {}

  public async waitForReady(options: Partial<RetryOptions> = {}): Promise<void> {
    await this.runWithRetry("waitForReady", async () => {
      const timeoutMs = options.timeoutMs ?? DEFAULT_RETRY_OPTIONS.timeoutMs;
      await this.waitForDocumentReady(timeoutMs);
      await bestEffort(() =>
        this.waitForNetworkIdle(500, Math.min(timeoutMs, 2_500)),
      );
      await bestEffort(() =>
        this.waitForDomStable(300, Math.min(timeoutMs, 2_000)),
      );
    }, options);
  }

  public async waitForDocumentReady(timeoutMs: number): Promise<void> {
    if (this.documentRef.readyState === "complete") {
      return;
    }

    await waitUntil(
      () => this.documentRef.readyState === "complete",
      timeoutMs,
      100,
    );
  }

  public async waitForNetworkIdle(idleWindowMs: number, timeoutMs: number): Promise<void> {
    let lastResourceCount = performance.getEntriesByType("resource").length;
    let stableSince = Date.now();

    await waitUntil(() => {
      const currentCount = performance.getEntriesByType("resource").length;
      if (currentCount !== lastResourceCount) {
        lastResourceCount = currentCount;
        stableSince = Date.now();
      }

      return Date.now() - stableSince >= idleWindowMs;
    }, timeoutMs, 100);
  }

  public async waitForDomStable(idleWindowMs: number, timeoutMs: number): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      let stableTimer = this.windowRef.setTimeout(finish, idleWindowMs);
      const timeoutTimer = this.windowRef.setTimeout(() => {
        observer.disconnect();
        reject(new Error("Timed out while waiting for DOM stability."));
      }, timeoutMs);

      const observer = new MutationObserver(() => {
        this.windowRef.clearTimeout(stableTimer);
        stableTimer = this.windowRef.setTimeout(finish, idleWindowMs);
      });

      observer.observe(this.documentRef.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        characterData: true,
      });

      function finish() {
        observer.disconnect();
        clearTimeout(timeoutTimer);
        resolve();
      }
    });
  }

  public async runWithRetry<T>(
    name: string,
    task: () => Promise<T>,
    options: Partial<RetryOptions> = {},
  ): Promise<T> {
    const resolved = { ...DEFAULT_RETRY_OPTIONS, ...options };
    let lastError: unknown;

    for (let attempt = 0; attempt <= resolved.retries; attempt += 1) {
      try {
        return await withTimeout(task(), resolved.timeoutMs);
      } catch (error) {
        lastError = error;
        if (attempt === resolved.retries) {
          break;
        }

        await delay(resolved.retryDelayMs);
      }
    }

    throw new Error(`${name} failed after retries: ${stringifyError(lastError)}`);
  }

  public async throttle(delayMs: number): Promise<void> {
    if (delayMs <= 0) {
      return;
    }

    await delay(delayMs);
  }
}

async function waitUntil(
  predicate: () => boolean,
  timeoutMs: number,
  pollMs: number,
): Promise<void> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (predicate()) {
      return;
    }

    await delay(pollMs);
  }

  throw new Error("Timed out while waiting for condition.");
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Operation timed out after ${timeoutMs}ms.`));
    }, timeoutMs);

    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

function delay(delayMs: number): Promise<void> {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

async function bestEffort(task: () => Promise<void>): Promise<void> {
  try {
    await task();
  } catch {
    // Smart Store is a live SPA; background polling or small DOM mutations should not
    // block reading the currently visible product list.
  }
}

function stringifyError(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}
