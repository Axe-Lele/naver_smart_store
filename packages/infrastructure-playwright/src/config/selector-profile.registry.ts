// File: packages/infrastructure-playwright/src/config/selector-profile.registry.ts
import fsPromises from 'node:fs/promises';

import { defaultSmartStoreSelectorProfile } from './default-selector-profile.js';
import {
  mergeSelectorProfile,
  parseSelectorProfileOverride,
  resolveSelectorProfile,
  type ResolvedSelectorProfile,
  type SelectorProfileConfig,
} from './selector-profile.js';
import { SelectorProfileNotFoundError } from '../errors/playwright-infrastructure.error.js';

export class SelectorProfileRegistry {
  private readonly profiles = new Map<string, SelectorProfileConfig>();

  constructor(profiles: readonly SelectorProfileConfig[] = [defaultSmartStoreSelectorProfile]) {
    for (const profile of profiles) {
      this.profiles.set(profile.id, profile);
    }
  }

  register(profile: SelectorProfileConfig): void {
    this.profiles.set(profile.id, profile);
  }

  async getResolved(input: {
    profileId: string;
    selectorConfigPath?: string;
  }): Promise<ResolvedSelectorProfile> {
    const baseProfile = this.profiles.get(input.profileId);

    if (!baseProfile) {
      throw new SelectorProfileNotFoundError(input.profileId);
    }

    if (!input.selectorConfigPath) {
      return resolveSelectorProfile(baseProfile);
    }

    const raw = await fsPromises.readFile(input.selectorConfigPath, 'utf8');
    const override = parseSelectorProfileOverride(JSON.parse(raw));
    return resolveSelectorProfile(mergeSelectorProfile(baseProfile, override));
  }
}
