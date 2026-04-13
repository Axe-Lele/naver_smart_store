// File: packages/application/src/use-cases/update-settings.use-case.ts
import type { AppSettings, AppSettingsInput } from '../settings/app-settings.js';
import { parseAppSettings } from '../settings/app-settings.js';
import type { SettingsStorePort } from '../ports/settings-store.port.js';

export class UpdateSettingsUseCase {
  constructor(private readonly settingsStore: SettingsStorePort) {}

  async execute(input: AppSettingsInput): Promise<AppSettings> {
    const settings = parseAppSettings(input);
    return this.settingsStore.saveSettings(settings);
  }
}
