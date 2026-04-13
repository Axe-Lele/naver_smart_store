// File: packages/application/src/use-cases/retry-failed-items.use-case.ts
import {
  ChangePlan,
  DomainValidationError,
  ProductId,
  isRetryableFailure,
  type BatchJobId,
} from '@smart-store/core';

import type { BatchJobStorePort } from '../ports/batch-job-store.port.js';
import type { SettingsStorePort } from '../ports/settings-store.port.js';
import { buildRunPolicyFromSettings } from '../settings/app-settings.js';

export class RetryFailedItemsUseCase {
  constructor(
    private readonly settingsStore: SettingsStorePort,
    private readonly batchJobStore: BatchJobStorePort,
  ) {}

  async execute(input: {
    jobId: BatchJobId;
    dryRun?: boolean;
    requestedBy?: string;
    includeAllFailed?: boolean;
  }): Promise<ChangePlan> {
    const [job, itemResults, settings] = await Promise.all([
      this.batchJobStore.loadJob(input.jobId),
      this.batchJobStore.loadItemResults(input.jobId),
      this.settingsStore.loadSettings(),
    ]);

    if (!job) {
      throw new DomainValidationError(
        `Batch job was not found: ${input.jobId.toString()}`,
      );
    }

    const retrySource = input.includeAllFailed
      ? itemResults.filter((result) => result.outputBucket === 'failed')
      : itemResults.filter((result) => isRetryableFailure(result));
    const productIds = retrySource.map((result) =>
      ProductId.create(result.productId.toString()),
    );

    if (productIds.length === 0) {
      throw new DomainValidationError('There are no failed items available to retry.');
    }

    return ChangePlan.createNew({
      source: 'FAILED_ITEMS_RETRY',
      dryRun: input.dryRun,
      requestedBy: input.requestedBy,
      runPolicy: buildRunPolicyFromSettings(settings, {
        dryRun: input.dryRun ?? false,
      }),
      productIds,
    });
  }
}
