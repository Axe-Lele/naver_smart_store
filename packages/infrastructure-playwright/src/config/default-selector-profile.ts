// File: packages/infrastructure-playwright/src/config/default-selector-profile.ts
import type { SelectorProfileConfig } from './selector-profile.js';

export const defaultSmartStoreSelectorProfile: SelectorProfileConfig = {
  id: 'smartstore-default',
  auth: {
    loginIndicators: [
      'input[name="id"]',
      'input#id',
      'input[name="pw"]',
      'text=/NAVER 로그인|로그인/',
    ],
    challengeIndicators: [
      'text=/CAPTCHA|캡차|2단계 인증|본인 확인|추가 인증/',
    ],
    accessDeniedIndicators: [
      'text=/접근 권한이 없습니다|접근이 제한|권한이 없습니다|이용 권한이 없습니다|서비스 이용이 제한/',
      'text=/Access Denied|Permission Denied|Forbidden/',
    ],
    accessDeniedUrlPatterns: ['forbidden', 'denied', 'unauthorized', 'noauth', 'notauthorized'],
  },
  common: {
    loadingIndicators: [
      '[role="progressbar"]',
      '.loading',
      '.spinner',
      '[class*="loading"]',
    ],
    toastIndicators: [
      '[role="alert"]',
      '.Toastify__toast',
      '[class*="toast"]',
      '[class*="snackbar"]',
    ],
    bannerIndicators: [
      '[class*="notice"]',
      '[class*="banner"]',
      '[class*="alert"]',
      '[class*="message"]',
    ],
  },
  productList: {
    pageIdentity: [
      'text=/상품 조회|상품 목록|판매상품 관리|상품 관리/',
      'h1:has-text("상품")',
      'h2:has-text("상품")',
    ],
    searchInput: [
      'input[name="productNo"]',
      'input[placeholder*="상품번호"]',
      'input[aria-label*="상품번호"]',
      'input[type="search"]',
    ],
    searchButton: [
      'button:has-text("검색")',
      'button[type="submit"]',
      '[role="button"]:has-text("검색")',
    ],
    noResultIndicators: [
      'text=/검색 결과가 없습니다|조회된 상품이 없습니다|상품을 찾을 수 없습니다/',
    ],
    resultRows: ['table tbody tr', '[role="row"]', 'li', '[class*="product"]'],
    editButtons: [
      'a:has-text("수정")',
      'button:has-text("수정")',
      '[role="button"]:has-text("수정")',
    ],
    productLinks: ['a', 'button'],
  },
  productEdit: {
    pageIdentity: [
      'text=/상품 수정|상품정보 수정|판매 정보 수정|상품정보/',
      'h1:has-text("수정")',
      'h2:has-text("수정")',
    ],
    saveButtons: [
      'button:has-text("저장")',
      'button:has-text("수정완료")',
      '[role="button"]:has-text("저장")',
    ],
    preorderSectionContainers: ['fieldset', 'section', 'tr', 'li', 'div', 'dl'],
    preorderSectionHints: ['예약구매', '예약 구매', '예약판매', '예약 판매', '판매 유형'],
    interactiveSelectors: [
      'label',
      'button',
      '[role="radio"]',
      '[role="option"]',
      'input[type="radio"]',
      'input[type="checkbox"]',
    ],
    normalOptionHints: ['일반상품', '일반 상품'],
    preorderOptionHints: ['예약구매', '예약 구매', '예약판매', '예약 판매'],
    successIndicators: [
      'text=/저장되었습니다|수정되었습니다|상품 정보가 저장|상품 수정이 완료/',
    ],
    lockIndicators: [
      'text=/주문.*시작.*변경.*불가|주문.*시작.*수정.*불가|주문 기간.*변경.*불가|예약구매.*변경.*불가|정책상.*변경.*불가/',
    ],
  },
};
