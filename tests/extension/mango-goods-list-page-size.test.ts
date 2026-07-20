// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';

import {
  applyGoodsListPageSize,
  findGoodsListPageSizeSelect,
  readGoodsListPageSizeOptions,
} from '../../apps/chrome-extension/src/infrastructure/mango-goods-list-page-size.js';

describe('mango goods list page size helpers', () => {
  it('finds a select whose options look like page-size counts near a matching label', () => {
    document.body.innerHTML = `
      <form>
        <span>표시건수</span>
        <select name="list_cnt">
          <option value="10">10개씩</option>
          <option value="30">30개씩</option>
          <option value="50">50개씩</option>
        </select>
        <button type="button">조회</button>
      </form>
    `;

    const select = findGoodsListPageSizeSelect(document);

    expect(select).not.toBeNull();
    expect(readGoodsListPageSizeOptions(select!)).toEqual([
      { value: '10', label: '10개씩' },
      { value: '30', label: '30개씩' },
      { value: '50', label: '50개씩' },
    ]);
  });

  it('ignores selects that do not look like page-size controls', () => {
    document.body.innerHTML = `
      <select name="site_id">
        <option value="amazon_jp">아마존재팬</option>
        <option value="amazon_us">아마존미국</option>
      </select>
    `;

    expect(findGoodsListPageSizeSelect(document)).toBeNull();
  });

  it('changes the select value and clicks a nearby 조회 button', () => {
    document.body.innerHTML = `
      <form>
        <span>표시건수</span>
        <select name="list_cnt">
          <option value="10" selected>10개씩</option>
          <option value="30">30개씩</option>
        </select>
        <button type="button" id="search-btn">조회</button>
      </form>
    `;

    const select = document.querySelector('select') as HTMLSelectElement;
    const clickHandler = vi.fn();
    document.getElementById('search-btn')!.addEventListener('click', clickHandler);

    const result = applyGoodsListPageSize(select, '30', document);

    expect(select.value).toBe('30');
    expect(clickHandler).toHaveBeenCalledTimes(1);
    expect(result.applied).toBe(true);
  });

  it('reports no-op when the requested value is already selected', () => {
    document.body.innerHTML = `
      <select name="list_cnt">
        <option value="10" selected>10개씩</option>
        <option value="30">30개씩</option>
      </select>
    `;

    const select = document.querySelector('select') as HTMLSelectElement;
    const result = applyGoodsListPageSize(select, '10', document);

    expect(result.applied).toBe(false);
  });
});
