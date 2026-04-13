// File: apps/desktop-electron/src/renderer/global.d.ts
/// <reference types="vite/client" />

import type { DesktopApi } from '@smart-store/shared';

declare global {
  interface Window {
    desktopApi: DesktopApi;
  }
}

export {};
