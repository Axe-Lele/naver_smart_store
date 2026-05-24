// Path: C:\smart-store\apps\chrome-extension\src\infrastructure\browser-logger.ts
import type { LoggerPort } from "../application/index.js";

type LogLevel = "debug" | "info" | "warn" | "error";

export class BrowserLogger implements LoggerPort {
  public constructor(private readonly scope: string) {}

  public debug(message: string, metadata?: Record<string, unknown>): void {
    this.write("debug", message, metadata);
  }

  public info(message: string, metadata?: Record<string, unknown>): void {
    this.write("info", message, metadata);
  }

  public warn(message: string, metadata?: Record<string, unknown>): void {
    this.write("warn", message, metadata);
  }

  public error(message: string, metadata?: Record<string, unknown>): void {
    this.write("error", message, metadata);
  }

  private write(level: LogLevel, message: string, metadata?: Record<string, unknown>): void {
    const serializedMetadata = metadata ? ` ${safeStringify(metadata)}` : "";
    console[level](`[${this.scope}] ${message}${serializedMetadata}`);
  }
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
