@REM File: install-chrome-extension-helper.bat
@echo off
setlocal
chcp 65001 >nul

set "ROOT=%~dp0"
set "EXT_DIR=%ROOT%chrome-extension"

if not exist "%EXT_DIR%\manifest.json" (
  set "EXT_DIR=%ROOT%dist\apps\chrome-extension"
)

if not exist "%EXT_DIR%\manifest.json" (
  set "EXT_DIR=%ROOT%resources\chrome-extension"
)

if not exist "%EXT_DIR%\manifest.json" (
  set "EXT_DIR=%ROOT%release\win-unpacked\resources\chrome-extension"
)

if not exist "%EXT_DIR%\manifest.json" (
  echo [오류] Chrome 확장 빌드 폴더를 찾지 못했습니다.
  echo.
  echo 먼저 아래 명령으로 빌드해 주세요.
  echo npm run extension:build
  echo.
  pause
  exit /b 1
)

set "CHROME_EXE="
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set "CHROME_EXE=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not defined CHROME_EXE if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" set "CHROME_EXE=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not defined CHROME_EXE if exist "%LocalAppData%\Google\Chrome\Application\chrome.exe" set "CHROME_EXE=%LocalAppData%\Google\Chrome\Application\chrome.exe"
if not defined CHROME_EXE (
  for /f "delims=" %%I in ('where chrome.exe 2^>nul') do (
    set "CHROME_EXE=%%I"
    goto :chrome_found
  )
)

:chrome_found
echo %EXT_DIR% | clip

if defined CHROME_EXE (
  start "" "%CHROME_EXE%" "chrome://extensions/"
) else (
  start "" "chrome://extensions/"
)

start "" explorer.exe "%EXT_DIR%"

echo.
echo Chrome 확장 설치 도우미를 열었습니다.
echo.
echo 1. Chrome 확장 관리 화면에서 오른쪽 위 "개발자 모드"를 켭니다.
echo 2. "압축해제된 확장 프로그램을 로드합니다"를 누릅니다.
echo 3. 방금 열린 폴더를 선택합니다.
echo.
echo 확장 폴더 경로는 클립보드에 복사되어 있습니다.
echo %EXT_DIR%
echo.
pause
