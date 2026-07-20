// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';

import { applyUnmodifiedNameOnlyFilter } from '../../apps/chrome-extension/src/infrastructure/mango-goods-list-name-filter.js';

function buildFilterSelect(selectedValue = ''): void {
  document.body.innerHTML = `
    <form>
      <select id="search_type_filter">
        <option value="">-- 전체상품보기 --</option>
        <option value="sold_history">판매이력 있는 상품만 보기</option>
        <option value="no_sold_history">판매이력 없는 상품만 보기</option>
        <option value="name_changed">상품명 수정 상품만 보기</option>
        <option value="name_unchanged">상품명 미수정 상품만 보기</option>
        <option value="option_changed">옵션명 수정 상품만 보기</option>
      </select>
      <button type="button" id="search-btn">조회</button>
    </form>
  `;

  if (selectedValue) {
    (document.getElementById('search_type_filter') as HTMLSelectElement).value = selectedValue;
  }
}

describe('applyUnmodifiedNameOnlyFilter', () => {
  it('selects the 상품명 미수정 상품만 보기 option and clicks 조회', () => {
    buildFilterSelect();
    const select = document.getElementById('search_type_filter') as HTMLSelectElement;
    const clickHandler = vi.fn();
    document.getElementById('search-btn')!.addEventListener('click', clickHandler);

    const result = applyUnmodifiedNameOnlyFilter(document);

    expect(select.value).toBe('name_unchanged');
    expect(clickHandler).toHaveBeenCalledTimes(1);
    expect(result.applied).toBe(true);
  });

  it('does nothing when the filter is already selected', () => {
    buildFilterSelect('name_unchanged');
    const clickHandler = vi.fn();
    document.getElementById('search-btn')!.addEventListener('click', clickHandler);

    const result = applyUnmodifiedNameOnlyFilter(document);

    expect(clickHandler).not.toHaveBeenCalled();
    expect(result.applied).toBe(false);
    expect(result.note).toContain('이미');
  });

  it('reports not found when the page has no matching select', () => {
    document.body.innerHTML = '<select><option value="a">다른 옵션</option></select>';

    const result = applyUnmodifiedNameOnlyFilter(document);

    expect(result.applied).toBe(false);
    expect(result.note).toContain('찾지 못했습니다');
  });
});
