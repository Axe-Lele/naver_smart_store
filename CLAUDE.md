<!-- /CLAUDE.md -->
# Smart Store Desktop Operator — Claude Guide

이 저장소에서 작업할 때는 먼저 `AGENTS.md`를 읽는다.

핵심 규칙:

- 이 프로젝트는 운영자용 Electron 데스크톱 앱이다
- `packages/core` / `packages/application` / `packages/infrastructure-playwright` / `apps/desktop-electron` 경계를 유지한다
- 로그인은 수동 로그인 + `storageState` 저장만 허용한다
- 네이버 ID/PW 자동 입력, CAPTCHA/MFA 우회, 비공식 내부 API 호출은 금지다
- `src/*` CLI PoC는 레거시 참고 자산이며 신규 기능의 기본 착수 지점이 아니다

추천 흐름:

1. 운영자 화면 기준으로 목표를 설명한다
2. 어느 계층이 책임져야 하는지 결정한다
3. 가장 작은 가역적 변경을 한다
4. 변경 범위에 맞는 최소 검증을 수행한다
5. 세션, selector, Electron 패키징 변경이면 운영 리스크를 따로 적는다
