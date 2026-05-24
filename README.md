# Wishfigure Seller Desk

네이버 스마트스토어 판매자센터 UI에서 묶음배송 검색 결과 상품만 대상으로 예약구매 설정을 점검/변경하는 운영 도구입니다. 현재 운영자용 기본 구조는 `Electron 대시보드 + Chrome Extension 실행기` 하이브리드입니다.

중요 정책:

- 로그인 ID/PW 자동 입력 금지
- CAPTCHA/MFA 우회 금지
- 비공식 내부 API 직접 호출 금지
- 관리자센터 UI에서 운영자가 직접 할 수 있는 동작만 자동화
- 로그인 정보 수집 금지, 이미 로그인된 Chrome 판매자센터 탭 안에서만 실제 수정 수행

기존 CLI PoC와 Playwright 단독 흐름도 프로젝트 안에 남아 있지만, 현재 운영자용 기본 진입점은 아래 조합입니다.

- Electron 앱: 상태 확인, 명령 전송, 진행률/결과 확인
- Chrome Extension: 로그인된 판매자센터 탭 안에서 실제 DOM 점검과 배치 실행

## 현재 구현 범위

- Electron main / preload / renderer 분리
- React + TypeScript 기반 운영 대시보드
- Chrome Extension MV3 기반 판매자센터 UI 실행기
- Electron ↔ Chrome 탭 localhost 브리지
- `DOM inspection`
- `dry-run`
- 배치 시작 / 중단 / 재개
- 실시간 진행률 표시
- 설정 화면
- 설치형 앱 안에 Chrome 확장 빌드 동봉

## 폴더 개요

- `apps/desktop-electron`
  Electron 셸, preload, React renderer, Chrome 확장 브리지 제어
- `apps/chrome-extension`
  Chrome Extension MV3, content script, DOM parser/driver, 배치 실행기
- `packages/core`
  도메인 모델 / 정책
- `packages/application`
  유스케이스 / 포트 / 배치 서비스
- `packages/infrastructure-playwright`
  Playwright 자동화, selector profile, storageState, artifact/checkpoint/result 저장
- `packages/shared`
  Electron IPC contract와 공용 타입
- `src`
  기존 CLI PoC 코드

## AI 하네스 구성

이 저장소에는 `gemss-his` 스타일을 참고한 프로젝트 로컬 하네스를 추가했습니다. 범용 하네스를 통째로 들이기보다, 현재 `smart-store` 구조에 바로 도움이 되는 최소 구성만 넣었습니다.

- `AGENTS.md`
  저장소 해석 규칙, 계층 책임, 검증 기준
- `CLAUDE.md`
  Claude 계열 도구용 보조 가이드
- `agent.yaml`
  프로젝트 하네스 메타 정보
- `.codex/`
  Codex 설정, 로컬 에이전트, 안전 훅
- `.agents/skills/`
  프로젝트 특화 workflow skill
- `.claude/commands/`, `.claude/skills/`
  Claude Code 호환 command / skill surface

하네스가 도와주는 범위:

- destructive shell 명령 차단
- `.auth`, `secrets`, 실제 `.env` 읽기/수정 경고
- selector/session/config 변경 경고
- 종료 시 변경 파일 기준 검증 힌트
- Smart Store 로그인 세션, selector 튜닝, Electron 릴리즈 검증용 workflow guide

주요 파일:

- `C:\smart-store\AGENTS.md`
- `C:\smart-store\.codex\config.toml`
- `C:\smart-store\.codex\hooks.json`
- `C:\smart-store\.agents\skills`
- `C:\smart-store\.claude\commands`
- `C:\smart-store\.claude\skills`

## 요구 환경

- Node.js 20+
- Windows
- Chrome 또는 Playwright Chromium 실행 가능 환경
- 스마트스토어 판매자센터 접근 권한이 있는 네이버 계정

## 빠른 시작

처음 실행하는 운영자 기준으로 아래 순서대로 진행하면 됩니다.

### 운영자용 설치 파일 만들기

개발 PC에서 설치 파일까지 한 번에 만들려면:

```cmd
cd /d C:\smart-store
npm install
npx playwright install
npm run desktop:dist
```

설치 파일과 Chrome 확장 폴더를 한 번에 묶으려면 루트의 통합 배치 파일을 실행해도 됩니다.

```cmd
cd /d C:\smart-store
build-installer-and-extension.bat
```

생성 결과:

- `C:\smart-store\release\WishfigureSellerDesk-Package\WishfigureSellerDesk-Setup-1.0.0.exe`
- `C:\smart-store\release\WishfigureSellerDesk-Package\chrome-extension`

설치 후 운영자는 보통 CLI를 다시 입력할 필요 없이, 시작 메뉴 또는 바탕화면 바로가기로 앱을 실행하면 됩니다.

설치형 확인:

- `release\win-unpacked` 실행 파일과 NSIS 설치 파일 기준으로 동작 확인

### 1. 프로젝트 폴더 이동

```cmd
cd /d C:\smart-store
```

### 2. 패키지 설치

```cmd
npm install
```

### 3. Playwright 브라우저 준비

```cmd
npx playwright install
```

### 4. Chrome Extension 빌드 포함 Electron 앱 실행

```cmd
npm run desktop:dev
```

이 스크립트는 확장 빌드까지 같이 수행합니다. 앱이 뜨면 먼저 `chrome://extensions 열기` 와 `확장 폴더 열기` 버튼으로 확장을 Chrome에 로드하세요.

## Windows CMD 기준 권장 실행 순서

```cmd
cd /d C:\smart-store
npm install
npx playwright install
npm run desktop:dev
```

설치 파일까지 만들려면:

```cmd
cd /d C:\smart-store
npm install
npx playwright install
npm run desktop:dist
```

빌드 확인까지 하려면:

```cmd
cd /d C:\smart-store
npm run typecheck
npm run desktop:build
```

하네스 기준 권장 검증:

```cmd
cd /d C:\smart-store
npm run verify:desktop
```

설치형까지 다시 확인하려면:

```cmd
cd /d C:\smart-store
npm run verify:release
```

## 하이브리드 기본 사용 흐름

앱은 아이디/비밀번호를 저장하지 않습니다. 실제 조작은 이미 로그인된 Chrome 판매자센터 탭 안에서만 수행합니다.

운영 절차:

1. Electron 앱 실행
2. `chrome://extensions 열기` 클릭
3. `확장 폴더 열기` 클릭 후 `dist\apps\chrome-extension` 또는 설치형 앱의 `resources\chrome-extension` 폴더를 Chrome에 압축 해제 로드
4. Chrome에서 스마트스토어 판매자센터 로그인
5. 상품 조회/수정 화면으로 이동
6. 상세검색에서 `묶음배송` 조건을 운영자가 먼저 적용
7. Electron `검증` 화면에서 `현재 탭 확인 -> DOM inspection -> 대상 수집 -> dry-run`
8. 확인이 끝나면 `실행` 화면에서 `배치 시작`
9. 필요하면 `배치 중단` 또는 `배치 재개`

## dry-run 권장 순서

1. Chrome에서 판매자센터 로그인
2. 묶음배송 상세검색 적용
3. Electron `검증` 화면에서 `현재 탭 확인`
4. `DOM inspection`
5. `대상 수집`
6. `dry-run`
7. 마지막 브리지 응답 JSON에서 대상 수와 샘플 확인

## 실제 실행 방법

1. 위 dry-run 흐름까지 확인
2. Electron `실행` 화면 이동
3. `배치 시작`
4. 진행률 카드에서 `completed/target`, `phase`, 최근 업데이트 시각 확인
5. 필요하면 `배치 중단`
6. Chrome 탭이 살아 있고 checkpoint가 남아 있으면 `배치 재개`

## 설정 파일과 출력 경로

개발 모드(`npm run desktop:dev`) 기준 앱 설정 파일:

- `C:\smart-store\.desktop-app\settings.json`

개발 모드 기준 기본 출력 디렉터리:

- `C:\smart-store\output`

설치형 앱 기준 데이터 루트:

- `%APPDATA%\smart-store`

설치형 앱 기준 설정/세션/출력은 위 데이터 루트 아래에 저장됩니다.

하이브리드 브리지 관련 경로:

- 개발 모드 확장 빌드: `C:\smart-store\dist\apps\chrome-extension`
- 설치형 포함 경로: `release\win-unpacked\resources\chrome-extension`

## Chrome 탭/세션 문제 대응

다음 상황을 감지하면 조용히 실패하지 않고 세션 복구 에러로 처리합니다.

- 로그인 페이지로 리다이렉트됨
- 로그인 폼이 다시 나타남
- CAPTCHA / MFA 화면이 나타남
- 접근 권한 없음 페이지가 열림
- 상품 목록 / 수정 화면 핵심 셀렉터가 사라짐

복구 순서:

1. Chrome 판매자센터 탭에서 다시 로그인
2. 묶음배송 상세검색 재적용 여부 확인
3. Electron `검증` 화면에서 `현재 탭 확인`
4. 필요하면 `DOM inspection` 다시 실행
5. `실행` 화면에서 `배치 재개`

## selector override 방법

기본 셀렉터 프로필은 코드에 포함되어 있고, 운영 중 DOM이 바뀌면 설정 화면의 `selector override 파일`에 JSON 경로를 넣어 덮어쓸 수 있습니다.

예시:

```json
{
  "id": "smartstore-default",
  "productList": {
    "searchInput": [
      "input[name=\"productNo\"]",
      "input[placeholder*=\"상품번호\"]"
    ]
  }
}
```

관련 코드:

- `packages/infrastructure-playwright/src/config/default-selector-profile.ts`
- `packages/infrastructure-playwright/src/config/selector-profile.ts`
- `packages/infrastructure-playwright/src/config/selector-profile.registry.ts`

## package.json 기준 주요 스크립트

- `npm run desktop:dev`
  Chrome 확장 빌드 후 Electron 개발 실행
- `npm run desktop:build`
  Chrome 확장 빌드 후 Electron main/preload/renderer 빌드
- `npm run desktop:dist`
  Windows 설치 파일 생성
- `npm run desktop:preview`
  Electron preview
- `npm run typecheck`
  전체 타입 검사
- `npm run check`
  타입 검사

기존 `src/*` CLI PoC는 현재 설치형 데스크톱 앱 흐름과 충돌하지 않도록 제거되었습니다.
운영자는 Electron 앱과 Chrome 확장만 사용합니다.

## 개발 검증 명령

```cmd
cd /d C:\smart-store
npm run typecheck
npm run desktop:build
```

## 참고

- Electron dev 실행은 GUI 앱이라 터미널이 계속 열려 있는 정상 동작입니다.
- `desktop:dist`로 만든 설치 파일은 `release` 폴더에 생성됩니다.
- 설치형 앱은 프로젝트 루트 대신 Electron 사용자 데이터 경로 아래에 설정/세션/출력을 저장하도록 설계되어 있습니다.
- 실제 운영 전에는 `dry-run`으로 먼저 동작을 확인하는 것을 권장합니다.
- 관리자센터 DOM이 바뀌면 selector profile을 먼저 조정하세요.

## 문제 해결

- `Cannot read properties of undefined (reading 'whenReady')`
  또는 `BrowserWindow` 관련 오류가 dev 실행에서 보이면, Electron이 Node 모드로 실행된 경우입니다.
  현재 `npm run desktop:dev`, `npm run desktop:build`, `npm run desktop:preview` 스크립트는 이 환경값을 자동으로 정리하도록 설정되어 있습니다.
- 창이 안 보이는데 프로세스만 남아 있다면 먼저 아래로 기존 Electron 프로세스를 정리한 뒤 다시 실행하세요.

```cmd
taskkill /F /IM electron.exe
```

- Electron 메인 부팅 로그는 아래 temp 파일에 남습니다.

```cmd
%TEMP%\smart-store-desktop-main.log
```

- Codex/특정 터미널에서만 실행이 안 되고, 설치형을 더블클릭하면 되는 경우는 현재 셸에 `ELECTRON_RUN_AS_NODE=1` 이 남아 있는 경우가 많습니다.
  그럴 때는 새 CMD를 열거나 아래를 먼저 실행하세요.

```cmd
set ELECTRON_RUN_AS_NODE=
```
