// 더망고(cafe24 호스팅) 상품관리 화면에서 상품마다 상품번호와 원문상품명을 추출한다.
// DOM 만 읽으며, 비공식 내부 API 는 호출하지 않는다.
//
// 각 상품은 원문상품명 행을 하나씩 가진다:
//   <tr id="before_goods_name_183442" style="display:none">
//     <td class="title">원문상품명</td>
//     <td>あみあみ×蝸之殼Snail Shell 遊戯王カードゲーム ...</td>
//   </tr>
// 상품번호는 id 접미사(before_goods_name_ 뒤)에서, 원문상품명은 두 번째 셀에서 읽는다.
//
// 현재 적용된 상품명(원문이 아니라 마켓통합 상품명)은 같은 상품번호의
//   <span id="span_goods_name_183442">기동전사 건담MG ... <span class="combination"></span></span>
// 에서 읽는다. 이 값에 히라가나/카타카나/한자(간체·번체 포함)가 하나라도 남아있는
// 상품만 추출 대상으로 삼는다 (하나도 없으면 이미 번역이 끝난 상품이라 다시 가져올
// 필요가 없다).
//
// 대표이미지는 원문명/현재명과 달리 상품번호가 id 에 박혀있지 않고, 같은 상품 행의
//   <input type="checkbox" name="uid_check[]" value="183442">
// 와 형제 관계인 <img class="cs_goods_image"> 로만 존재한다. 그래서 체크박스의
// value 로 상품을 찾은 뒤, 그 체크박스를 포함하는 가장 가까운 <tr>(상품 전체 행)
// 안에서 이미지를 찾는다.
//
// AI 번역이 manufacturer(제조사)를 못 찾아 비어서 오는 경우를 대비해, 화면에 이미
// 등록된 브랜드명도 같이 뽑아둔다:
//   <span id="span_brand_name_183442">BANDAI <a onclick="input_brand_name('183442','BANDAI');">
//     <span>브랜드명 변경</span></a> | </span>
// 텍스트를 직접 읽으면 뒤에 붙는 "| " 구분자까지 같이 걸리므로, 대신 onclick 의
// input_brand_name('상품번호','브랜드명') 두 번째 인자를 그대로 값으로 쓴다.

const ORIGIN_NAME_ROW_ID_PREFIX = "before_goods_name_";
const CURRENT_NAME_SPAN_ID_PREFIX = "span_goods_name_";
const BRAND_NAME_SPAN_ID_PREFIX = "span_brand_name_";
const GOODS_CHECKBOX_NAME = "uid_check[]";
const GOODS_IMAGE_SELECTOR = "img.cs_goods_image";
const BRAND_NAME_ONCLICK_PATTERN = /input_brand_name\(\s*'[^']*'\s*,\s*'([^']*)'\s*\)/;

// 미번역 판정 문자 범위:
// - 히라가나, 가타카나, 반각 가타카나, 가나 반복부호
// - 한자(CJK 통합 한자 + 확장A + 호환 한자, 간체/번체/일본 신자체 모두 이 범위에 포함)
//   와 반복부호 々
const UNTRANSLATED_CJK_PATTERN = /[぀-ゟ゠-ヿｦ-ﾝ々㐀-䶿一-鿿豈-﫿]/;

export type MangoOriginProduct = {
  productId: string;
  originName: string;
  currentName: string;
  imageUrl: string;
  /** 화면에 이미 등록된 브랜드명. AI가 manufacturer 를 못 찾았을 때만 대신 쓴다. */
  fallbackManufacturer: string;
};

export type ExtractMangoOriginProductsOptions = {
  /** 필터를 통과한 상품 기준으로 몇 건까지 가져올지. 미지정 시 전체. */
  limit?: number;
  /** true면 가나/한자 미번역 필터를 끄고 이미 번역된 상품도 포함한다('전체 상품 보기'). */
  includeTranslated?: boolean;
};

export function extractMangoOriginProducts(
  documentRef: Document = document,
  options: ExtractMangoOriginProductsOptions = {},
): MangoOriginProduct[] {
  const rows = Array.from(
    documentRef.querySelectorAll<HTMLElement>(`tr[id^="${ORIGIN_NAME_ROW_ID_PREFIX}"]`),
  );

  const seen = new Set<string>();
  const products: MangoOriginProduct[] = [];

  for (const row of rows) {
    if (options.limit !== undefined && products.length >= options.limit) {
      break;
    }

    const productId = row.id.slice(ORIGIN_NAME_ROW_ID_PREFIX.length).trim();
    if (!productId || seen.has(productId)) {
      continue;
    }
    seen.add(productId);

    // 첫 셀은 "원문상품명" 라벨, 원문 값은 마지막 셀에 들어있다.
    const valueCell = row.querySelector("td:last-child");
    const originName = normalizeWhitespace(valueCell?.textContent);
    if (!originName) {
      continue;
    }

    const currentName = readCurrentGoodsName(documentRef, productId);
    if (!currentName) {
      continue;
    }
    if (!options.includeTranslated && !containsUntranslatedCjk(currentName)) {
      continue;
    }

    const imageUrl = readProductImageUrl(documentRef, productId);
    const fallbackManufacturer = readFallbackManufacturer(documentRef, productId);

    products.push({ productId, originName, currentName, imageUrl, fallbackManufacturer });
  }

  return products;
}

export function containsUntranslatedCjk(text: string): boolean {
  return UNTRANSLATED_CJK_PATTERN.test(text);
}

function readFallbackManufacturer(documentRef: Document, productId: string): string {
  const span = documentRef.getElementById(`${BRAND_NAME_SPAN_ID_PREFIX}${productId}`);
  const anchor = span?.querySelector("a[onclick]");
  const onclick = anchor?.getAttribute("onclick") ?? "";
  const match = onclick.match(BRAND_NAME_ONCLICK_PATTERN);
  return match ? normalizeWhitespace(match[1]) : "";
}

function readProductImageUrl(documentRef: Document, productId: string): string {
  const checkboxes = documentRef.querySelectorAll<HTMLInputElement>(
    `input[name="${GOODS_CHECKBOX_NAME}"]`,
  );

  for (const checkbox of Array.from(checkboxes)) {
    if (checkbox.value !== productId) {
      continue;
    }

    const productRow = checkbox.closest("tr");
    const image = productRow?.querySelector<HTMLImageElement>(GOODS_IMAGE_SELECTOR);
    return image?.src ?? "";
  }

  return "";
}

function readCurrentGoodsName(documentRef: Document, productId: string): string {
  const span = documentRef.getElementById(`${CURRENT_NAME_SPAN_ID_PREFIX}${productId}`);
  if (!span) {
    return "";
  }

  // span.combination 은 조합형 상품 표기용 부가 텍스트라 이름 판단에서 제외한다.
  const clone = span.cloneNode(true) as HTMLElement;
  clone.querySelectorAll(".combination").forEach((element) => element.remove());
  return normalizeWhitespace(clone.textContent);
}

function normalizeWhitespace(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}
