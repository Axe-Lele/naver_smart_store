// File: packages/infrastructure-playwright/src/persistence/file-settings.store.ts
import type { AppSettings, AppSettingsInput, SettingsStorePort } from '@smart-store/application';
import { parseAppSettings } from '@smart-store/application';

import { fileExists, readJsonFile, writeJsonFile } from '../utils/fs.js';

export class FileSettingsStore implements SettingsStorePort {
  private cache: AppSettings | null = null;

  constructor(
    private readonly filePath: string,
    private readonly defaults: AppSettingsInput,
  ) {}

  async loadSettings(): Promise<AppSettings> {
    if (this.cache) {
      return this.cache;
    }

    if (!(await fileExists(this.filePath))) {
      const defaultSettings = parseAppSettings(this.defaults);
      await writeJsonFile(this.filePath, defaultSettings);
      this.cache = defaultSettings;
      return defaultSettings;
    }

    const loaded = parseAppSettings(await readJsonFile<AppSettingsInput>(this.filePath));
    this.cache = loaded;
    return loaded;
  }

  async saveSettings(settings: AppSettings): Promise<AppSettings> {
    const parsed = parseAppSettings(settings);
    await writeJsonFile(this.filePath, parsed);
    this.cache = parsed;
    return parsed;
  }
}
