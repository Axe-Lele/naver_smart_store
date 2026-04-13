// File: packages/application/src/ports/settings-store.port.ts
import type { AppSettings } from '../settings/app-settings.js';

export interface SettingsStorePort {
  loadSettings(): Promise<AppSettings>;
  saveSettings(settings: AppSettings): Promise<AppSettings>;
}
