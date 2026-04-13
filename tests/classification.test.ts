import { describe, expect, it } from 'vitest';

import { classifyProductState } from '../src/domain/classification.js';
import type { ClassificationSignals } from '../src/domain/types.js';

function baseSignals(
  overrides: Partial<ClassificationSignals> = {},
): ClassificationSignals {
  return {
    pageReady: true,
    editPageIdentityVisible: true,
    notFoundMessageVisible: false,
    preorderSectionVisible: true,
    preorderSelected: false,
    normalSelected: false,
    normalOptionVisible: true,
    normalOptionDisabled: false,
    preorderFieldDisabled: false,
    orderPeriodLockMessageVisible: false,
    lockBannerVisible: false,
    saveButtonVisible: true,
    unexpectedLayoutDetected: false,
    ...overrides,
  };
}

describe('classifyProductState', () => {
  it('returns NOT_FOUND when the UI says the product does not exist', () => {
    const result = classifyProductState(
      baseSignals({
        notFoundMessageVisible: true,
      }),
    );

    expect(result.status).toBe('NOT_FOUND');
  });

  it('returns LOCKED_BY_ORDER_PERIOD when lock messaging is visible', () => {
    const result = classifyProductState(
      baseSignals({
        orderPeriodLockMessageVisible: true,
      }),
    );

    expect(result.status).toBe('LOCKED_BY_ORDER_PERIOD');
  });

  it('returns NOT_PREORDER when the normal-product option is already selected', () => {
    const result = classifyProductState(
      baseSignals({
        normalSelected: true,
      }),
    );

    expect(result.status).toBe('NOT_PREORDER');
  });

  it('returns EDITABLE_PREORDER when preorder is selected and normal option is enabled', () => {
    const result = classifyProductState(
      baseSignals({
        preorderSelected: true,
      }),
    );

    expect(result.status).toBe('EDITABLE_PREORDER');
  });

  it('returns UI_CHANGED when the expected edit layout is missing', () => {
    const result = classifyProductState(
      baseSignals({
        pageReady: false,
        editPageIdentityVisible: false,
        saveButtonVisible: false,
        preorderSectionVisible: false,
        normalOptionVisible: false,
        unexpectedLayoutDetected: true,
      }),
    );

    expect(result.status).toBe('UI_CHANGED');
  });

  it('returns UNKNOWN_ERROR when signals remain ambiguous', () => {
    const result = classifyProductState(
      baseSignals({
        preorderSectionVisible: true,
        normalOptionVisible: true,
        preorderSelected: false,
        normalSelected: false,
      }),
    );

    expect(result.status).toBe('UNKNOWN_ERROR');
  });
});
