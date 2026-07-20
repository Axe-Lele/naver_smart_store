// cafe24(더망고) 관리자 화면용 콘텐츠 스크립트.
// 상품 관리 화면(admin_goods.php)에서만 원문상품명 추출 패널을 주입한다
// (기본 닫힘, 확장 팝업에서 열기). 그 외 관리자 화면(마켓전송 팝업, 주문관리 등)에서는
// 아무것도 하지 않으며, 더망고 페이지 DOM 자체는 일절 수정하지 않는다.
// 과거에 있다가 제거된 것들:
//   (1) 로그인 직후 상품관리로 자동 이동시키는 리다이렉트(파일명의 redirect는 그 흔적)
//       — 마켓전송 등 다른 기능이 여는 관리자 팝업 창까지 납치할 수 있어 제거
//   (2) '상품명 미수정 상품만 보기' 필터 자동 적용
//       — 패널 툴바의 '미번역 상품 보기' 버튼(ps_fn=nomodifygoods 검색)으로 대체
//   (3) 목록의 상품번호 텍스트를 원문사이트 <a>로 감싸는 기능
//       — 더망고 페이지 HTML을 파싱하는 쪽(마켓전송 등)을 깨뜨릴 수 있어 제거,
//         원문사이트 링크는 우리 패널 테이블 안에서만 건다
import {
  mountMangoOriginProductPanel,
  openMangoOriginProductPanel,
} from './mango-origin-product-panel.js';

function isGoodsPage(pathname: string): boolean {
  return pathname.toLowerCase().includes('admin_goods.php');
}

// 상품 관리 화면에서만 기능을 붙인다. 다른 관리자 화면은 건드리지 않는다.
function setupGoodsPageFeatures(): void {
  if (!isGoodsPage(window.location.pathname)) {
    return;
  }

  mountMangoOriginProductPanel(document);
}

// 확장 팝업의 '번역창 열기' 버튼 → 이 탭으로 전달되는 명령을 처리한다.
// 패널은 상품관리 화면 기준으로 동작하므로 그 외 관리자 화면에서는 열지 않는다.
chrome.runtime.onMessage.addListener(
  (message: { type?: string }, _sender, sendResponse: (response: unknown) => void) => {
    if (message?.type !== 'mango/open-origin-panel') {
      return;
    }

    if (!isGoodsPage(window.location.pathname)) {
      sendResponse({
        ok: false,
        message: '상품관리(admin_goods.php) 화면에서만 번역창을 열 수 있습니다.',
      });
      return;
    }

    openMangoOriginProductPanel(document);
    sendResponse({ ok: true, message: '번역창을 열었습니다.' });
  },
);

setupGoodsPageFeatures();
