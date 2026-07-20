// 더망고 상품관리 목록은 무한스크롤(스크롤이 끝에 닿으면 새 상품이 append) 방식이라,
// 화면을 끝까지 스크롤해야 다음 상품이 추가로 로드된다. 목표 건수(필터 통과 기준)를
// 채울 때까지 조금씩 스크롤하면서 새 행이 로드되길 기다린다. 비공식 내부 API 호출 없이
// 운영자가 직접 스크롤하는 것과 동일하게 window.scrollTo 만 사용한다.
//
// append 는 네트워크 응답을 기다려야 하므로 매 스크롤마다 고정 시간만 기다리면
// 늦게 도착하는 응답을 놓치고 "더 이상 안 늘어난다"고 오판할 수 있다. 그래서 스크롤 후
// 새 행이 나타날 때까지 짧은 간격으로 폴링하면서 최대 대기 시간까지 기다린다.

const POLL_INTERVAL_MS = 200;
const POLL_TIMEOUT_MS = 4_000;
const DEFAULT_MAX_ATTEMPTS = 40;
const MAX_STALE_ATTEMPTS = 4;

export type ScrollUntilRowCountOptions = {
  /** 도달하고 싶은 (필터 통과) 행 개수. */
  targetRowCount: number;
  /** 현재 화면에 로드된 (필터 통과) 행 개수를 세는 함수. */
  countLoadedRows: () => number;
  maxAttempts?: number;
};

export async function scrollUntilRowCount(
  windowRef: Window,
  documentRef: Document,
  options: ScrollUntilRowCountOptions,
): Promise<number> {
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;

  let previousCount = options.countLoadedRows();
  let staleAttempts = 0;
  let attempts = 0;

  while (
    previousCount < options.targetRowCount &&
    attempts < maxAttempts &&
    staleAttempts < MAX_STALE_ATTEMPTS
  ) {
    scrollToBottom(windowRef, documentRef);

    const currentCount = await waitForRowGrowth(windowRef, previousCount, options.countLoadedRows);
    staleAttempts = currentCount > previousCount ? 0 : staleAttempts + 1;
    previousCount = currentCount;
    attempts += 1;
  }

  return previousCount;
}

function scrollToBottom(windowRef: Window, documentRef: Document): void {
  const scrollHeight = Math.max(
    documentRef.documentElement?.scrollHeight ?? 0,
    documentRef.body?.scrollHeight ?? 0,
  );
  windowRef.scrollTo(0, scrollHeight);

  // 콘텐츠 길이가 뷰포트보다 짧으면 스크롤 위치가 그대로라 브라우저가 자체적으로
  // 'scroll' 이벤트를 쏘지 않는다. 사이트의 무한스크롤 감지가 scroll 이벤트에
  // 의존하는 경우를 대비해, 위치 변화와 무관하게 직접 이벤트를 발생시킨다.
  windowRef.dispatchEvent(new Event("scroll"));
  documentRef.dispatchEvent(new Event("scroll"));
}

async function waitForRowGrowth(
  windowRef: Window,
  previousCount: number,
  countLoadedRows: () => number,
): Promise<number> {
  const startedAt = Date.now();
  let currentCount = countLoadedRows();

  while (currentCount <= previousCount && Date.now() - startedAt < POLL_TIMEOUT_MS) {
    await delay(windowRef, POLL_INTERVAL_MS);
    currentCount = countLoadedRows();
  }

  return currentCount;
}

function delay(windowRef: Window, delayMs: number): Promise<void> {
  return new Promise((resolve) => {
    windowRef.setTimeout(resolve, delayMs);
  });
}
