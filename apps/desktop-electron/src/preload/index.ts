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
  },
  settings: {
    get: async () => invoke({ command: 'settings:get' }),
    save: async (input) => invoke({ command: 'settings:save', payload: input }),
  },
  session: {
    prepare: async (input) => invoke({ command: 'session:prepare', payload: input }),
    validate: async () => invoke({ command: 'session:validate' }),
  },
  products: {
    load: async (input) => invoke({ command: 'products:load', payload: input }),
  },
  batch: {
    execute: async (input) => invoke({ command: 'batch:execute', payload: input }),
    resume: async (input) => invoke({ command: 'batch:resume', payload: input }),
    stop: async (input) => invoke({ command: 'batch:stop', payload: input }),
    retry: async (input) => invoke({ command: 'batch:retry', payload: input }),
  },
  history: {
    listRecent: async (input) => invoke({ command: 'history:listRecent', payload: input }),
    getRunDetail: async (input) =>
      invoke({ command: 'history:getRunDetail', payload: input }),
    export: async (input) => invoke({ command: 'history:export', payload: input }),
  },
  system: {
    openPath: async (input) => invoke({ command: 'system:openPath', payload: input }),
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
