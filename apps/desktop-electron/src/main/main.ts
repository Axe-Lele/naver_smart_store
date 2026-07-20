// File: apps/desktop-electron/src/main/main.ts
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { app, BrowserWindow } from 'electron';

import { registerDesktopIpc } from './ipc.js';
import { configurePlaywrightRuntime } from './playwright-runtime.js';

let mainWindow: BrowserWindow | null = null;
const bootLogPath = path.join(os.tmpdir(), 'smart-store-desktop-main.log');
const rendererDevServerUrl = process.env.ELECTRON_RENDERER_URL;

function writeBootLog(message: string, context?: Record<string, unknown>): void {
  const line = [
    new Date().toISOString(),
    message,
    context ? JSON.stringify(context) : '',
  ]
    .filter(Boolean)
    .join(' ');

  try {
    fs.appendFileSync(bootLogPath, `${line}\n`, 'utf8');
  } catch {
    // Ignore log write failures during boot.
  }
}

writeBootLog('main:module-loaded', {
  electronType: 'object',
  electronRunAsNode: process.env.ELECTRON_RUN_AS_NODE ?? null,
});

if (!app) {
  writeBootLog('main:invalid-electron-runtime', {
    electronType: 'object',
    electronRunAsNode: process.env.ELECTRON_RUN_AS_NODE ?? null,
  });
  process.exit(1);
}

function createRuntimeFactory(): () => Promise<{
  getBootState(): Promise<unknown>;
  saveSettings(settings: unknown): Promise<unknown>;
  getHybridBridgeState(): Promise<unknown>;
  sendHybridCommand(input: unknown): Promise<unknown>;
  openChromeExtensions(): Promise<unknown>;
  openSellerCenter(): Promise<unknown>;
  openCafe24Admin(): Promise<unknown>;
  lookupAmazonProducts(input: unknown): Promise<unknown>;
  translateProductNames(input: unknown): Promise<unknown>;
  openPath(targetPath: string): Promise<unknown>;
  copyText(text: string): Promise<unknown>;
}> {
  let runtimePromise:
    | Promise<{
      getBootState(): Promise<unknown>;
      saveSettings(settings: unknown): Promise<unknown>;
      getHybridBridgeState(): Promise<unknown>;
      sendHybridCommand(input: unknown): Promise<unknown>;
      openChromeExtensions(): Promise<unknown>;
      openSellerCenter(): Promise<unknown>;
      openCafe24Admin(): Promise<unknown>;
      lookupAmazonProducts(input: unknown): Promise<unknown>;
      translateProductNames(input: unknown): Promise<unknown>;
      openPath(targetPath: string): Promise<unknown>;
      copyText(text: string): Promise<unknown>;
      }>
    | undefined;

  return async () => {
    if (!runtimePromise) {
      writeBootLog('runtime:load:start');
      runtimePromise = import('./runtime.js')
        .then(({ DesktopAppRuntime }) => {
          writeBootLog('runtime:load:module-ready');
          return new DesktopAppRuntime();
        })
        .then((runtime) => {
          writeBootLog('runtime:load:instance-created');
          return runtime;
        })
        .catch((error) => {
          writeBootLog('runtime:load:error', {
            error:
              error instanceof Error
                ? {
                    name: error.name,
                    message: error.message,
                    stack: error.stack,
                  }
                : String(error),
          });
          runtimePromise = undefined;
          throw error;
        });
    }

    return runtimePromise;
  };
}

async function createWindow(): Promise<void> {
  const preloadPath = path.join(__dirname, '../preload/index.cjs');
  writeBootLog('createWindow:start', {
    preloadPath,
    isDev: Boolean(rendererDevServerUrl),
  });

  mainWindow = new BrowserWindow({
    width: 1600,
    height: 1000,
    minWidth: 1280,
    minHeight: 860,
    center: true,
    show: true,
    title: 'Wishfigure Seller Desk',
    autoHideMenuBar: true,
    backgroundColor: '#f7f9f7',
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      sandbox: false,
      nodeIntegration: false,
    },
  });

  mainWindow.on('ready-to-show', () => {
    writeBootLog('window:ready-to-show');
    mainWindow?.show();
    mainWindow?.focus();
  });

  mainWindow.webContents.on('did-finish-load', () => {
    writeBootLog('window:did-finish-load');
    if (!mainWindow) {
      return;
    }

    if (!mainWindow.isVisible()) {
      mainWindow.show();
    }

    mainWindow.focus();
  });

  mainWindow.webContents.on(
    'did-fail-load',
    (_event, errorCode, errorDescription, validatedUrl) => {
      console.error(
        '[desktop] renderer load failed',
        JSON.stringify({
          errorCode,
          errorDescription,
          validatedUrl,
        }),
      );
      writeBootLog('window:did-fail-load', {
        errorCode,
        errorDescription,
        validatedUrl,
      });

      if (mainWindow && !mainWindow.isVisible()) {
        mainWindow.show();
        mainWindow.focus();
      }
    },
  );

  mainWindow.on('closed', () => {
    writeBootLog('window:closed');
    mainWindow = null;
  });

  if (rendererDevServerUrl) {
    writeBootLog('window:load-url', {
      url: rendererDevServerUrl,
    });
    await mainWindow.loadURL(rendererDevServerUrl);
  } else {
    const rendererPath = path.join(__dirname, '../renderer/index.html');
    writeBootLog('window:load-file', {
      rendererPath,
    });
    await mainWindow.loadFile(rendererPath);
  }
}

const acquiredLock = app.requestSingleInstanceLock();
writeBootLog('app:lock', {
  acquiredLock,
  pid: process.pid,
  cwd: process.cwd(),
  packaged: app.isPackaged,
});

if (!acquiredLock) {
  writeBootLog('app:quit:lock-not-acquired');
  app.quit();
} else {
  app.on('second-instance', () => {
    writeBootLog('app:second-instance');
    if (!mainWindow) {
      return;
    }

    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }

    mainWindow.show();
    mainWindow.focus();
  });
}

if (acquiredLock) {
  app.whenReady().then(async () => {
    writeBootLog('app:when-ready');
    try {
      app.setAppUserModelId('com.smartstore.desktopoperator');
      configurePlaywrightRuntime();
      registerDesktopIpc(createRuntimeFactory());
      writeBootLog('app:ipc-registered');
      await createWindow();
      writeBootLog('app:window-created');

      app.on('activate', async () => {
        writeBootLog('app:activate');
        if (BrowserWindow.getAllWindows().length === 0) {
          await createWindow();
        }
      });
    } catch (error) {
      writeBootLog('app:when-ready:error', {
        error:
          error instanceof Error
            ? {
                name: error.name,
                message: error.message,
                stack: error.stack,
              }
            : String(error),
      });
      throw error;
    }
  }).catch((error) => {
    writeBootLog('app:when-ready:rejected', {
      error:
        error instanceof Error
          ? {
              name: error.name,
              message: error.message,
              stack: error.stack,
            }
          : String(error),
    });
  });
}

app.on('window-all-closed', () => {
  writeBootLog('app:window-all-closed', {
    platform: process.platform,
  });
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

process.on('uncaughtException', (error) => {
  writeBootLog('process:uncaught-exception', {
    name: error.name,
    message: error.message,
    stack: error.stack,
  });
});

process.on('unhandledRejection', (reason) => {
  writeBootLog('process:unhandled-rejection', {
    reason:
      reason instanceof Error
        ? {
            name: reason.name,
            message: reason.message,
            stack: reason.stack,
          }
        : String(reason),
  });
});
