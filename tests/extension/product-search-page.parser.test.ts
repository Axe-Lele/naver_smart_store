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
        <li class="_page" data-page="1"><a href="">2</a></li>
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

    document.querySelector('[ref="btNext"]')?.addEventListener('click', (event) => {
      event.preventDefault();
      document.querySelector('li[data-page="0"]')?.classList.remove('active');
      document.querySelector('li[data-page="1"]')?.classList.add('active');
      document.querySelector('[col-id="storefarmChannelProductNo"]')!.textContent = '222222';
    });

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
