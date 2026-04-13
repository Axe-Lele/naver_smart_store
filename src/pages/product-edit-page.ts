import type { Locator, Page } from 'playwright';
import type pino from 'pino';

import type { AppConfig } from '../config/schema.js';
import { classifyProductState } from '../domain/classification.js';
import { ClassifiedAutomationError } from '../domain/errors.js';
import type {
  ClassificationDecision,
  ClassificationSignals,
} from '../domain/types.js';
import { BasePage } from './base-page.js';
import {
  sectionInteractiveSelectors,
  smartStoreSelectors,
} from './selectors.js';

export class ProductEditPage extends BasePage {
  constructor(page: Page, config: AppConfig, logger: pino.Logger) {
    super(page, config, logger);
  }

  async classify(): Promise<ClassificationDecision> {
    const pageReady = await this.isReady();
    const signals = await this.collectSignals(pageReady);
    return classifyProductState(signals);
  }

  getReadySelectors(): readonly string[] {
    return [
      ...smartStoreSelectors.productEdit.pageIdentity,
      ...smartStoreSelectors.productEdit.saveButtons,
    ];
  }

  async isReady(timeoutMs = 8_000): Promise<boolean> {
    await this.waitForSettled(500);

    return (
      (await this.findVisibleLocator(this.getReadySelectors(), timeoutMs)) !== null
    );
  }

  async convertToNormalProduct(): Promise<void> {
    const preorderSection = await this.findPreorderSection();
    if (!preorderSection) {
      throw new ClassifiedAutomationError(
        'UI_CHANGED',
        'Preorder section could not be found on the edit page.',
      );
    }

    const normalOption = await this.findOptionByHints(
      preorderSection,
      smartStoreSelectors.productEdit.normalOptionHints,
    );

    if (!normalOption) {
      throw new ClassifiedAutomationError(
        'UI_CHANGED',
        'Normal-product option was not found inside the preorder section.',
      );
    }

    const lockVisible = await this.isAnyVisible(
      smartStoreSelectors.productEdit.lockIndicators,
      500,
    );
    const disabled = await this.isLocatorDisabled(normalOption);

    if (lockVisible || disabled) {
      throw new ClassifiedAutomationError(
        'LOCKED_BY_ORDER_PERIOD',
        'Normal-product conversion UI is disabled or blocked by an order-period notice.',
      );
    }

    const normalSelected = await this.isOptionSelected(normalOption);

    if (!normalSelected) {
      await normalOption.click();
      await this.waitForSettled(600);

      if (!(await this.isOptionSelected(normalOption))) {
        throw new ClassifiedAutomationError(
          'UI_CHANGED',
          'The normal-product option did not become selected after clicking it.',
        );
      }
    }

    const saveButton = await this.findVisibleLocator(
      smartStoreSelectors.productEdit.saveButtons,
      8_000,
    );

    if (!saveButton) {
      throw new ClassifiedAutomationError(
        'UI_CHANGED',
        'Save button was not found after switching the product type.',
      );
    }

    await saveButton.click();
    await this.waitForSettled(1_000);
  }

  private async collectSignals(
    pageReady: boolean,
  ): Promise<ClassificationSignals> {
    const editPageIdentityVisible = await this.isAnyVisible(
      smartStoreSelectors.productEdit.pageIdentity,
      1_500,
    );
    const saveButtonVisible = await this.isAnyVisible(
      smartStoreSelectors.productEdit.saveButtons,
      1_500,
    );
    const orderPeriodLockMessageVisible = await this.isAnyVisible(
      smartStoreSelectors.productEdit.lockIndicators,
      1_500,
    );
    const preorderSection = await this.findPreorderSection();
    const normalOption = preorderSection
      ? await this.findOptionByHints(
          preorderSection,
          smartStoreSelectors.productEdit.normalOptionHints,
        )
      : null;
    const preorderOption = preorderSection
      ? await this.findOptionByHints(
          preorderSection,
          smartStoreSelectors.productEdit.preorderOptionHints,
        )
      : null;

    const normalSelected = await this.isOptionSelected(normalOption);
    const preorderSelected = await this.isOptionSelected(preorderOption);
    const normalOptionDisabled = await this.isLocatorDisabled(normalOption);
    const preorderFieldDisabled = await this.isLocatorDisabled(preorderSection);

    return {
      pageReady,
      editPageIdentityVisible,
      notFoundMessageVisible: false,
      preorderSectionVisible: preorderSection !== null,
      preorderSelected,
      normalSelected,
      normalOptionVisible: normalOption !== null,
      normalOptionDisabled,
      preorderFieldDisabled,
      orderPeriodLockMessageVisible,
      lockBannerVisible: orderPeriodLockMessageVisible,
      saveButtonVisible,
      unexpectedLayoutDetected: !pageReady && !saveButtonVisible,
    };
  }

  private async findPreorderSection(): Promise<Locator | null> {
    for (const hint of smartStoreSelectors.productEdit.preorderSectionHints) {
      for (const selector of smartStoreSelectors.productEdit.preorderSectionContainers) {
        const candidates = this.page.locator(selector).filter({ hasText: hint });
        const count = Math.min(await candidates.count().catch(() => 0), 20);

        for (let index = 0; index < count; index += 1) {
          const candidate = candidates.nth(index);
          const text = await this.getText(candidate);
          const optionMatch =
            smartStoreSelectors.productEdit.normalOptionHints.some((pattern) =>
              pattern.test(text),
            ) ||
            smartStoreSelectors.productEdit.preorderOptionHints.some((pattern) =>
              pattern.test(text),
            );

          if (optionMatch) {
            return candidate;
          }
        }
      }
    }

    return null;
  }

  private async findOptionByHints(
    section: Locator,
    hints: readonly RegExp[],
  ): Promise<Locator | null> {
    for (const hint of hints) {
      for (const selector of sectionInteractiveSelectors) {
        const candidate = section.locator(selector).filter({ hasText: hint }).first();
        const count = await candidate.count().catch(() => 0);

        if (count > 0) {
          return candidate;
        }
      }

      const labelledCandidate = section.getByLabel(hint).first();
      const labelledCount = await labelledCandidate.count().catch(() => 0);

      if (labelledCount > 0) {
        return labelledCandidate;
      }

      const textCandidate = section.getByText(hint).first();
      const textCount = await textCandidate.count().catch(() => 0);

      if (textCount > 0) {
        return textCandidate;
      }
    }

    return null;
  }

  private async isOptionSelected(option: Locator | null): Promise<boolean> {
    if (!option) {
      return false;
    }

    return option
      .evaluate((element) => {
        const htmlElement = element as HTMLElement;
        const inputElement = element as HTMLInputElement;
        const className =
          typeof htmlElement.className === 'string' ? htmlElement.className : '';

        if (element.getAttribute('aria-checked') === 'true') {
          return true;
        }

        if (element.getAttribute('aria-selected') === 'true') {
          return true;
        }

        if (inputElement.checked) {
          return true;
        }

        if (/\b(selected|checked|active|on)\b/i.test(className)) {
          return true;
        }

        const checkedDescendant = element.querySelector(
          '[aria-checked="true"], [aria-selected="true"], input:checked',
        );

        return checkedDescendant !== null;
      })
      .catch(() => false);
  }

  async readSaveUiSignal(): Promise<'TOAST' | 'BANNER' | null> {
    const successVisible = await this.isAnyVisible(
      smartStoreSelectors.productEdit.successIndicators,
      5_000,
    );

    if (!successVisible) {
      return null;
    }

    if (
      await this.isAnyVisible(smartStoreSelectors.common.toastIndicators, 500)
    ) {
      return 'TOAST';
    }

    return 'BANNER';
  }
}
