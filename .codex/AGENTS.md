<!-- /.codex/AGENTS.md -->
# Codex Companion Guide

이 파일은 루트 `AGENTS.md`를 보완하는 Codex 전용 가이드다.

## Codex Working Rules

- 항상 루트 `AGENTS.md`를 먼저 읽는다.
- 이 저장소를 Electron 데스크톱 앱 + Playwright 운영 자동화 도구로 해석한다.
- `packages/core`와 `packages/application`은 순수 TypeScript 계층으로 유지한다.
- `packages/infrastructure-playwright`는 브라우저, 파일, selector, 세션 저장을 담당한다.
- `apps/desktop-electron`은 main/preload/renderer와 IPC만 담당한다.
- `src/*`는 레거시 CLI PoC이므로 사용자 요청이 없으면 신규 구현 진입점으로 쓰지 않는다.

## Safety Focus

- `.auth`, `secrets`, 실제 `.env`는 민감정보로 다룬다.
- 세션/로그인 관련 변경은 반드시 수동 로그인 + `storageState` 정책을 유지한다.
- selector 변경 시 login/session expiry detection까지 함께 확인한다.
- 설치형 배포 변경 시 Electron 빌드와 installer 흐름을 함께 검토한다.

## Suggested Workflow

1. 운영자 시나리오를 한두 문장으로 요약한다.
2. 어느 계층이 책임져야 하는지 확인한다.
3. 가장 작은 가역적 변경을 한다.
4. 변경 범위에 맞는 최소 검증 명령을 실행한다.
5. 세션/selector/installer 리스크가 있으면 마무리에서 분리해서 적는다.
