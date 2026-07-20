// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';

import { applyMangoOriginProductName } from '../../apps/chrome-extension/src/infrastructure/mango-goods-name-apply.js';

// 실제 더망고 페이지는 전역 chg1/chg2 함수를 정의해서 onclick 에서 호출한다.
// jsdom 은 인라인 onclick 속성을 페이지와 다른 realm 에서 평가해 전역 스텁을 보지 못하므로,
// 테스트에서는 try/catch 로 감싸 실제 페이지와 동일한 onclick 문자열 패턴만 유지하고
// (우리 코드는 이 문자열을 정규식으로 찾아 매칭한다) 참조 에러가 새어나가지 않게 한다.
function buildProductBlock(productId: string): void {
  document.body.innerHTML = `
    <a onclick="try{chg1('${productId}');}catch(e){}" class="edit-open"><span>상품명수정</span></a>
    <div class="toolbar" style="display:none">
      <a onclick="try{chg2('${productId}','change', '@');}catch(e){}" class="save-name"><span>상품명 변경하기</span></a>
    </div>
    <div id="div_chg_gname_${productId}" style="display:none">
      <input type="text" id="chg_goods_name_${productId}" value="원래 이름">
    </div>
  `;
}

describe('applyMangoOriginProductName', () => {
  it('opens the edit box, fills the new name, and clicks the save trigger', async () => {
    const productId = '183442';
    buildProductBlock(productId);

    const editOpen = document.querySelector<HTMLElement>('.edit-open')!;
    const editBox = document.getElementById(`div_chg_gname_${productId}`) as HTMLElement;
    const toolbar = document.querySelector<HTMLElement>('.toolbar')!;
    editOpen.addEventListener('click', () => {
      editBox.style.display = 'block';
      toolbar.style.display = 'block';
    });

    const saveHandler = vi.fn();
    document.querySelector('.save-name')!.addEventListener('click', saveHandler);

    const result = await applyMangoOriginProductName(productId, '새 상품명', document, window);

    expect(result.ok).toBe(true);
    expect(saveHandler).toHaveBeenCalledTimes(1);
    const input = document.getElementById(`chg_goods_name_${productId}`) as HTMLInputElement;
    expect(input.value).toBe('새 상품명');
  });

  it('fails gracefully when the edit-open trigger is missing', async () => {
    document.body.innerHTML = '<div>no triggers here</div>';

    const result = await applyMangoOriginProductName('999999', '이름', document, window);

    expect(result.ok).toBe(false);
    expect(result.note).toContain('상품명수정');
  });

  it('fails gracefully when the name input never becomes visible', async () => {
    vi.useFakeTimers();
    try {
      const productId = '555555';
      // 상품명수정 클릭에 아무 반응이 없어 입력창 자체가 display:none 인 채로 남는 상황을 재현한다.
      document.body.innerHTML = `
        <a onclick="try{chg1('${productId}');}catch(e){}" class="edit-open"><span>상품명수정</span></a>
        <div id="div_chg_gname_${productId}">
          <input type="text" id="chg_goods_name_${productId}" style="display:none" value="원래 이름">
        </div>
      `;

      const resultPromise = applyMangoOriginProductName(productId, '이름', document, window);
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result.ok).toBe(false);
      expect(result.note).toContain('입력창');
    } finally {
      vi.useRealTimers();
    }
  });
});
