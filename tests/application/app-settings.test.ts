import { describe, expect, it } from "vitest";

import {
  buildRunPolicyFromSettings,
  DEFAULT_PREORDER_REQUIRED_OPTIONS,
  parseAppSettings,
} from "../../packages/application/src/settings/app-settings.js";

const baseSettings = {
  productsUrl: "https://sell.smartstore.naver.com/#/products/origin-list",
  loginMode: "storageState" as const,
  storageStatePath: "C:/tmp/state.json",
  outputDir: "C:/tmp/output",
};

describe("app settings", () => {
  it("keeps the current preorder option as the default", () => {
    const settings = parseAppSettings(baseSettings);

    expect(settings.preorderRequiredOptions).toEqual(DEFAULT_PREORDER_REQUIRED_OPTIONS);
  });

  it("accepts multiple preorder required options", () => {
    const settings = parseAppSettings({
      ...baseSettings,
      preorderRequiredOptions: [
        { name: "예약캔슬 불가", value: "동의합니다." },
        { name: "해외 발송", value: "확인했습니다." },
      ],
    });

    expect(settings.preorderRequiredOptions).toEqual([
      { name: "예약캔슬 불가", value: "동의합니다." },
      { name: "해외 발송", value: "확인했습니다." },
    ]);
  });

  it("caps the run policy consecutive failure limit at ten", () => {
    const settings = parseAppSettings({
      ...baseSettings,
      consecutiveFailureLimit: 20,
    });

    expect(settings.consecutiveFailureLimit).toBe(20);
    expect(buildRunPolicyFromSettings(settings).consecutiveFailureLimit).toBe(10);
  });
});
