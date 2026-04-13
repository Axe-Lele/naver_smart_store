export function nowIso(): string {
  return new Date().toISOString();
}

export function elapsedMs(startedAtMs: number): number {
  return Date.now() - startedAtMs;
}

export async function sleep(ms: number): Promise<void> {
  if (ms <= 0) {
    return;
  }

  await new Promise((resolve) => setTimeout(resolve, ms));
}
