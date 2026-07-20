// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';

import { applyMangoSelectedDelete } from '../../apps/chrome-extension/src/infrastructure/mango-goods-selected-delete.js';

describe('applyMangoSelectedDelete', () => {
  it('checks only the target product checkboxes and clicks the selected-delete trigger', async () => {
    document.body.innerHTML = `
      <input type="checkbox" name="uid_check[]" value="1">
      <input type="checkbox" name="uid_check[]" value="2" checked>
      <input type="checkbox" name="uid_check[]" value="3">
      <a href="#none" onclick="try{goods_delete('');}catch(e){}" class="selected-delete"><span>선택삭제</span></a>
    `;

    const clickHandler = vi.fn();
    document.querySelector('.selected-delete')!.addEventListener('click', clickHandler);

    const result = applyMangoSelectedDelete(['1', '3'], document);

    expect(result.ok).toBe(true);
    expect(clickHandler).toHaveBeenCalledTimes(1);

    const checkboxes = Array.from(
      document.querySelectorAll<HTMLInputElement>('input[name="uid_check[]"]'),
    );
    expect(checkboxes.map((checkbox) => checkbox.checked)).toEqual([true, false, true]);
  });

  it('fails gracefully when no product checkboxes exist', () => {
    document.body.innerHTML = '<a onclick="goods_delete(\'\')"><span>선택삭제</span></a>';

    const result = applyMangoSelectedDelete(['1'], document);

    expect(result.ok).toBe(false);
    expect(result.note).toContain('체크박스');
  });

  it('fails gracefully when the selected-delete trigger is missing', () => {
    document.body.innerHTML = '<input type="checkbox" name="uid_check[]" value="1">';

    const result = applyMangoSelectedDelete(['1'], document);

    expect(result.ok).toBe(false);
    expect(result.note).toContain('선택삭제');
  });
});
