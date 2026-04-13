# Smart Store Desktop Operator

네이버 스마트스토어 판매자센터 UI에서 예약구매 상품을 일반상품으로 전환하는 Electron + React + Playwright 기반 데스크톱 앱입니다.

중요 정책:

- 로그인 ID/PW 자동 입력 금지
- CAPTCHA/MFA 우회 금지
- 비공식 내부 API 직접 호출 금지
- 관리자센터 UI에서 운영자가 직접 할 수 있는 동작만 자동화
- 기본 로그인 방식은 수동 로그인 + `storageState` 저장

기존 CLI PoC도 프로젝트 안에 남아 있지만, 현재 기준 운영자용 진입점은 Electron 앱입니다.

즉, 지금 기준으로는 GUI 앱이 맞고, 운영자는 터미널 명령 대신 설치형 앱으로 사용할 수 있게 패키징할 수 있습니다.

## 현재 구현 범위

- Electron main / preload / renderer 분리
- React + TypeScript 기반 운영 UI
- 로그인 세션 준비 화면
- 상품 목록 조회 / 검색 / 필터 / 선택
- 예약상품 -> 일반상품 배치 실행
- `dry-run`
- 실시간 로그 패널
- 실행 결과 / 실패 아티팩트 확인
- 실패 항목 재시도
- 설정 화면
- `storageState` 재사용
- 세션 만료 감지 및 재로그인 유도
- 실패 스크린샷 / HTML 저장
- checkpoint / resume / 연속 실패 제한

## 폴더 개요

- `apps/desktop-electron`
  Electron 셸, preload, React renderer
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

터미널 입력 없이 한 번에 돌리려면 루트의 배치 파일을 실행해도 됩니다.

```cmd
cd /d C:\smart-store
build-installer.bat
```

생성 결과:

- `C:\smart-store\release\SmartStoreDesktopOperator-Setup-1.0.0.exe`

설치 후 운영자는 보통 CLI를 다시 입력할 필요 없이, 시작 메뉴 또는 바탕화면 바로가기로 앱을 실행하면 됩니다.

설치형 검증:

- NSIS 설치 파일로 `C:\smart-store\smoke-install` 경로에 실제 설치 테스트 완료
- 설치 후 `Smart Store Desktop Operator.exe` 실행 시 메인 윈도우 생성 확인

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

### 4. Electron 앱 실행

```cmd
npm run desktop:dev
```

앱이 뜨면 왼쪽 메뉴에서 `로그인 세션` 화면으로 들어가세요.

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
npm run test
npm run desktop:build
```

## 로그인 세션 준비 방법

앱은 아이디/비밀번호를 저장하지 않습니다.

운영 절차:

1. 앱에서 `로그인 세션` 화면으로 이동합니다.
2. `로그인 준비 시작` 버튼을 누릅니다.
3. 열린 브라우저에서 네이버/스마트스토어에 직접 로그인합니다.
4. CAPTCHA, MFA, 추가 본인확인이 나오면 사람이 직접 처리합니다.
5. 상품 목록 화면이 확인되면 세션이 `storageState`로 저장됩니다.
6. 다시 앱으로 돌아와 `세션 검증` 버튼으로 재사용 가능 여부를 확인합니다.

기본 세션 경로:

- `C:\smart-store\.auth\smartstore-storage-state.json`

기본 persistent 프로필 경로:

- `C:\smart-store\.auth\chrome-profile`

## 기본 사용 흐름

### 1. 세션 준비

- `로그인 세션` 화면에서 세션 저장
- `세션 검증`으로 만료 여부 확인

### 2. 상품 조회

- `상품 목록` 화면에서 검색어 입력
- 필요하면 상품번호를 여러 줄로 직접 붙여 넣기
- 상태 필터 선택
- `상품 불러오기` 실행

### 3. 상품 선택

- 체크박스로 대상 상품 선택
- `현재 목록 전체 선택/해제` 가능

### 4. 배치 실행

- `배치 실행` 화면 이동
- `dry-run` 여부 선택
- `실행 메모 / 요청자` 입력 가능
- `dry-run 실행` 또는 `실제 변경 실행`
- 필요 시 `체크포인트 이어 실행`, `실행 중지`

### 5. 결과 확인

- `실행 결과` 화면에서 최근 run 선택
- 성공 / 잠금 / 실패 요약 확인
- 실패 항목의 PNG / HTML 아티팩트 열기
- `리포트 내보내기`로 CSV/JSONL/요약 저장

### 6. 실패 재시도

- `실패 재시도` 화면에서 과거 run 선택
- `dry-run 재시도` 여부 선택
- `모든 failed 포함` 옵션 선택 가능
- 재시도 실행

## 설정 파일과 출력 경로

개발 모드(`npm run desktop:dev`) 기준 앱 설정 파일:

- `C:\smart-store\.desktop-app\settings.json`

개발 모드 기준 기본 출력 디렉터리:

- `C:\smart-store\output`

설치형 앱 기준 데이터 루트:

- `%APPDATA%\smart-store`

설치형 앱 기준 설정/세션/출력은 위 데이터 루트 아래에 저장됩니다.

실행 상태 저장:

- `output\state\jobs`
- `output\state\item-results`
- `output\state\batch-results`
- `output\state\checkpoints`
- `output\state\control`

실패 아티팩트:

- `output\screenshots`
- `output\html`

리포트 출력:

- `output\reports\<jobId>`

## 세션 만료 / 권한 문제 대응

다음 상황을 감지하면 조용히 실패하지 않고 세션 복구 에러로 처리합니다.

- 로그인 페이지로 리다이렉트됨
- 로그인 폼이 다시 나타남
- CAPTCHA / MFA 화면이 나타남
- 접근 권한 없음 페이지가 열림
- 상품 목록 / 수정 화면 핵심 셀렉터가 사라짐

앱 동작:

- 실패 스크린샷 저장
- HTML 저장
- 로그 패널에 원인 기록
- `로그인 세션` 화면에서 다시 세션 준비하도록 유도

복구 순서:

1. `로그인 세션` 화면으로 이동
2. `로그인 준비 시작`
3. 직접 로그인 및 인증 처리
4. `세션 검증`
5. `배치 실행` 화면에서 `체크포인트 이어 실행` 또는 `실패 재시도`

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
  Electron 개발 실행
- `npm run desktop:build`
  Electron main/preload/renderer 빌드
- `npm run desktop:dist`
  Windows 설치 파일 생성
- `npm run desktop:preview`
  Electron preview
- `npm run typecheck`
  전체 타입 검사
- `npm run test`
  핵심 도메인/세션 테스트
- `npm run check`
  타입 검사 + 테스트

기존 CLI PoC 스크립트도 유지됩니다.

- `npm run login:prepare`
- `npm run poc`
- `npm run run`

## 개발 검증 명령

```cmd
cd /d C:\smart-store
npm run typecheck
npm run test
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
