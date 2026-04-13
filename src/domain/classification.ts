import type {
  ClassificationDecision,
  ClassificationSignals,
} from './types.js';

export function classifyProductState(
  signals: ClassificationSignals,
): ClassificationDecision {
  if (signals.notFoundMessageVisible) {
    return decision(signals, 'NOT_FOUND', 'Search or edit UI reported no product result.');
  }

  if (!signals.pageReady || signals.unexpectedLayoutDetected) {
    return decision(
      signals,
      'UI_CHANGED',
      'Expected seller center edit UI landmarks were not detected.',
    );
  }

  if (
    signals.orderPeriodLockMessageVisible ||
    signals.lockBannerVisible ||
    signals.preorderFieldDisabled ||
    (signals.normalOptionVisible && signals.normalOptionDisabled)
  ) {
    return decision(
      signals,
      'LOCKED_BY_ORDER_PERIOD',
      'Preorder controls appear locked by order period or policy banner.',
    );
  }

  if (!signals.editPageIdentityVisible) {
    return decision(
      signals,
      'UI_CHANGED',
      'The page does not look like a product edit screen.',
    );
  }

  if (!signals.preorderSectionVisible && !signals.normalOptionVisible) {
    return decision(
      signals,
      'UI_CHANGED',
      'The preorder conversion section could not be located.',
    );
  }

  if (signals.normalSelected && !signals.preorderSelected) {
    return decision(
      signals,
      'NOT_PREORDER',
      'The product is already configured as a normal product.',
    );
  }

  if (
    signals.preorderSelected &&
    signals.normalOptionVisible &&
    !signals.normalOptionDisabled
  ) {
    return decision(
      signals,
      'EDITABLE_PREORDER',
      'The product is a preorder item and the normal-product option is editable.',
    );
  }

  return decision(
    signals,
    'UNKNOWN_ERROR',
    'Signals were inconclusive after loading the edit page.',
  );
}

function decision(
  signals: ClassificationSignals,
  status: ClassificationDecision['status'],
  reason: string,
): ClassificationDecision {
  return {
    status,
    reason,
    signals,
  };
}
