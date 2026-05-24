// File: C:\smart-store\tests\extension\date-resolver.test.ts
// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { SelectorRegistryPort } from '../../apps/chrome-extension/src/application/ports.js';
import { DEFAULT_RUN_POLICY } from '../../apps/chrome-extension/src/domain/run-policy.js';
import { UiMaxDateResolver } from '../../apps/chrome-extension/src/infrastructure/date-resolver.js';
import { WaitStrategy } from '../../apps/chrome-extension/src/infrastructure/wait-strategy.js';

describe('UiMaxDateResolver', () => {
  beforeEach(() => {
    vi.spyOn(WaitStrategy.prototype, 'waitForReady').mockResolvedValue();
    Object.defineProperty(document, 'readyState', {
      configurable: true,
      value: 'complete',
    });
    vi.spyOn(window.performance, 'getEntriesByType').mockReturnValue([]);
  });

  it('uses the input max attribute when available', async () => {
    document.body.innerHTML = '<input id="orderDate" type="date" max="2026-12-31" />';
    const resolver = new UiMaxDateResolver(
      createRegistry({
        'editor.orderPeriodControl': [
          cssCandidate('editor.orderPeriodControl', '#orderDate', 'verified'),
        ],
      }),
      document,
      window,
    );

    const result = await resolver.resolveMaximumAllowedDate({
      control: 'editor.orderPeriodControl',
      policy: DEFAULT_RUN_POLICY,
    });

    expect(result.value).toBe('2026-12-31');
    expect(result.verificationStatus).toBe('verified');
  });

  it('falls back to the latest select option when no input max exists', async () => {
    document.body.innerHTML = `
      <select id="dispatchDate">
        <option>2026-05-01</option>
        <option>2026-06-15</option>
        <option>2026-07-30</option>
      </select>
    `;
    const resolver = new UiMaxDateResolver(
      createRegistry({
        'editor.dispatchCompletionDateControl': [
          cssCandidate(
            'editor.dispatchCompletionDateControl',
            '#dispatchDate',
            'verification_required',
          ),
        ],
      }),
      document,
      window,
    );

    const result = await resolver.resolveMaximumAllowedDate({
      control: 'editor.dispatchCompletionDateControl',
      policy: DEFAULT_RUN_POLICY,
    });

    expect(result.value).toBe('2026-07-30');
    expect(result.verificationStatus).toBe('verification_required');
  });
});

function createRegistry(overrides: Partial<Record<string, unknown[]>>): SelectorRegistryPort {
  return {
    list(key) {
      return (overrides[key] as ReturnType<typeof cssCandidate>[]) ?? [];
    },
    keysForPageType() {
      return [];
    },
  };
}

function cssCandidate(
  key: Parameters<SelectorRegistryPort['list']>[0],
  value: string,
  verificationStatus: 'verified' | 'verification_required',
) {
  return {
    key,
    strategy: 'css' as const,
    value,
    priority: 1,
    fallback: false,
    verificationStatus,
    note: 'test selector',
  };
}
