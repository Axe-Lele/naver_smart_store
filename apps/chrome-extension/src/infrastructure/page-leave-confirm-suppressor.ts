// 저장하지 않은 수정 페이지에서 상품목록으로 강제 이동하기 직전에 호출한다.
//
// 판매자센터 SPA 는 라우트를 떠날 때 window.confirm("...저장하지 않고 이 페이지에서
// 나가면, 상세설명 내용이 유실됩니다")을 띄우는데, 네이티브 confirm 은 그 탭의 JS
// 전체 — 배치 진행, 브리지 하트비트, 중지 명령 처리까지 — 를 멈춰버린다.
// background 가 MAIN world 에 잠깐 자동 승인 confirm 을 주입해 이를 막는다.
//
// 실패한 상품을 건너뛰는 복구 이동에서만 쓰는 것이 전제다. 저장 후 정상 이동에는
// 다이얼로그가 뜨지 않으므로 호출해도 해가 없다.
export async function suppressPageLeaveConfirmQuietly(): Promise<void> {
  try {
    await chrome.runtime.sendMessage({ type: "content/suppress-page-leave-confirm" });
  } catch {
    // 억제에 실패해도 이동은 그대로 진행한다. 최악의 경우 기존처럼 confirm 이 떠서
    // 운영자가 직접 눌러야 하는 상태로 돌아갈 뿐이다.
  }
}
