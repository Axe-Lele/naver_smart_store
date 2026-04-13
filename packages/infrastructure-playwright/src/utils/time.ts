// File: packages/infrastructure-playwright/src/utils/time.ts
export async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export function timestampForFile(date = new Date()): string {
  return date.toISOString().replace(/[:.]/g, '-');
}
