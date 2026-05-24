// Path: C:\smart-store\apps\chrome-extension\src\domain\product-processing-state.ts
export enum ProductProcessingState {
  IDLE = "IDLE",
  COLLECTED = "COLLECTED",
  DRY_RUN_READY = "DRY_RUN_READY",
  RUNNING = "RUNNING",
  SUCCEEDED = "SUCCEEDED",
  FAILED = "FAILED",
  SKIPPED = "SKIPPED",
  STOPPED = "STOPPED",
  VERIFICATION_REQUIRED = "VERIFICATION_REQUIRED",
}
