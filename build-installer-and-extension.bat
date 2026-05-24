@echo off
setlocal EnableExtensions
:: File: build-installer-and-extension.bat

cd /d "%~dp0"
set "ELECTRON_RUN_AS_NODE="

set "ROOT=%CD%"
set "RELEASE_DIR=%ROOT%\release"
set "EXTENSION_BUILD_DIR=%ROOT%\dist\apps\chrome-extension"
set "PACKAGE_DIR=%RELEASE_DIR%\WishfigureSellerDesk-Package"
set "PACKAGE_EXTENSION_DIR=%PACKAGE_DIR%\chrome-extension"
set "INSTALL_HELPER=%ROOT%\install-chrome-extension-helper.bat"
set "PACKAGE_ONLY=0"
set "NO_PAUSE=0"

:parse_args
if "%~1"=="" goto :args_done
if /I "%~1"=="--package-only" (
  set "PACKAGE_ONLY=1"
  shift
  goto :parse_args
)
if /I "%~1"=="--no-pause" (
  set "NO_PAUSE=1"
  shift
  goto :parse_args
)
echo [ERROR] Unknown option: %~1
goto :fail

:args_done
echo.
echo ============================================
echo Wishfigure Seller Desk Package Build
echo ============================================
echo Workspace: "%ROOT%"
echo Package folder: "%PACKAGE_DIR%"
echo.

if "%PACKAGE_ONLY%"=="0" (
  where npm.cmd >nul 2>nul
  if errorlevel 1 (
    echo [ERROR] npm was not found. Please install Node.js 20+ first.
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
  echo [3/4] Building installer and Chrome extension...
  call npm.cmd run desktop:dist
  if errorlevel 1 goto :fail
) else (
  echo [1/2] Package-only mode. Skipping npm install/typecheck/desktop:dist.
)

echo.
if "%PACKAGE_ONLY%"=="0" (
  echo [4/4] Collecting installer and Chrome extension into one folder...
) else (
  echo [2/2] Collecting existing installer and Chrome extension into one folder...
)

if not exist "%EXTENSION_BUILD_DIR%\manifest.json" (
  echo [ERROR] Chrome extension build was not found:
  echo "%EXTENSION_BUILD_DIR%"
  echo.
  echo Run this file without --package-only, or run:
  echo npm run extension:build
  goto :fail
)

if not exist "%RELEASE_DIR%" mkdir "%RELEASE_DIR%"
if errorlevel 1 goto :fail

if exist "%PACKAGE_DIR%" (
  echo Cleaning old package folder...
  rmdir /s /q "%PACKAGE_DIR%"
  if errorlevel 1 goto :fail
)

mkdir "%PACKAGE_EXTENSION_DIR%"
if errorlevel 1 goto :fail

set "COPIED_INSTALLER=0"
for /f "delims=" %%F in ('dir /b /a:-d "%RELEASE_DIR%\WishfigureSellerDesk-Setup-*.exe" 2^>nul') do (
  copy /y "%RELEASE_DIR%\%%F" "%PACKAGE_DIR%\%%F" >nul
  if errorlevel 1 goto :fail
  set "COPIED_INSTALLER=1"
)

if "%COPIED_INSTALLER%"=="0" (
  echo [ERROR] Installer exe was not found:
  echo "%RELEASE_DIR%\WishfigureSellerDesk-Setup-*.exe"
  goto :fail
)

robocopy "%EXTENSION_BUILD_DIR%" "%PACKAGE_EXTENSION_DIR%" /E /NFL /NDL /NJH /NJS /NP >nul
if errorlevel 8 goto :fail

if exist "%INSTALL_HELPER%" (
  copy /y "%INSTALL_HELPER%" "%PACKAGE_DIR%\install-chrome-extension-helper.bat" >nul
  if errorlevel 1 goto :fail
)

echo.
echo [OK] Package build completed successfully.
echo.
echo Output:
echo "%PACKAGE_DIR%"
echo.
echo Contents:
dir /b "%PACKAGE_DIR%"
echo.
echo Chrome extension folder:
echo "%PACKAGE_EXTENSION_DIR%"
echo.
echo To install the extension, open chrome://extensions, enable Developer mode,
echo click "Load unpacked", and select the chrome-extension folder above.
echo.
if "%NO_PAUSE%"=="0" pause
exit /b 0

:fail
set "EXIT_CODE=%ERRORLEVEL%"
if "%EXIT_CODE%"=="" set "EXIT_CODE=1"
if "%EXIT_CODE%"=="0" set "EXIT_CODE=1"
echo.
echo [FAILED] Package build failed. Exit code: %EXIT_CODE%
echo Check the console output above for the failing step.
echo.
if "%NO_PAUSE%"=="0" pause
exit /b %EXIT_CODE%
