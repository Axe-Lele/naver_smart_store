// File: C:\smart-store\tests\extension\selector-registry.test.ts
import { describe, expect, it } from 'vitest';

import { InMemorySelectorRegistry } from '../../apps/chrome-extension/src/infrastructure/selector-registry.js';

describe('InMemorySelectorRegistry', () => {
  it('sorts candidates by priority and keeps text matches as fallbacks', () => {
    const registry = new InMemorySelectorRegistry();

    const candidates = registry.list('search.searchButton');

    expect(candidates[0]?.strategy).toBe('data');
    expect(candidates.at(-1)?.strategy).toBe('text');
    expect(candidates.at(-1)?.fallback).toBe(true);
  });

  it('returns page-specific keys and keeps them verification_required', () => {
    const registry = new InMemorySelectorRegistry();

    const keys = registry.keysForPageType('product_edit');
    expect(keys).toContain('editor.saveButton');
    expect(
      registry
        .list('editor.saveButton')
        .every((candidate) => candidate.verificationStatus === 'verification_required'),
    ).toBe(true);
  });
});
