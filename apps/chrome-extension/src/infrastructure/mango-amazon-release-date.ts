// 더망고 상품의 "원문사이트"(주로 아마존 재팬 상품 페이지)에서 발매(예정)일을 읽는다.
//
// - background(service worker)에서 fetch 로 공개 상품 페이지 HTML을 받아 텍스트로
//   변환한 뒤, 発売予定日 / 発売日 키워드 근처의 날짜를 찾는다.
//   (MV3 service worker 에는 DOMParser 가 없어 정규식 기반으로 파싱한다.)
// - 아마존 재팬(amazon.co.jp) URL 만 조회하고 그 외 사이트는 조용히 null 처리한다.
// - 봇 차단 페이지가 오거나 날짜를 못 찾으면 그냥 null 을 돌려준다. 재시도나
//   차단 우회는 하지 않는다.
//
// 아마존 상품 페이지에서 발매일이 나오는 대표 위치:
//   예약 배너   : この商品の発売予定日は2026年8月10日です。
//   등록정보 표 : 発売日 : 2026/8/10  또는  発売日‏ : ‎2026年8月10日
//   스펙 표     : 発売予定日 2026年8月
// 계정 언어가 영어면 같은 페이지가 영어로 나온다:
//   예약 배너   : This item will be released on January 31, 2027.
//   등록정보 표 : Release date : January 31, 2027
// "delivery February 16 - 22, 2027" 같은 배송 예정일과 섞이지 않도록, 날짜는 반드시
// 발매 키워드 바로 뒤 일정 범위 안에서만 찾는다.

export type OriginReleaseDateItem = {
  id: string;
  url: string;
};

export type OriginReleaseDateResult = {
  id: string;
  /** YYYY-MM-DD(일자 없으면 YYYY-MM). 못 찾았으면 null. */
  releaseDate: string | null;
};

const AMAZON_JP_HOST_PATTERN = /(^|\.)amazon\.co\.jp$/i;
const FETCH_TIMEOUT_MS = 12_000;
// 아마존에 과도한 동시 요청을 보내지 않도록 배치 안에서도 소수만 병렬로 돈다.
const MAX_CONCURRENCY = 3;

// 발매 '예정'(예약 배너)이 등록정보의 과거 발매일보다 우선. 키워드 뒤 일정 범위
// 안에서 첫 날짜를 찾는다. 영어 키워드는 소문자로 비교한다.
const RELEASE_DATE_KEYWORDS = ["発売予定日", "released on", "発売日", "release date"] as const;
const KEYWORD_SEARCH_WINDOW = 80;
// 숫자 표기: "2026年8月10日" / "2026/8/10" / "2026-8-10" / 일자 생략형("2026年12月")
const NUMERIC_DATE_PATTERN = /(\d{4})\s*[年/.-]\s*(\d{1,2})(?:\s*[月/.-]\s*(\d{1,2})\s*日?)?/;
// 영어 표기: "January 31, 2027" / "Jan. 31, 2027" / 일자 생략형("January 2027")
const ENGLISH_DATE_PATTERN =
  /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+(?:(\d{1,2})(?:st|nd|rd|th)?\s*,?\s+)?(\d{4})\b/i;
const ENGLISH_MONTH_NUMBERS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

export async function fetchOriginReleaseDates(
  items: OriginReleaseDateItem[],
): Promise<OriginReleaseDateResult[]> {
  const results: OriginReleaseDateResult[] = [];
  let cursor = 0;

  async function worker(): Promise<void> {
    while (cursor < items.length) {
      const item = items[cursor];
      cursor += 1;
      results.push({ id: item.id, releaseDate: await fetchSingleReleaseDate(item.url) });
    }
  }

  const workerCount = Math.min(MAX_CONCURRENCY, items.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

async function fetchSingleReleaseDate(url: string): Promise<string | null> {
  if (!isAmazonJapanUrl(url)) {
    return null;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    // credentials: "include" — 운영자 브라우저가 평소 아마존을 보던 세션 그대로
    // 요청한다(별도 로그인/우회 없음). 쿠키가 없어도 공개 상품 페이지는 열린다.
    const response = await fetch(url, { credentials: "include", signal: controller.signal });
    if (!response.ok) {
      return null;
    }
    return parseAmazonReleaseDate(await response.text());
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export function isAmazonJapanUrl(url: string): boolean {
  try {
    return AMAZON_JP_HOST_PATTERN.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

export function parseAmazonReleaseDate(html: string): string | null {
  const text = htmlToText(html);
  // 영어 키워드를 대소문자 무시로 찾기 위한 소문자 사본. toLowerCase 는 이 텍스트
  // 범위에서 길이를 바꾸지 않으므로 원본과 인덱스가 일치한다.
  const lowerText = text.toLowerCase();

  for (const keyword of RELEASE_DATE_KEYWORDS) {
    const lowerKeyword = keyword.toLowerCase();
    let index = lowerText.indexOf(lowerKeyword);
    while (index !== -1) {
      const searchStart = index + keyword.length;
      const window = text.slice(searchStart, searchStart + KEYWORD_SEARCH_WINDOW);
      const date = findDateInWindow(window);
      if (date) {
        return date;
      }
      index = lowerText.indexOf(lowerKeyword, searchStart);
    }
  }

  return null;
}

// 숫자 표기와 영어 표기 둘 다 시도하고, 키워드에 더 가까운(먼저 나오는) 쪽을 쓴다.
function findDateInWindow(window: string): string | null {
  const numericMatch = NUMERIC_DATE_PATTERN.exec(window);
  const englishMatch = ENGLISH_DATE_PATTERN.exec(window);

  if (numericMatch && (!englishMatch || numericMatch.index <= englishMatch.index)) {
    return formatDate(numericMatch[1], numericMatch[2], numericMatch[3]);
  }
  if (englishMatch) {
    const month = ENGLISH_MONTH_NUMBERS[englishMatch[1].slice(0, 3).toLowerCase()];
    return formatDate(englishMatch[3], String(month), englishMatch[2]);
  }
  return null;
}

function formatDate(year: string, month: string, day: string | undefined): string {
  const paddedMonth = month.padStart(2, "0");
  if (day === undefined) {
    return `${year}-${paddedMonth}`;
  }
  return `${year}-${paddedMonth}-${day.padStart(2, "0")}`;
}

function htmlToText(html: string): string {
  return (
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]*>/g, " ")
      .replace(/&nbsp;|&#160;/gi, " ")
      // 아마존 등록정보 표는 라벨/값 사이에 RTL·LRM 등 보이지 않는 제어문자를 끼워넣는다.
      .replace(/[‎‏‪-‮]/g, "")
      .replace(/\s+/g, " ")
  );
}
