// File: packages/infrastructure-playwright/src/pages/smartstore-product-edit.page.ts
import type { Locator, Page } from 'playwright';

import { classifyProductBySignals, type ProductClassificationDecision } from '@smart-store/core';

import type { ResolvedSelectorProfile } from '../config/selector-profile.js';
import { BasePlaywrightPage } from './base-playwright.page.js';

export class SmartStoreProductEditPage extends BasePlaywrightPage {
  constructor(
    page: Page,
    selectorProfile: ResolvedSelectorProfile,
  ) {
    super(page, selectorProfile);
  }

  getReadySelectors(): readonly string[] {
    return [
      ...this.selectorProfile.productEdit.pageIdentity,
      ...this.selectorProfile.productEdit.saveButtons,
    ];
  }

  async isReady(timeoutMs = 8_000): Promise<boolean> {
    await this.waitForSettled(500);
    return (await this.findVisibleLocator(this.getReadySelectors(), timeoutMs)) !== null;
  }

  async classify(): Promise<ProductClassificationDecision> {
    const pageReady = await this.isReady();
    const editPageIdentityVisible = await this.isAnyVisible(
      this.selectorProfile.productEdit.pageIdentity,
      1_500,
    );
    const saveButtonVisible = await this.isAnyVisible(
      this.selectorProfile.productEdit.saveButtons,
      1_500,
    );
    const orderPeriodLockMessageVisible = await this.isAnyVisible(
      this.selectorProfile.productEdit.lockIndicators,
      1_500,
    );
    const preorderSection = await this.findPreorderSection();
    const normalOption = preorderSection
      ? await this.findOptionByHints(
          preorderSection,
          this.selectorProfile.productEdit.normalOptionHints,
        )
      : null;
    const preorderOption = preorderSection
      ? await this.findOptionByHints(
          preorderSection,
          this.selectorProfile.productEdit.preorderOptionHints,
        )
      : null;

    return classifyProductBySignals({
      pageReady,
      editPageIdentityVisible,
      notFoundMessageVisible: false,
      preorderSectionVisible: preorderSection !== null,
      preorderSelected: await this.isOptionSelected(preorderOption),
      normalSelected: await this.isOptionSelected(normalOption),
      normalOptionVisible: normalOption !== null,
      normalOptionDisabled: await this.isLocatorDisabled(normalOption),
      preorderFieldDisabled: await this.isLocatorDisabled(preorderSection),
      orderPeriodLockMessageVisible,
      lockBannerVisible: orderPeriodLockMessageVisible,
      saveButtonVisible,
      unexpectedLayoutDetected: !pageReady && !saveButtonVisible,
    });
  }

  async convertToNormalProduct(): Promise<void> {
    const preorderSection = await this.findPreorderSection();
    if (!preorderSection) {
      throw new Error('Preorder section could not be found on the edit page.');
    }

    const normalOption = await this.findOptionByHints(
      preorderSection,
      this.selectorProfile.productEdit.normalOptionHints,
    );

    if (!normalOption) {
      throw new Error('Normal-product option was not found inside the preorder section.');
    }

    const lockVisible = await this.isAnyVisible(
      this.selectorProfile.productEdit.lockIndicators,
      500,
    );
    const disabled = await this.isLocatorDisabled(normalOption);

    if (lockVisible || disabled) {
      throw new Error(
        'Normal-product conversion UI is disabled or blocked by an order-period notice.',
      );
    }

    if (!(await this.isOptionSelected(normalOption))) {
      await normalOption.click();
      await this.waitForSettled(600);

      if (!(await this.isOptionSelected(normalOption))) {
        throw new Error(
          'The normal-product option did not become selected after clicking it.',
        );
      }
    }

    const saveButton = await this.findVisibleLocator(
      this.selectorProfile.productEdit.saveButtons,
      8_000,
    );

    if (!saveButton) {
      throw new Error('Save button was not found after switching the product type.');
    }

    await saveButton.click();
    await this.waitForSettled(1_000);
  }

  async readSaveUiSignal(): Promise<'TOAST' | 'BANNER' | null> {
    const successVisible = await this.isAnyVisible(
      this.selectorProfile.productEdit.successIndicators,
      5_000,
    );

    if (!successVisible) {
      return null;
    }

    if (await this.isAnyVisible(this.selectorProfile.common.toastIndicators, 500)) {
      return 'TOAST';
    }

    return 'BANNER';
  }

  private async findPreorderSection(): Promise<Locator | null> {
    for (const hint of this.selectorProfile.productEdit.preorderSectionHints) {
      for (const selector of this.selectorProfile.productEdit.preorderSectionContainers) {
        const candidates = this.page.locator(selector).filter({ hasText: hint });
        const count = Math.min(await candidates.count().catch(() => 0), 20);

        for (let index = 0; index < count; index += 1) {
          const candidate = candidates.nth(index);
          const text = await this.getText(candidate);
          const optionMatch =
            this.selectorProfile.productEdit.normalOptionHints.some((pattern) =>
              pattern.test(text),
            ) ||
            this.selectorProfile.productEdit.preorderOptionHints.some((pattern) =>
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
      for (const selector of this.selectorProfile.productEdit.interactiveSelectors) {
        const candidate = section.locator(selector).filter({ hasText: hint }).first();
        const count = await candidate.count().catch(() => 0);

        if (count > 0) {
          return candidate;
        }
      }

      const labelledCandidate = section.getByLabel(hint).first();
      if ((await labelledCandidate.count().catch(() => 0)) > 0) {
        return labelledCandidate;
      }

      const textCandidate = section.getByText(hint).first();
      if ((await textCandidate.count().catch(() => 0)) > 0) {
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
}
