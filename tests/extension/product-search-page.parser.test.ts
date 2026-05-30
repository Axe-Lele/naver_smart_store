// File: C:\smart-store\tests\extension\product-search-page.parser.test.ts
// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  SellerCenterPageGatewayPort,
  SelectorRegistryPort,
} from '../../apps/chrome-extension/src/application/ports.js';
import { DomExplorer } from '../../apps/chrome-extension/src/infrastructure/dom-explorer.js';
import { ProductSearchPageParser } from '../../apps/chrome-extension/src/infrastructure/product-search-page.parser.js';
import { WaitStrategy } from '../../apps/chrome-extension/src/infrastructure/wait-strategy.js';

describe('ProductSearchPageParser', () => {
  beforeEach(() => {
    vi.spyOn(WaitStrategy.prototype, 'waitForReady').mockResolvedValue();
    Object.defineProperty(document, 'readyState', {
      configurable: true,
      value: 'complete',
    });
    vi.spyOn(window.performance, 'getEntriesByType').mockReturnValue([]);
  });

  it('collects bundle-delivery targets from the current result rows', async () => {
    document.body.innerHTML = `
      <input id="bundle-filter" checked value="묶음배송" />
      <table>
        <tbody>
          <tr>
            <td><a class="edit-link" href="/edit?originProductNo=123456&channelProductNo=654321">수정</a></td>
            <td><span>테스트 상품</span></td>
          </tr>
        </tbody>
      </table>
    `;

    const parser = new ProductSearchPageParser(
      createGateway(),
      createRegistry(),
      new DomExplorer(document),
      document,
      window,
    );

    const result = await parser.collectBundleDeliveryTargets();

    expect(result.products).toHaveLength(1);
    expect(result.products[0]?.id.toString()).toBe('123456');
    expect(result.products[0]?.name).toBe('테스트 상품');
    expect(result.products[0]?.editUrl).toContain('originProductNo=123456');
    expect(result.products[0]?.sourceVerification).toBe('verified');
    expect(result.verificationStatus).toBe('verified');
  });

  it('accepts bundle-delivery when it is shown as an applied search condition chip', async () => {
    document.body.innerHTML = `
      <div class="selected-condition-chip">
        <span>검색 조건: 묶음배송</span>
        <button aria-label="조건 삭제">x</button>
      </div>
      <table>
        <tbody>
          <tr>
            <td><a class="edit-link" href="/edit?originProductNo=223456&channelProductNo=754321">수정</a></td>
            <td><span>조건 태그 상품</span></td>
          </tr>
        </tbody>
      </table>
    `;

    const parser = new ProductSearchPageParser(
      createGateway(),
      createRegistry(),
      new DomExplorer(document),
      document,
      window,
    );

    const result = await parser.collectBundleDeliveryTargets();

    expect(result.products).toHaveLength(1);
    expect(result.products[0]?.id.toString()).toBe('223456');
    expect(result.products[0]?.name).toBe('조건 태그 상품');
    expect(result.verificationStatus).toBe('verified');
    expect(result.note).toContain('appears applied');
  });

  it('accepts bundle-delivery when the selected detail-search value is stored in a hidden control', async () => {
    document.body.innerHTML = `
      <input type="hidden" name="deliveryFeeCondition" value="GROUP_DELIVERY" />
      <table>
        <tbody>
          <tr>
            <td><a class="edit-link" href="/edit?originProductNo=773456">수정</a></td>
            <td><span>숨은 조건 상품</span></td>
          </tr>
        </tbody>
      </table>
    `;

    const parser = new ProductSearchPageParser(
      createGateway(),
      createRegistry(),
      new DomExplorer(document),
      document,
      window,
    );

    const result = await parser.collectBundleDeliveryTargets();

    expect(result.products).toHaveLength(1);
    expect(result.products[0]?.id.toString()).toBe('773456');
    expect(result.note).toContain('appears selected');
  });

  it('accepts the Smart Store selectize bundle-delivery possible value', async () => {
    document.body.innerHTML = `
      <div class="form-group" ng-repeat="type in ::vm.config.productSearchDetailTypes">
        <div class="selectize-control ng-pristine ng-untouched ng-valid single">
          <div class="selectize-input items ng-valid has-options full has-items ng-dirty">
            <div data-value="BUNDLEGROUP_POSSIBLE" class="item">가능</div>
            <input type="text" autocomplete="off" tabindex="0" readonly="" />
          </div>
          <div class="selectize-dropdown single ng-pristine ng-untouched ng-valid" style="display: none;">
            <div class="selectize-dropdown-content">
              <div data-value="" data-selectable="" class="option">묶음배송</div>
              <div data-value="BUNDLEGROUP_POSSIBLE" data-selectable="" class="option selected">가능</div>
              <div data-value="BUNDLEGROUP_IMPOSSIBLE" data-selectable="" class="option">불가</div>
            </div>
          </div>
        </div>
        <select selectize="" class="selectized" tabindex="-1">
          <option value="BUNDLEGROUP_POSSIBLE" selected="selected">가능</option>
        </select>
      </div>
      <table>
        <tbody>
          <tr>
            <td><a class="edit-link" href="/edit?originProductNo=883456">수정</a></td>
            <td><span>묶음 가능 상품</span></td>
          </tr>
        </tbody>
      </table>
    `;

    const parser = new ProductSearchPageParser(
      createGateway(),
      createRegistry(),
      new DomExplorer(document),
      document,
      window,
    );

    const result = await parser.collectBundleDeliveryTargets();

    expect(result.products).toHaveLength(1);
    expect(result.products[0]?.id.toString()).toBe('883456');
    expect(result.verificationStatus).toBe('verified');
    expect(result.note).toContain('BUNDLEGROUP_POSSIBLE');
  });

  it('does not accept the Smart Store selectize bundle-delivery impossible value', async () => {
    document.body.innerHTML = `
      <div class="form-group" ng-repeat="type in ::vm.config.productSearchDetailTypes">
        <div class="selectize-control single">
          <div class="selectize-input items has-items">
            <div data-value="BUNDLEGROUP_IMPOSSIBLE" class="item">불가</div>
          </div>
          <div class="selectize-dropdown single" style="display: none;">
            <div class="selectize-dropdown-content">
              <div data-value="" data-selectable="" class="option">묶음배송</div>
              <div data-value="BUNDLEGROUP_POSSIBLE" data-selectable="" class="option">가능</div>
              <div data-value="BUNDLEGROUP_IMPOSSIBLE" data-selectable="" class="option selected">불가</div>
            </div>
          </div>
        </div>
        <select selectize="" class="selectized" tabindex="-1">
          <option value="BUNDLEGROUP_IMPOSSIBLE" selected="selected">불가</option>
        </select>
      </div>
      <table>
        <tbody>
          <tr>
            <td><a class="edit-link" href="/edit?originProductNo=983456">수정</a></td>
            <td><span>묶음 불가 상품</span></td>
          </tr>
        </tbody>
      </table>
    `;

    const parser = new ProductSearchPageParser(
      createGateway(),
      createRegistry(),
      new DomExplorer(document),
      document,
      window,
    );

    const result = await parser.collectBundleDeliveryTargets();

    expect(result.products).toEqual([]);
    expect(result.note).toContain('Please apply the filter manually');
  });

  it('prepares the all-period bundle-delivery search before collecting all pages', async () => {
    document.body.innerHTML = `
      <div class="form-group" ng-if="vm.dateRangeUsable">
        <div class="btn-toolbar">
          <div class="btn-group" data-nclicks-code="spd.quick">
            <button type="button" class="btn btn-primary2 active">1년</button>
            <button type="button" class="btn btn-primary2">전체</button>
          </div>
        </div>
      </div>
      <button type="button" class="btn btn-default btn-right active" data-nclicks-code="sss.open">
        상세검색 <i class="fn fn-down2" aria-hidden="true"></i>
      </button>
      <div class="form-group">
        <div class="selectize-control single">
          <div class="selectize-input items full has-options has-items">
            <div data-value="" class="item">묶음배송</div>
            <input type="text" autocomplete="off" tabindex="0" readonly="" />
          </div>
          <div class="selectize-dropdown single" style="display: none;">
            <div class="selectize-dropdown-content">
              <div data-value="" data-selectable="" class="option selected">묶음배송</div>
              <div data-value="BUNDLEGROUP_POSSIBLE" data-selectable="" class="option">가능</div>
              <div data-value="BUNDLEGROUP_IMPOSSIBLE" data-selectable="" class="option">불가</div>
            </div>
          </div>
        </div>
        <select selectize="" class="selectized" tabindex="-1">
          <option value="" selected="selected">묶음배송</option>
          <option value="BUNDLEGROUP_POSSIBLE">가능</option>
          <option value="BUNDLEGROUP_IMPOSSIBLE">불가</option>
        </select>
      </div>
      <button type="button" class="btn btn-primary search-button">검색</button>
      <table>
        <tbody>
          <tr>
            <td><a class="edit-link" href="/edit?originProductNo=1183456">수정</a></td>
            <td><span>자동 조건 상품</span></td>
          </tr>
        </tbody>
      </table>
    `;

    const periodButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-nclicks-code="spd.quick"] button'));
    const detailButton = document.querySelector<HTMLButtonElement>('[data-nclicks-code="sss.open"]')!;
    const currentItem = document.querySelector<HTMLElement>('.selectize-input .item')!;
    const possibleOption = document.querySelector<HTMLElement>('[data-value="BUNDLEGROUP_POSSIBLE"].option')!;
    const select = document.querySelector<HTMLSelectElement>('select.selectized')!;
    const searchButton = document.querySelector<HTMLButtonElement>('.search-button')!;
    const searchClickHandler = vi.fn();

    periodButtons.at(-1)?.addEventListener('click', () => {
      periodButtons.forEach((button) => button.classList.remove('active'));
      periodButtons.at(-1)?.classList.add('active');
    });
    detailButton.addEventListener('click', () => {
      detailButton.classList.remove('active');
      detailButton.querySelector('i')?.classList.remove('fn-down2');
      detailButton.querySelector('i')?.classList.add('fn-up2');
    });
    possibleOption.addEventListener('click', () => {
      currentItem.dataset.value = 'BUNDLEGROUP_POSSIBLE';
      currentItem.textContent = '가능';
      select.value = 'BUNDLEGROUP_POSSIBLE';
      Array.from(select.options).forEach((option) => {
        option.selected = option.value === 'BUNDLEGROUP_POSSIBLE';
      });
      document.querySelector('[data-value=""].option')?.classList.remove('selected');
      possibleOption.classList.add('selected');
    });
    searchButton.addEventListener('click', searchClickHandler);

    const parser = new ProductSearchPageParser(
      createGateway(),
      createRegistry(),
      new DomExplorer(document),
      document,
      window,
    );

    const result = await parser.collectBundleDeliveryTargets({
      pagination: 'all-pages',
    });

    expect(periodButtons.at(-1)?.classList.contains('active')).toBe(true);
    expect(detailButton.classList.contains('active')).toBe(false);
    expect(currentItem.dataset.value).toBe('BUNDLEGROUP_POSSIBLE');
    expect(searchClickHandler).toHaveBeenCalledTimes(1);
    expect(result.verificationStatus).toBe('verified');
    expect(result.products.map((product) => product.id.toString())).toEqual(['1183456']);
    expect(result.note).toContain('자동 검색 조건 설정');
  });

  it('does not use edit action text as the product name', async () => {
    document.body.innerHTML = `
      <input id="bundle-filter" checked value="묶음배송" />
      <table>
        <tbody>
          <tr>
            <td><input type="checkbox" /></td>
            <td>13532514584</td>
            <td><button>수정</button></td>
            <td><a class="name-link" href="/products/detail/13532514584">위시피규어 예약 상품 A</a></td>
            <td><span>판매중</span></td>
            <td><a class="edit-link" href="/edit?originProductNo=13532514584">수정</a></td>
          </tr>
        </tbody>
      </table>
    `;

    const parser = new ProductSearchPageParser(
      createGateway(),
      createRegistry(),
      new DomExplorer(document),
      document,
      window,
    );

    const result = await parser.collectBundleDeliveryTargets();

    expect(result.products).toHaveLength(1);
    expect(result.products[0]?.name).toBe('위시피규어 예약 상품 A');
  });

  it('keeps collection scoped to the visible product list table without trimming by displayed count', async () => {
    document.body.innerHTML = `
      <input id="bundle-filter" checked value="묶음배송" />
      <section>상품목록 (총 99개)</section>
      <div data-row="noise">
        <a class="edit-link" href="/edit?originProductNo=999999">수정</a>
        <span>상품목록 바깥 노이즈</span>
      </div>
      <table aria-label="상품목록">
        <thead>
          <tr>
            <th>상품번호</th>
            <th>상품명</th>
            <th>수정</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>111111</td>
            <td><span>첫 번째 상품</span></td>
            <td><a class="edit-link" href="/edit?originProductNo=111111">수정</a></td>
          </tr>
          <tr>
            <td>222222</td>
            <td><span>두 번째 상품</span></td>
            <td><a class="edit-link" href="/edit?originProductNo=222222">수정</a></td>
          </tr>
          <tr style="display: none">
            <td>333333</td>
            <td><span>숨겨진 상품</span></td>
            <td><a class="edit-link" href="/edit?originProductNo=333333">수정</a></td>
          </tr>
        </tbody>
      </table>
      <table>
        <tbody>
          <tr role="row">
            <td>444444</td>
            <td><span>다른 테이블 상품</span></td>
            <td><a class="edit-link" href="/edit?originProductNo=444444">수정</a></td>
          </tr>
        </tbody>
      </table>
    `;

    const parser = new ProductSearchPageParser(
      createGateway(),
      createRegistry(),
      new DomExplorer(document),
      document,
      window,
    );

    const result = await parser.collectBundleDeliveryTargets();

    expect(result.products.map((product) => product.id.toString())).toEqual([
      '111111',
      '222222',
    ]);
    expect(result.note).toContain('collected=2');
    expect(result.note).not.toContain('trimmed');
    expect(result.note).not.toContain('displayedTotal');
  });

  it('uses the product-name column instead of nearby action buttons', async () => {
    document.body.innerHTML = `
      <input id="bundle-filter" checked value="묶음배송" />
      <section>상품목록 (총 1개)</section>
      <table>
        <thead>
          <tr>
            <th>선택</th>
            <th>수정</th>
            <th>복사</th>
            <th>상품번호</th>
            <th>판매자상품코드</th>
            <th>상품명</th>
            <th>상세설명</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><input type="checkbox" /></td>
            <td><a class="edit-link" href="/edit?originProductNo=555555">수정</a></td>
            <td><button>복사</button></td>
            <td>555555</td>
            <td>TMG.172491(14630)</td>
            <td><a href="/products/detail/555555">[테스트] 26년 5월 발매 가을의 예약 상품</a></td>
            <td><button>상세설명</button></td>
          </tr>
        </tbody>
      </table>
    `;

    const parser = new ProductSearchPageParser(
      createGateway(),
      createRegistry(),
      new DomExplorer(document),
      document,
      window,
    );

    const result = await parser.collectBundleDeliveryTargets();

    expect(result.products).toHaveLength(1);
    expect(result.products[0]?.name).toBe('[테스트] 26년 5월 발매 가을의 예약 상품');
  });

  it('chooses the edit URL instead of an earlier product detail link', async () => {
    document.body.innerHTML = `
      <input id="bundle-filter" checked value="묶음배송" />
      <table>
        <tbody>
          <tr>
            <td>777777</td>
            <td><a href="/products/detail/777777">detail should not be used</a></td>
            <td><a href="/products/edit?originProductNo=777777">수정</a></td>
          </tr>
        </tbody>
      </table>
    `;

    const parser = new ProductSearchPageParser(
      createGateway(),
      createRegistryWithoutEditAction(),
      new DomExplorer(document),
      document,
      window,
    );

    const result = await parser.collectBundleDeliveryTargets();

    expect(result.products).toHaveLength(1);
    expect(result.products[0]?.editUrl).toContain('/products/edit');
    expect(result.products[0]?.editUrl).not.toContain('/products/detail');
  });

  it('accepts the seller-center hash edit URL pattern', async () => {
    document.body.innerHTML = `
      <input id="bundle-filter" checked value="묶음배송" />
      <table>
        <tbody>
          <tr>
            <td>13468359980</td>
            <td><a href="/products/detail/13468359980">detail should not be used</a></td>
            <td>
              <a class="edit-link" href="https://sell.smartstore.naver.com/#/products/edit/13468359980">수정</a>
            </td>
          </tr>
        </tbody>
      </table>
    `;

    const parser = new ProductSearchPageParser(
      createGateway(),
      createRegistry(),
      new DomExplorer(document),
      document,
      window,
    );

    const result = await parser.collectBundleDeliveryTargets();

    expect(result.products).toHaveLength(1);
    expect(result.products[0]?.id.toString()).toBe('13468359980');
    expect(result.products[0]?.editUrl).toBe(
      'https://sell.smartstore.naver.com/#/products/edit/13468359980',
    );
  });

  it('keeps the visible 상품번호 even when the edit URL uses another internal id', async () => {
    document.body.innerHTML = `
      <input id="bundle-filter" checked value="묶음배송" />
      <table>
        <thead>
          <tr>
            <th>상품번호</th>
            <th>상품명</th>
            <th>수정</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>13527657915</td>
            <td><a href="/products/detail/13527657915">visible product</a></td>
            <td>
              <a class="edit-link" href="https://sell.smartstore.naver.com/#/products/edit/13468359980">수정</a>
            </td>
          </tr>
        </tbody>
      </table>
    `;

    const parser = new ProductSearchPageParser(
      createGateway(),
      createRegistry(),
      new DomExplorer(document),
      document,
      window,
    );

    const result = await parser.collectBundleDeliveryTargets();

    expect(result.products).toHaveLength(1);
    expect(result.products[0]?.id.toString()).toBe('13527657915');
    expect(result.products[0]?.editUrl).toContain('/products/edit/13468359980');
  });

  it('collects a product with a URL-less edit button without using the detail link', async () => {
    document.body.innerHTML = `
      <input id="bundle-filter" checked value="묶음배송" />
      <table>
        <tbody>
          <tr>
            <td>888888</td>
            <td><a href="/products/detail/888888">detail should not be used</a></td>
            <td><button class="edit-link">수정</button></td>
          </tr>
        </tbody>
      </table>
    `;

    const parser = new ProductSearchPageParser(
      createGateway(),
      createRegistry(),
      new DomExplorer(document),
      document,
      window,
    );

    const result = await parser.collectBundleDeliveryTargets();

    expect(result.products).toHaveLength(1);
    expect(result.products[0]?.id.toString()).toBe('888888');
    expect(result.products[0]?.editUrl).toBeUndefined();
  });

  it('clicks a URL-less edit button for a collected product', async () => {
    document.body.innerHTML = `
      <input id="bundle-filter" checked value="묶음배송" />
      <table>
        <tbody>
          <tr>
            <td>889900</td>
            <td><a href="/products/detail/889900">detail should not be used</a></td>
            <td><button class="edit-link">수정</button></td>
          </tr>
        </tbody>
      </table>
    `;

    const editButton = document.querySelector('.edit-link') as HTMLButtonElement;
    const clickHandler = vi.fn();
    editButton.addEventListener('click', clickHandler);

    const parser = new ProductSearchPageParser(
      createGateway(),
      createRegistry(),
      new DomExplorer(document),
      document,
      window,
    );

    await expect(parser.openEditForProduct('889900')).resolves.toBe(true);
    expect(clickHandler).toHaveBeenCalledTimes(1);
  });

  it('opens a visible edit action without waiting for global page readiness', async () => {
    const waitForReady = vi
      .spyOn(WaitStrategy.prototype, 'waitForReady')
      .mockRejectedValue(new Error('global readiness should not block a visible edit row'));
    document.body.innerHTML = `
      <input id="bundle-filter" checked value="묶음배송" />
      <table>
        <tbody>
          <tr>
            <td>778899</td>
            <td><button class="edit-link">수정</button></td>
          </tr>
        </tbody>
      </table>
    `;

    const editButton = document.querySelector('.edit-link') as HTMLButtonElement;
    const clickHandler = vi.fn();
    editButton.addEventListener('click', clickHandler);

    const parser = new ProductSearchPageParser(
      createGateway(),
      createRegistry(),
      new DomExplorer(document),
      document,
      window,
    );

    await expect(parser.openEditForProduct('778899')).resolves.toBe(true);
    expect(waitForReady).not.toHaveBeenCalled();
    expect(clickHandler).toHaveBeenCalledTimes(1);
  });

  it('clicks the ag-grid edit button in the row with the matching product number', async () => {
    document.body.innerHTML = `
      <input id="bundle-filter" checked value="묶음배송" />
      <div class="ag-body-viewport ag-layout-normal" role="presentation">
        <div class="ag-pinned-left-cols-container" role="presentation">
          <div role="row" row-index="0" row-id="0" class="ag-row ag-row-even">
            <div role="gridcell" col-id="edit">
              <button class="btn btn-primary btn-xs" data-nclicks-code="itg.edit" data-product-id="13527657915">수정</button>
            </div>
            <div role="gridcell" col-id="copy"><button>복사</button></div>
            <div role="gridcell" col-id="storefarmChannelProductNo">
              <a href="https://smartstore.naver.com/wishfigure_yoyakukan/products/13527657915" data-nclicks-code="itg.numbersf">13527657915</a>
            </div>
            <div role="gridcell" col-id="sellerManagementCode">TMG.172491(14630)</div>
            <div role="gridcell" col-id="productName">[테스트]26년 5월 발매 가을의 색 by Hiten 피규어 - 하비액션</div>
          </div>
          <div role="row" row-index="1" row-id="1" class="ag-row ag-row-odd">
            <div role="gridcell" col-id="edit">
              <button class="btn btn-primary btn-xs" data-nclicks-code="itg.edit" data-product-id="13527656761">수정</button>
            </div>
            <div role="gridcell" col-id="copy"><button>복사</button></div>
            <div role="gridcell" col-id="storefarmChannelProductNo">
              <a href="https://smartstore.naver.com/wishfigure_yoyakukan/products/13527656761" data-nclicks-code="itg.numbersf">13527656761</a>
            </div>
            <div role="gridcell" col-id="sellerManagementCode">TMG.172479(6545)</div>
            <div role="gridcell" col-id="productName">[테스트]26년 6월 발매 우리집 고양이가 여자애라 귀여워 키나코 넨도로이드</div>
          </div>
        </div>
        <div class="ag-center-cols-container" role="rowgroup">
          <div role="row" row-id="0" class="ag-row">
            <div role="gridcell" col-id="productStatusType"><span>판매중</span></div>
          </div>
          <div role="row" row-id="1" class="ag-row">
            <div role="gridcell" col-id="productStatusType"><span>판매중</span></div>
          </div>
        </div>
      </div>
    `;

    const clickedProductIds: string[] = [];
    document.querySelectorAll<HTMLButtonElement>('button[data-nclicks-code="itg.edit"]').forEach(
      (button) => {
        button.addEventListener('click', () => {
          clickedProductIds.push(button.dataset.productId ?? '');
        });
      },
    );

    const parser = new ProductSearchPageParser(
      createGateway(),
      createRegistry(),
      new DomExplorer(document),
      document,
      window,
    );

    const result = await parser.collectBundleDeliveryTargets();

    expect(result.products.map((product) => product.id.toString())).toEqual([
      '13527657915',
      '13527656761',
    ]);
    expect(result.products[1]?.name).toBe(
      '[테스트]26년 6월 발매 우리집 고양이가 여자애라 귀여워 키나코 넨도로이드',
    );

    await expect(parser.openEditForProduct('13527656761')).resolves.toBe(true);
    expect(clickedProductIds).toEqual(['13527656761']);
  });

  it('scrolls the virtualized ag-grid page to collect all visible-page rows', async () => {
    document.body.innerHTML = `
      <input id="bundle-filter" checked value="묶음배송" />
      <div class="ag-root" role="grid" aria-rowcount="7">
        <div class="ag-body-viewport ag-layout-normal" ref="eBodyViewport" style="height: 80px;">
          <div class="ag-pinned-left-cols-container" ref="eLeftContainer" style="height: 200px;"></div>
        </div>
      </div>
      <nav class="seller-pagination">
        <span class="ag-paging-row-summary-panel _sell_pageRowSummaryPanel" style="display:none;">
          <span ref="lbFirstRowOnPage" class="_sell_firstRowOnPage">1</span>
          <span ref="lbLastRowOnPage" class="_sell_lastRowOnPage">5</span>
          <span ref="lbRecordCount" class="_sell_recordCount">5</span>
        </span>
      </nav>
    `;

    const viewport = document.querySelector('.ag-body-viewport') as HTMLElement;
    const rowsContainer = document.querySelector('.ag-pinned-left-cols-container') as HTMLElement;
    Object.defineProperty(viewport, 'clientHeight', { configurable: true, value: 80 });
    Object.defineProperty(viewport, 'scrollHeight', { configurable: true, value: 200 });

    const products = ['100001', '100002', '100003', '100004', '100005'];
    const renderRows = (startIndex: number) => {
      rowsContainer.innerHTML = products
        .slice(startIndex, startIndex + 2)
        .map((productId, offset) =>
          renderAgGridProductRow({
            rowIndex: startIndex + offset,
            productId,
            name: `가상 스크롤 상품 ${productId}`,
          }),
        )
        .join('');
    };

    viewport.addEventListener('scroll', () => {
      renderRows(Math.min(products.length - 2, Math.floor(viewport.scrollTop / 40)));
    });
    renderRows(0);

    const parser = new ProductSearchPageParser(
      createGateway(),
      createRegistry(),
      new DomExplorer(document),
      document,
      window,
    );

    const result = await parser.collectBundleDeliveryTargets();

    expect(result.verificationStatus).toBe('verified');
    expect(result.products.map((product) => product.id.toString())).toEqual(products);
    expect(result.note).toContain('expectedRows=5');
    expect(viewport.scrollTop).toBe(0);
  });

  it('scrolls the virtualized ag-grid page to open an off-screen edit button', async () => {
    document.body.innerHTML = `
      <input id="bundle-filter" checked value="묶음배송" />
      <div class="ag-root" role="grid" aria-rowcount="7">
        <div class="ag-body-viewport ag-layout-normal" ref="eBodyViewport" style="height: 80px;">
          <div class="ag-pinned-left-cols-container" ref="eLeftContainer" style="height: 200px;"></div>
        </div>
      </div>
      <nav class="seller-pagination">
        <span class="ag-paging-row-summary-panel _sell_pageRowSummaryPanel" style="display:none;">
          <span ref="lbFirstRowOnPage" class="_sell_firstRowOnPage">1</span>
          <span ref="lbLastRowOnPage" class="_sell_lastRowOnPage">5</span>
          <span ref="lbRecordCount" class="_sell_recordCount">5</span>
        </span>
      </nav>
    `;

    const viewport = document.querySelector('.ag-body-viewport') as HTMLElement;
    const rowsContainer = document.querySelector('.ag-pinned-left-cols-container') as HTMLElement;
    Object.defineProperty(viewport, 'clientHeight', { configurable: true, value: 80 });
    Object.defineProperty(viewport, 'scrollHeight', { configurable: true, value: 200 });

    const products = ['100001', '100002', '100003', '100004', '100005'];
    const clickedProductIds: string[] = [];
    const renderRows = (startIndex: number) => {
      rowsContainer.innerHTML = products
        .slice(startIndex, startIndex + 2)
        .map((productId, offset) =>
          renderAgGridProductRow({
            rowIndex: startIndex + offset,
            productId,
            name: `가상 스크롤 상품 ${productId}`,
          }),
        )
        .join('');
    };

    viewport.addEventListener('scroll', () => {
      renderRows(Math.min(products.length - 2, Math.floor(viewport.scrollTop / 40)));
    });
    rowsContainer.addEventListener('click', (event) => {
      const button = (event.target as Element).closest<HTMLButtonElement>(
        'button[data-product-id]',
      );
      if (button) {
        clickedProductIds.push(button.dataset.productId ?? '');
      }
    });
    renderRows(0);

    const parser = new ProductSearchPageParser(
      createGateway(),
      createRegistry(),
      new DomExplorer(document),
      document,
      window,
    );

    await expect(parser.openEditForProduct('100005')).resolves.toBe(true);
    expect(clickedProductIds).toEqual(['100005']);
  });

  it('falls back to the visible current-page list when the seller-center hides the bundle value', async () => {
    document.body.innerHTML = `
      <section class="detail-search">
        <span>상세검색</span>
        <button>배송비</button>
      </section>
      <section>상품목록 (총 5개)</section>
      <table>
        <thead>
          <tr>
            <th>상품번호</th>
            <th>상품명</th>
            <th>수정</th>
          </tr>
        </thead>
        <tbody>
          ${[1, 2, 3, 4, 5]
            .map(
              (index) => `
                <tr>
                  <td>88000${index}</td>
                  <td><span>현재 페이지 상품 ${index}</span></td>
                  <td><a class="edit-link" href="/edit?originProductNo=88000${index}">수정</a></td>
                </tr>
              `,
            )
            .join('')}
        </tbody>
      </table>
    `;

    const parser = new ProductSearchPageParser(
      createGateway(),
      createRegistry(),
      new DomExplorer(document),
      document,
      window,
    );

    const result = await parser.collectBundleDeliveryTargets();

    expect(result.products).toHaveLength(5);
    expect(result.note).toContain('visible current-page product list only');
  });

  it('does not use the current-page fallback for broad result pages', async () => {
    document.body.innerHTML = `
      <section class="detail-search">
        <span>상세검색</span>
        <button>배송비</button>
      </section>
      <section>상품목록 (총 100개)</section>
      <table>
        <thead>
          <tr>
            <th>상품번호</th>
            <th>상품명</th>
            <th>수정</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>990001</td>
            <td><span>넓은 결과 상품</span></td>
            <td><a class="edit-link" href="/edit?originProductNo=990001">수정</a></td>
          </tr>
        </tbody>
      </table>
    `;

    const parser = new ProductSearchPageParser(
      createGateway(),
      createRegistry(),
      new DomExplorer(document),
      document,
      window,
    );

    const result = await parser.collectBundleDeliveryTargets();

    expect(result.products).toEqual([]);
    expect(result.note).toContain('Please apply the filter manually');
  });

  it('does not accept a plain detail-search label as an applied bundle-delivery condition', async () => {
    document.body.innerHTML = `
      <section class="filter-panel">
        <label>묶음배송</label>
      </section>
      <table>
        <tbody>
          <tr>
            <td><a class="edit-link" href="/edit?originProductNo=323456">수정</a></td>
            <td><span>라벨만 있는 상품</span></td>
          </tr>
        </tbody>
      </table>
    `;

    const parser = new ProductSearchPageParser(
      createGateway(),
      createRegistry(),
      new DomExplorer(document),
      document,
      window,
    );

    const result = await parser.collectBundleDeliveryTargets();

    expect(result.products).toEqual([]);
    expect(result.note).toContain('Please apply the filter manually');
  });

  it('does not accept a selected class alone as an applied bundle-delivery condition', async () => {
    document.body.innerHTML = `
      <div class="selected">
        <span>묶음배송</span>
      </div>
      <table>
        <tbody>
          <tr>
            <td><a class="edit-link" href="/edit?originProductNo=423456">수정</a></td>
            <td><span>선택 UI만 있는 상품</span></td>
          </tr>
        </tbody>
      </table>
    `;

    const parser = new ProductSearchPageParser(
      createGateway(),
      createRegistry(),
      new DomExplorer(document),
      document,
      window,
    );

    const result = await parser.collectBundleDeliveryTargets();

    expect(result.products).toEqual([]);
    expect(result.note).toContain('Please apply the filter manually');
  });

  it('collects bundle-delivery targets across all result pages and restores the starting page', async () => {
    document.body.innerHTML = `
      <input id="bundle-filter" checked value="묶음배송" />
      <table aria-label="상품목록">
        <thead>
          <tr>
            <th>상품번호</th>
            <th>상품명</th>
            <th>수정</th>
          </tr>
        </thead>
        <tbody id="rows">
          <tr>
            <td>111111</td>
            <td><span>첫 페이지 상품</span></td>
            <td><a class="edit-link" href="/edit?originProductNo=111111">수정</a></td>
          </tr>
        </tbody>
      </table>
      <ul class="pagination _pc_pagination" data-nclicks-code="itg.page">
        <li class="_page active" data-page="1"><a href="#" data-page-link="1">1</a></li>
        <li class="_page" data-page="2"><a href="#" data-page-link="2">2</a></li>
        <li class="_page ag-paging-button disabled">
          <a ref="btPrev" aria-label="이전 페이지로 이동"><i class="seller-icon icon-left"></i></a>
        </li>
        <li class="_page ag-paging-button disabled">
          <a ref="btNext" aria-label="다음 페이지로 이동"><i class="seller-icon icon-right"></i></a>
        </li>
      </ul>
    `;

    const rows = document.querySelector('#rows') as HTMLElement;
    const pageOne = document.querySelector('li[data-page="1"]') as HTMLElement;
    const pageTwo = document.querySelector('li[data-page="2"]') as HTMLElement;
    const previousButton = document.querySelector('[ref="btPrev"]')?.closest('li') as HTMLElement;
    const nextButton = document.querySelector('[ref="btNext"]')?.closest('li') as HTMLElement;

    document.querySelector('[data-page-link="1"]')?.addEventListener('click', (event) => {
      event.preventDefault();
      pageTwo.classList.remove('active');
      pageOne.classList.add('active');
      previousButton.classList.add('disabled');
      nextButton.classList.remove('disabled');
      rows.innerHTML = `
        <tr>
          <td>111111</td>
          <td><span>첫 페이지 상품</span></td>
          <td><a class="edit-link" href="/edit?originProductNo=111111">수정</a></td>
        </tr>
      `;
    });
    document.querySelector('[data-page-link="2"]')?.addEventListener('click', (event) => {
      event.preventDefault();
      pageOne.classList.remove('active');
      pageTwo.classList.add('active');
      previousButton.classList.remove('disabled');
      nextButton.classList.add('disabled');
      rows.innerHTML = `
        <tr>
          <td>222222</td>
          <td><span>두 번째 페이지 상품</span></td>
          <td><a class="edit-link" href="/edit?originProductNo=222222">수정</a></td>
        </tr>
      `;
    });

    const parser = new ProductSearchPageParser(
      createGateway(),
      createRegistry(),
      new DomExplorer(document),
      document,
      window,
    );

    const result = await parser.collectBundleDeliveryTargets({
      pagination: 'all-pages',
    });

    expect(result.verificationStatus).toBe('verified');
    expect(result.products.map((product) => product.id.toString())).toEqual([
      '111111',
      '222222',
    ]);
    expect(result.note).toContain('pages=2');
    expect(pageOne.classList.contains('active')).toBe(true);
  });

  it('returns verification_required when bundle-delivery filter is not confirmed', async () => {
    document.body.innerHTML = '<table><tbody><tr><td>row</td></tr></tbody></table>';

    const parser = new ProductSearchPageParser(
      createGateway(),
      createRegistry(),
      new DomExplorer(document),
      document,
      window,
    );

    const result = await parser.collectBundleDeliveryTargets();

    expect(result.products).toEqual([]);
    expect(result.note).toContain('Please apply the filter manually');
  });

  it('clicks the Smart Store pagination next button', async () => {
    document.body.innerHTML = `
      <input id="bundle-filter" checked value="묶음배송" />
      <ul class="pagination _pc_pagination" data-nclicks-code="itg.page">
        <li class="_page active" data-page="0"><a href="">1</a></li>
        <li class="_page" data-page="1"><a href="" data-page-link="2">2</a></li>
        <li class="_page ag-paging-button" data-page="1">
          <a ref="btNext" aria-label="다음 페이지로 이동"><i class="seller-icon icon-right"></i></a>
        </li>
      </ul>
      <div class="ag-body-viewport">
        <div class="ag-pinned-left-cols-container">
          <div role="row" class="ag-row" row-id="0" row-index="0">
            <div role="gridcell" col-id="edit"><button data-nclicks-code="itg.edit">수정</button></div>
            <div role="gridcell" col-id="storefarmChannelProductNo"><a data-nclicks-code="itg.numbersf">111111</a></div>
            <div role="gridcell" col-id="productName">상품 1</div>
          </div>
        </div>
      </div>
    `;

    const moveToSecondPage = (event: Event) => {
      event.preventDefault();
      document.querySelector('li[data-page="0"]')?.classList.remove('active');
      document.querySelector('li[data-page="1"]')?.classList.add('active');
      document.querySelector('[col-id="storefarmChannelProductNo"]')!.textContent = '222222';
    };
    document.querySelector('[data-page-link="2"]')?.addEventListener('click', moveToSecondPage);
    document.querySelector('[ref="btNext"]')?.addEventListener('click', moveToSecondPage);

    const parser = new ProductSearchPageParser(
      createGateway(),
      createRegistry(),
      new DomExplorer(document),
      document,
      window,
    );

    const result = await parser.moveToNextResultPage();

    expect(result.ok).toBe(true);
    expect(document.querySelector('li[data-page="1"]')?.classList.contains('active')).toBe(true);
  });
});

function createGateway(): SellerCenterPageGatewayPort {
  return {
    getPageTitle: () => '상품 조회',
    getPageUrl: () => 'https://sell.smartstore.naver.com/#/products/origin-list',
    isSellerCenterSurface: () => true,
    captureHtmlSnapshot: () => document.documentElement.outerHTML,
    getBodyText: () => document.body.textContent ?? '',
  };
}

function createRegistry(): SelectorRegistryPort {
  return {
    list(key) {
      switch (key) {
        case 'search.bundleDeliveryFilter':
          return [cssCandidate(key, '#bundle-filter')];
        case 'search.resultRows':
          return [cssCandidate(key, 'tbody tr')];
        case 'search.editAction':
          return [cssCandidate(key, '.edit-link')];
        default:
          return [];
      }
    },
    keysForPageType() {
      return [];
    },
  };
}

function createRegistryWithoutEditAction(): SelectorRegistryPort {
  return {
    list(key) {
      switch (key) {
        case 'search.bundleDeliveryFilter':
          return [cssCandidate(key, '#bundle-filter')];
        case 'search.resultRows':
          return [cssCandidate(key, 'tbody tr')];
        case 'search.editAction':
          return [];
        default:
          return [];
      }
    },
    keysForPageType() {
      return [];
    },
  };
}

function renderAgGridProductRow(input: {
  rowIndex: number;
  productId: string;
  name: string;
}): string {
  return `
    <div role="row" row-index="${input.rowIndex}" row-id="${input.rowIndex}" class="ag-row ag-row-position-absolute" style="height: 40px; transform: translateY(${input.rowIndex * 40}px);">
      <div role="gridcell" col-id="edit">
        <button class="btn btn-primary btn-xs" data-nclicks-code="itg.edit" data-product-id="${input.productId}">수정</button>
      </div>
      <div role="gridcell" col-id="storefarmChannelProductNo">
        <a href="https://smartstore.naver.com/wishfigure_ss/products/${input.productId}" data-nclicks-code="itg.numbersf">${input.productId}</a>
      </div>
      <div role="gridcell" col-id="productName">${input.name}</div>
    </div>
  `;
}

function cssCandidate(key: string, value: string) {
  return {
    key: key as Parameters<SelectorRegistryPort['list']>[0],
    strategy: 'css' as const,
    value,
    priority: 1,
    fallback: false,
    verificationStatus: 'verified' as const,
    note: 'test selector',
  };
}
