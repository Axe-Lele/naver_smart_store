// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DateResolverPort, SellerCenterPageGatewayPort } from '../../apps/chrome-extension/src/application/ports.js';
import {
  DEFAULT_RUN_POLICY,
  ProductId,
  ProductProcessingState,
  type Product,
} from '../../apps/chrome-extension/src/domain/index.js';
import {
  InMemorySelectorRegistry,
  ProductEditPageDriver,
  WaitStrategy,
} from '../../apps/chrome-extension/src/infrastructure/index.js';

describe('ProductEditPageDriver preorder disclosure', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(WaitStrategy.prototype, 'waitForReady').mockResolvedValue();
    vi.spyOn(WaitStrategy.prototype, 'throttle').mockResolvedValue();
    Object.defineProperty(document, 'readyState', {
      configurable: true,
      value: 'complete',
    });
    document.body.innerHTML = '';
  });

  it('opens the preorder disclosure before clicking the enabled control when hidden controls are already in the DOM', async () => {
    const steps: string[] = [];
    renderCollapsedPreorderEditor(steps);

    const driver = new ProductEditPageDriver(
      createGateway(),
      new InMemorySelectorRegistry(),
      createDateResolver(),
      document,
      window,
      undefined,
      undefined,
      undefined,
      async () => {
        const body = document.querySelector('#preorderBody') as HTMLElement;
        if (window.getComputedStyle(body).display === 'none') {
          steps.push('enable-before-open');
          return false;
        }

        steps.push('enable');
        (document.querySelector('#preOrder1_1') as HTMLInputElement).checked = true;
        return true;
      },
      async () => {
        steps.push('calendar');
        return false;
      },
    );

    const result = await driver.preparePreorderChangePlan(createProduct(), {
      ...DEFAULT_RUN_POLICY,
      dryRun: false,
    });

    expect('state' in result).toBe(true);
    if ('state' in result) {
      expect(result.state).toBe(ProductProcessingState.STOPPED);
      expect(result.message).toContain('주문 시작일 달력보기');
    }
    expect(steps).toEqual(['expand', 'enable', 'calendar']);
    expect(document.querySelector('#preorderToggle')?.getAttribute('aria-expanded')).toBe('true');
  });
});

function renderCollapsedPreorderEditor(steps: string[]): void {
  document.body.innerHTML = `
    <section name="preOrder" id="preorder">
      <div class="form-section">
        <div class="title-line">
          <div class="input-content">
            <strong>예약구매</strong>
            <span>설정안함</span>
          </div>
          <button id="preorderToggle" type="button" aria-expanded="false" aria-label="예약구매 열기"></button>
        </div>
        <div id="preorderBody" style="display: none;">
          <div id="preorderControls">
            <label for="preOrder1_1">설정함</label>
            <input id="preOrder1_1" name="preOrder1" value="true" type="radio" data-nclicks-code="pro.on" />
            <label for="preOrder1_0">설정안함</label>
            <input id="preOrder1_0" name="preOrder1" value="false" type="radio" checked />
          </div>
          <div id="orderPeriod">
            <span>주문기간</span>
            <input name="product.saleStartDate" />
            <button type="button" aria-label="달력"></button>
            <input name="product.saleEndDate" />
            <button type="button" aria-label="달력"></button>
          </div>
        </div>
      </div>
    </section>
    <button id="saveButton" type="button">저장하기</button>
  `;

  document.querySelector('#preorderToggle')?.addEventListener('click', () => {
    steps.push('expand');
    (document.querySelector('#preorderBody') as HTMLElement).style.display = 'block';
    document.querySelector('#preorderToggle')?.setAttribute('aria-expanded', 'true');
  });
}

function createProduct(): Product {
  return {
    id: ProductId.create('1234567890'),
    sourceScope: 'bundle-delivery-search-result',
    sourceVerification: 'verified',
  };
}

function createGateway(): SellerCenterPageGatewayPort {
  return {
    getPageTitle: () => '상품 수정',
    getPageUrl: () => 'https://sell.smartstore.naver.com/#/products/origin-edit/1234567890',
    isSellerCenterSurface: () => true,
    captureHtmlSnapshot: () => document.documentElement.outerHTML,
    getBodyText: () => document.body.textContent ?? '',
  };
}

function createDateResolver(): DateResolverPort {
  return {
    async resolveMaximumAllowedDate() {
      return {
        strategy: 'ui-max',
        value: '2027-01-01',
        verificationStatus: 'verified',
        note: 'test resolver',
      };
    },
  };
}
