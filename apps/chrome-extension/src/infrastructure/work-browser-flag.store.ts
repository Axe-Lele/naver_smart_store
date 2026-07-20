// 이 브라우저 프로필이 데스크톱 앱이 띄운 '작업용 브라우저'인지 여부.
//
// 데스크톱이 여는 판매자센터 URL에는 wfWorkBrowser=1 마커가 붙는다. 이를 본
// 콘텐츠 스크립트가 프로필 저장소(chrome.storage.local — 프로필별로 분리됨)에
// 영구 기록한다. 운영자 개인 크롬에는 마커가 갈 일이 없으므로 이 플래그도
// 저장되지 않고, 하이브리드 브리지 클라이언트는 플래그가 있는 프로필에서만
// 폴링한다. 개인 크롬의 판매자센터 탭이 데스크톱 명령을 받아 상품을 긁어오는
// 사고를 막는 짝짓기 장치다.
const WORK_BROWSER_FLAG_KEY = "wishfigure.work-browser";

export async function markWorkBrowserProfile(): Promise<void> {
  await new Promise<void>((resolve) => {
    chrome.storage.local.set(
      { [WORK_BROWSER_FLAG_KEY]: new Date().toISOString() },
      () => resolve(),
    );
  });
}

export async function isWorkBrowserProfile(): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    chrome.storage.local.get([WORK_BROWSER_FLAG_KEY], (items) => {
      resolve(Boolean(items[WORK_BROWSER_FLAG_KEY]));
    });
  });
}
