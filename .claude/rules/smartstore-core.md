# Smart Store Claude Rule

- 이 저장소는 운영자용 Electron + React 데스크톱 앱과 Chrome 확장 기반 Smart Store UI 자동화 도구로 취급한다.
- 공개 웹서비스, 백엔드 API, 일반 쇼핑몰 프론트엔드처럼 가정하지 않는다.
- 항상 목표, 영향 범위, 주요 리스크를 먼저 요약한다.
- 변경 전 운영자가 어떤 화면에서 무엇을 누르는 흐름인지 먼저 확인한다.
- 네이버 ID/PW 자동 입력, CAPTCHA/MFA 우회, 비공식 Smart Store 내부 API 직접 호출은 금지한다.
- 도메인 규칙은 `packages/core`, 실행 흐름은 `packages/application`, Playwright/selector/session은 infrastructure, Electron IPC/UI는 `apps/desktop-electron`에 둔다.
- selector 변경은 selector profile과 fallback detection을 먼저 보고, 로그인 만료/권한 문제와 DOM 변경을 분리한다.
- `.auth`, `secrets`, 실제 `.env`, storageState, 캡처 HTML/스크린샷은 민감정보로 다룬다.
- 설치형 배포 변경은 `npm run desktop:build` 또는 `npm run desktop:dist` 검증 필요성을 명시한다.
