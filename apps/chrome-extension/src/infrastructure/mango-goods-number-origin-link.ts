// 더망고 상품관리 목록에서 상품번호 → 원문사이트(아마존 등 원본 페이지) URL 맵을
// 수집한다. DOM을 읽기만 하며, 더망고 페이지는 일절 수정하지 않는다.
// (과거에는 목록의 상품번호 텍스트를 <a>로 감싸 링크를 걸었지만, 더망고 페이지
// HTML을 파싱하는 쪽 — 마켓전송 등 — 을 깨뜨릴 수 있어 제거했다. 원문사이트 링크는
// 우리 원문상품명 추출 패널 테이블 안에서만 건다.)
//
// "원문사이트" 링크와 "[ 상품번호 : ID ]" 텍스트는 서로 다른 <td>에 있어서 직접
// 연결할 수 없다. 대신 "원문사이트"가 들어있는 <td> 안에는 상품id를 인자로 받는
// onclick="open_detail('183804')" 같은 버튼이 같이 있으므로, 그 id로 두 영역을 잇는다.

const ORIGIN_SITE_LINK_TEXT = "원문사이트";
const ONCLICK_PRODUCT_ID_PATTERN = /\(\s*'(\d+)'/;

export function collectMangoGoodsOriginUrls(documentRef: Document = document): Map<string, string> {
  const anchors = Array.from(documentRef.querySelectorAll<HTMLAnchorElement>("a[href]"));
  const originAnchors = anchors.filter(
    (anchor) => normalizeWhitespace(anchor.textContent) === ORIGIN_SITE_LINK_TEXT,
  );

  const urlsByProductId = new Map<string, string>();
  for (const anchor of originAnchors) {
    const cell = anchor.closest("td");
    const productId = cell ? findProductIdInCell(cell) : null;
    if (productId && !urlsByProductId.has(productId)) {
      urlsByProductId.set(productId, anchor.href);
    }
  }

  return urlsByProductId;
}

function findProductIdInCell(cell: Element): string | null {
  const elementsWithOnclick = Array.from(cell.querySelectorAll<HTMLElement>("[onclick]"));
  for (const element of elementsWithOnclick) {
    const match = ONCLICK_PRODUCT_ID_PATTERN.exec(element.getAttribute("onclick") ?? "");
    if (match) {
      return match[1];
    }
  }

  return null;
}

function normalizeWhitespace(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}
