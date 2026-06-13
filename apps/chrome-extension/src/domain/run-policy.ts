// Path: C:\smart-store\apps\chrome-extension\src\domain\run-policy.ts
import type { RequiredOption } from "./models.js";

export interface RunPolicy {
  dryRun: boolean;
  delayMs: number;
  maxItems: number | null;
  retryFailedOnly: boolean;
  resumeFromCheckpoint: boolean;
  stopOnConsecutiveFailures: number;
  timezone: "Asia/Seoul";
  requiredOptions?: readonly RequiredOption[];
}

export const DEFAULT_RUN_POLICY: RunPolicy = {
  dryRun: true,
  delayMs: 750,
  maxItems: 100,
  retryFailedOnly: false,
  resumeFromCheckpoint: true,
  stopOnConsecutiveFailures: 10,
  timezone: "Asia/Seoul",
};
