<!-- /AGENTS.md -->
# Smart Store Desktop Operator — Project Instructions

이 저장소는 네이버 스마트스토어 판매자센터 UI 자동화를 운영자가 직접 사용하는 **Electron 데스크톱 앱**이다. 공개 웹서비스나 백엔드 API 프로젝트처럼 다루지 말고, **운영자 셸 + 순수 코어 + Playwright 어댑터** 구조로 해석하라.

## 0. 기본 작업 원칙

이 저장소에서 작업할 때는 `multica-ai/andrej-karpathy-skills`의 핵심 원칙을 프로젝트 기본 규칙으로 적용한다. 별도 스킬 호출에 의존하지 말고, 아래 태도를 모든 코드 작성, 리뷰, 디버깅, 리팩터링, 배포 작업의 기본값으로 삼아라.

- 먼저 생각하고 구현하라
  애매한 요구, 계층 책임, 로그인/세션/셀렉터 원인이 섞여 있으면 가정하지 말고 분리해서 설명한다. 로컬 코드와 현재 상태로 확인 가능한 것은 먼저 확인하고, 위험한 추측만 질문한다.
- 단순하게 해결하라
  요청된 운영자 문제를 해결하는 최소 변경을 선호한다. 단발성 문제에 새 프레임워크, 새 추상화, 과한 설정면을 만들지 않는다.
- 외과적으로 수정하라
  작업과 직접 관련된 파일만 건드린다. 주변 코드 정리, 포맷 churn, 생성물 변경, 기존 dirty worktree 수정은 요청받지 않았으면 하지 않는다. 내가 만든 미사용 코드만 정리한다.
- 검증 가능한 목표로 움직여라
  “작동하게”가 아니라 어떤 운영 흐름이 성공해야 하는지 정한다. 버그는 가능하면 재현 테스트나 좁은 검증 명령으로 확인하고, 변경 범위가 커질수록 검증도 넓힌다.

이 원칙은 이 문서의 Smart Store 정책보다 우선하지 않는다. 특히 네이버 ID/PW 자동 입력 금지, CAPTCHA/MFA 우회 금지, 비공식 내부 API 직접 호출 금지, 계층 경계 유지 원칙은 항상 더 강한 제약이다.

## 1. 프로젝트 역할을 먼저 설명하라

세부 구현에 들어가기 전에 가능하면 아래 순서로 설명한다.

1. 이 변경이 운영자 워크플로우에서 어떤 역할인지
2. 왜 이 책임이 해당 계층에 있어야 하는지
3. UI -> application -> infrastructure -> Smart Store UI 흐름
4. 그 다음에 실제 파일과 구현 근거

기술 스택만 나열하지 말고, 운영자가 어떤 화면에서 무엇을 하고, 앱이 어떤 계층을 거쳐 자동화를 수행하는지 먼저 설명한다.

## 2. 프로젝트 정체성

- 운영자용 Electron + React 데스크톱 앱
- Smart Store 판매자센터 UI 자동화 도구
- 로그인은 수동 로그인 + `storageState` 저장이 기본
- Playwright는 비공식 API 대체물이 아니라 UI 어댑터
- `packages/*`와 `apps/desktop-electron`이 현재 구조
- `src/*`의 CLI PoC는 레거시 참고 자산

## 3. 핵심 계층 역할

- `packages/core`
  순수 도메인 모델, 값 객체, 정책, 도메인 오류
- `packages/application`
  유스케이스, 포트, 배치 서비스, 설정 스키마
- `packages/infrastructure-playwright`
  Playwright 브라우저 세션, selector profile, 파일 저장소, Smart Store 페이지 어댑터
- `packages/shared`
  공용 계약, IPC payload, 공용 타입
- `apps/desktop-electron`
  Electron main/preload/renderer, IPC, 운영자 GUI
- `src`
  기존 CSV/CLI PoC. 신규 기능의 기본 착수 지점이 아니다

## 4. 핵심 운영 정책

- 네이버 ID/PW 자동 입력 금지
- CAPTCHA / MFA 우회 금지
- 비공식 Smart Store 내부 API 직접 호출 금지
- 사람이 관리자센터 UI에서 할 수 있는 동작만 자동화
- 아이디, 비밀번호, 쿠키, `storageState`를 평문으로 커밋하거나 문서에 복사하지 않음

로그인 관련 변경 시 반드시 지켜야 할 것:

- 수동 로그인 + 세션 저장 방식을 유지
- 세션 파일은 프로젝트 또는 앱 데이터 루트의 `.auth` 계열 경로에서만 관리
- 세션 만료는 명확한 도메인 에러와 복구 가이드로 처리
- 실패 시 스크린샷/HTML/checkpoint를 남기는 현재 운영 흐름을 깨지 않음

## 5. 변경 원칙

- 작은 단위로 수정하고 쉽게 되돌릴 수 있게 작업
- 계층 경계가 우선이다
- 도메인 규칙은 `core`, 실행 흐름은 `application`, 브라우저/파일/DOM은 `infrastructure`, 창/IPC/렌더링은 `apps/desktop-electron`
- renderer는 Playwright나 파일 시스템을 직접 알면 안 된다
- selector 변경은 selector config/profile을 SSOT로 삼는다
- `src/*` 레거시 코드는 필요할 때만 참고하고, 억지 호환보다 신규 구조 유지가 우선이다

## 6. Smart Store 특화 해석 규칙

이 저장소는 쇼핑몰 일반 웹앱이 아니라 **운영 자동화 도구**다. 따라서 다음처럼 해석한다.

- 상품 상태 판정과 전환 규칙은 도메인 정책
- 상품 목록/수정 화면 탐색은 Playwright 페이지 어댑터
- 실행 이력, 체크포인트, 아티팩트는 운영 복구 수단
- Electron 설정, IPC, 설치형 배포는 운영자 사용성의 일부

셀렉터가 깨졌을 때는:

1. selector profile과 페이지 어댑터를 먼저 본다
2. 로그인 만료/권한 문제인지 먼저 분리한다
3. 하드코딩을 늘리기보다 fallback selector나 authenticated indicator를 보강한다

## 7. 검증 기준

변경 범위에 따라 최소한 아래 수준으로 검증한다.

- 문서, 하네스, 가이드만 변경
  링크, 경로, 명령이 현재 저장소와 맞는지 확인
- `packages/core`, `packages/application`
  `npm run typecheck`
- `packages/infrastructure-playwright`
  `npm run typecheck`
  필요 시 로그인 세션/selector 동작에 대한 수동 스모크 가이드 명시
- `apps/desktop-electron`
  `npm run typecheck`
  `npm run desktop:build`
- 설치형 배포, 런타임 자원, Electron builder
  `npm run desktop:dist`

## 8. 답변 스타일

기본 응답은 한국어.

작업을 시작할 때 가능하면 먼저 짧게:

- 목표
- 영향 범위
- 리스크

를 요약한다.

파일을 근거로 설명할 때는:

- 경로
- 그 파일의 책임

을 같이 말한다.

## 9. 이 저장소에서 특히 잘해야 하는 일

- 계층 경계가 무너지지 않도록 구현과 리뷰
- 로그인 세션 문제와 셀렉터 문제를 구분해서 진단
- 운영자 UI 흐름과 Playwright 자동화 흐름을 함께 설명
- checkpoint / artifact / resume 동작을 깨지 않는 변경
- Electron 개발 실행과 설치형 배포 검증
- 새로운 LLM 또는 신규 개발자가 빠르게 따라올 수 있는 온보딩 문서 작성

## 10. 금지/주의

- `src/*` 레거시 CLI를 현재 진입점처럼 설명하지 말 것
- Smart Store 비공식 내부 API를 직접 호출하는 방향으로 유도하지 말 것
- 로그인 정보를 문서 예시나 테스트 픽스처에 넣지 말 것
- 세션 파일, `.auth`, `secrets`, 실제 `.env`를 읽거나 수정할 때는 민감정보 취급을 우선할 것
- UI 변경을 이유로 domain/application에 Playwright 의존성을 끌어오지 말 것
