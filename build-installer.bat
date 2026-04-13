@echo off
setlocal
:: File: build-installer.bat

cd /d "%~dp0"
set "ELECTRON_RUN_AS_NODE="

echo.
echo ============================================
echo Smart Store Desktop Operator Installer Build
echo ============================================
echo Workspace: %CD%
echo.

where npm >nul 2>nul
if errorlevel 1 (
  echo [ERROR] npm was not found. Please install Node.js 20+ first.
  goto :fail
)

where npx >nul 2>nul
if errorlevel 1 (
  echo [ERROR] npx was not found. Please install Node.js 20+ first.
  goto :fail
)

echo [1/4] Installing npm dependencies...
call npm.cmd install
if errorlevel 1 goto :fail

echo.
echo [2/4] Running typecheck...
call npm.cmd run typecheck
if errorlevel 1 goto :fail

echo.
echo [3/4] Running tests...
call npm.cmd run test
if errorlevel 1 goto :fail

echo.
echo [4/4] Building Windows installer...
call npm.cmd run desktop:dist
if errorlevel 1 goto :fail

echo.
echo [OK] Installer build completed successfully.
echo Output folder: "%CD%\release"
echo Main installer: "%CD%\release\SmartStoreDesktopOperator-Setup-1.0.0.exe"
echo.
pause
exit /b 0

:fail
set "EXIT_CODE=%ERRORLEVEL%"
if "%EXIT_CODE%"=="" set "EXIT_CODE=1"
echo.
echo [FAILED] Installer build failed. Exit code: %EXIT_CODE%
echo Check the console output above for the failing step.
echo.
pause
exit /b %EXIT_CODE%
