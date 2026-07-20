// File: apps/desktop-electron/src/preload/index.ts
import { contextBridge, ipcRenderer } from 'electron';

import {
  DESKTOP_EVENT_CHANNEL,
  DESKTOP_INVOKE_CHANNEL,
  type DesktopApi,
  type DesktopInvokeRequest,
  type DesktopInvokeResponse,
  type SerializedDesktopError,
} from '@smart-store/shared';

class DesktopApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: string,
    public readonly recoveryCommand?: string,
  ) {
    super(message);
    this.name = 'DesktopApiError';
  }

  static fromSerialized(error: SerializedDesktopError): DesktopApiError {
    return new DesktopApiError(
      error.code,
      error.message,
      error.details,
      error.recoveryCommand,
    );
  }
}

async function invoke<T>(request: DesktopInvokeRequest): Promise<T> {
  const response = (await ipcRenderer.invoke(
    DESKTOP_INVOKE_CHANNEL,
    request,
  )) as DesktopInvokeResponse<T>;

  if (!response.ok) {
    throw DesktopApiError.fromSerialized(response.error);
  }

  return response.data;
}

const desktopApi: DesktopApi = {
  app: {
    getBootState: async () => invoke({ command: 'app:getBootState' }),
    updateSettings: async (input) =>
      invoke({ command: 'app:updateSettings', payload: input }),
  },
  hybrid: {
    getState: async () => invoke({ command: 'hybrid:getState' }),
    sendCommand: async (input) => invoke({ command: 'hybrid:sendCommand', payload: input }),
    openChromeExtensions: async () => invoke({ command: 'hybrid:openChromeExtensions' }),
    openSellerCenter: async () => invoke({ command: 'hybrid:openSellerCenter' }),
    openCafe24Admin: async () => invoke({ command: 'hybrid:openCafe24Admin' }),
  },
  amazon: {
    lookupProducts: async (input) =>
      invoke({ command: 'amazon:lookupProducts', payload: input }),
  },
  productNames: {
    translate: async (input) =>
      invoke({ command: 'productNames:translate', payload: input }),
  },
  system: {
    openPath: async (input) => invoke({ command: 'system:openPath', payload: input }),
    copyText: async (input) => invoke({ command: 'system:copyText', payload: input }),
  },
  events: {
    subscribe(listener) {
      const wrapped = (_event: unknown, payload: Parameters<typeof listener>[0]) =>
        listener(payload);

      ipcRenderer.on(DESKTOP_EVENT_CHANNEL, wrapped);
      return () => {
        ipcRenderer.removeListener(DESKTOP_EVENT_CHANNEL, wrapped);
      };
    },
  },
};

contextBridge.exposeInMainWorld('desktopApi', desktopApi);
