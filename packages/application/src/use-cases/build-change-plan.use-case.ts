// File: packages/application/src/use-cases/build-change-plan.use-case.ts
import {
  ChangePlan,
  DomainValidationError,
  Product,
  ProductId,
  type ChangePlanSource,
} from '@smart-store/core';

import type { SettingsStorePort } from '../ports/settings-store.port.js';
import { buildRunPolicyFromSettings } from '../settings/app-settings.js';

export interface BuildChangePlanInput {
  selectedProductIds?: readonly (ProductId | string | number)[];
  selectedProducts?: readonly Product[];
  dryRun?: boolean;
  requestedBy?: string;
  source?: ChangePlanSource;
}

export class BuildChangePlanUseCase {
  constructor(private readonly settingsStore: SettingsStorePort) {}

  async execute(input: BuildChangePlanInput): Promise<ChangePlan> {
    const settings = await this.settingsStore.loadSettings();
    const selectedIds = normalizeSelectedProductIds(input);

    if (selectedIds.length === 0) {
      throw new DomainValidationError(
        'At least one product must be selected to build a change plan.',
      );
    }

    return ChangePlan.createNew({
      source: input.source ?? 'MANUAL_SELECTION',
      dryRun: input.dryRun,
      requestedBy: input.requestedBy,
      runPolicy: buildRunPolicyFromSettings(settings, {
        dryRun: input.dryRun ?? false,
      }),
      productIds: selectedIds,
    });
  }
}

function normalizeSelectedProductIds(input: BuildChangePlanInput): ProductId[] {
  const idsFromProducts =
    input.selectedProducts?.map((product) => product.id) ?? [];
  const idsFromValues =
    input.selectedProductIds?.map((value) =>
      value instanceof ProductId ? value : ProductId.create(value),
    ) ?? [];

  const seen = new Set<string>();
  const normalized = [...idsFromProducts, ...idsFromValues].filter((id) => {
    const key = id.toString();
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });

  return normalized;
}
