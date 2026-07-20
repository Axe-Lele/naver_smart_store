// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

import { extractMangoOriginProducts } from '../../apps/chrome-extension/src/infrastructure/mango-origin-product.parser.js';

describe('extractMangoOriginProducts', () => {
  it('reads product id and origin name from each origin-name row', () => {
    document.body.innerHTML = `
      <table>
        <tr id="before_goods_name_183442" style="display:none">
          <td class="title">원문상품명</td>
          <td>あみあみ×蝸之殼Snail Shell 遊戯王カードゲーム モンスターフィギュア</td>
        </tr>
        <tr id="before_goods_name_200001" style="display:none">
          <td class="title">원문상품명</td>
          <td>  두 번째   상품   원문명  </td>
        </tr>
      </table>
    `;

    const products = extractMangoOriginProducts(document);

    expect(products).toEqual([
      {
        productId: '183442',
        originName:
          'あみあみ×蝸之殼Snail Shell 遊戯王カードゲーム モンスターフィギュア',
      },
      { productId: '200001', originName: '두 번째 상품 원문명' },
    ]);
  });

  it('skips rows without an origin name and dedupes by product id', () => {
    document.body.innerHTML = `
      <table><tbody>
        <tr id="before_goods_name_1"><td class="title">원문상품명</td><td>  </td></tr>
        <tr id="before_goods_name_2"><td class="title">원문상품명</td><td>상품 A</td></tr>
        <tr id="before_goods_name_2"><td class="title">원문상품명</td><td>중복 행</td></tr>
      </tbody></table>
    `;

    expect(extractMangoOriginProducts(document)).toEqual([
      { productId: '2', originName: '상품 A' },
    ]);
  });

  it('returns an empty list when the page has no origin-name rows', () => {
    document.body.innerHTML = '<div>상품 없음</div>';
    expect(extractMangoOriginProducts(document)).toEqual([]);
  });

  it('reads the product image from the same product row as the checkbox', () => {
    document.body.innerHTML = `
      <table><tbody>
        <tr>
          <td><input type="checkbox" name="uid_check[]" value="184754"></td>
          <td>
            <table><tbody><tr>
              <td><img class="cs_goods_image" src="https://example.com/184754.jpg"></td>
              <td>
                <span id="span_goods_name_184754">サンプル 상품명</span>
                <table>
                  <tr id="before_goods_name_184754">
                    <td class="title">원문상품명</td>
                    <td>Origin Name 184754</td>
                  </tr>
                </table>
              </td>
            </tr></tbody></table>
          </td>
        </tr>
      </tbody></table>
    `;

    expect(extractMangoOriginProducts(document)).toEqual([
      {
        productId: '184754',
        originName: 'Origin Name 184754',
        currentName: 'サンプル 상품명',
        imageUrl: 'https://example.com/184754.jpg',
        fallbackManufacturer: '',
      },
    ]);
  });

  it('returns an empty image url when the product row has no image', () => {
    document.body.innerHTML = `
      <table><tbody>
        <tr>
          <td><input type="checkbox" name="uid_check[]" value="999"></td>
          <td>
            <span id="span_goods_name_999">サンプル</span>
            <table><tbody>
              <tr id="before_goods_name_999">
                <td class="title">원문상품명</td>
                <td>Origin Name 999</td>
              </tr>
            </tbody></table>
          </td>
        </tr>
      </tbody></table>
    `;

    expect(extractMangoOriginProducts(document)).toEqual([
      {
        productId: '999',
        originName: 'Origin Name 999',
        currentName: 'サンプル',
        imageUrl: '',
        fallbackManufacturer: '',
      },
    ]);
  });

  it('reads the fallback manufacturer from the brand-name span onclick handler', () => {
    document.body.innerHTML = `
      <table><tbody>
        <tr id="before_goods_name_184695">
          <td class="title">원문상품명</td>
          <td>Origin Name 184695</td>
        </tr>
      </tbody></table>
      <span id="span_goods_name_184695">サンプル</span>
      <span id="span_brand_name_184695">BANDAI
        <a onclick="input_brand_name('184695','BANDAI');" class="defbtn_sm dtype6" target="_blank">
          <span>브랜드명 변경</span>
        </a>
        |
      </span>
    `;

    expect(extractMangoOriginProducts(document)).toEqual([
      {
        productId: '184695',
        originName: 'Origin Name 184695',
        currentName: 'サンプル',
        imageUrl: '',
        fallbackManufacturer: 'BANDAI',
      },
    ]);
  });
});
