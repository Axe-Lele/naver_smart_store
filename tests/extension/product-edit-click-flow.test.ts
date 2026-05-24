import { describe, expect, it } from "vitest";
import {
  createPreorderEditClickFlowUnits,
  runProductEditClickFlow,
  type ProductEditClickFlowActions,
  type UiOperationResult,
} from "../../apps/chrome-extension/src/infrastructure/product-edit-click-flow.js";

function createActions(
  calls: string[],
  failingAction?: keyof ProductEditClickFlowActions,
): ProductEditClickFlowActions {
  const action = (
    name: keyof ProductEditClickFlowActions,
  ) => async (): Promise<UiOperationResult> => {
    calls.push(name);
    if (name === failingAction) {
      return { ok: false, note: `${name} failed` };
    }

    return { ok: true, note: `${name} ok` };
  };

  return {
    openPreorderSection: action("openPreorderSection"),
    enablePreorder: action("enablePreorder"),
    openOrderStartCalendar: action("openOrderStartCalendar"),
    selectOrderStartCurrentDay: action("selectOrderStartCurrentDay"),
    selectOrderStartCurrentHour: action("selectOrderStartCurrentHour"),
    openOrderEndCalendar: action("openOrderEndCalendar"),
    moveOrderEndOneYearForward: action("moveOrderEndOneYearForward"),
    selectOrderEndLastEnabledDay: action("selectOrderEndLastEnabledDay"),
    selectOrderEndLastEnabledHour: action("selectOrderEndLastEnabledHour"),
    selectAfterSaleStatusOn: action("selectAfterSaleStatusOn"),
    openDispatchCompletionCalendar: action("openDispatchCompletionCalendar"),
    moveDispatchCompletionOneYearForward: action("moveDispatchCompletionOneYearForward"),
    moveDispatchCompletionThreeMonthsForward: action("moveDispatchCompletionThreeMonthsForward"),
    selectDispatchCompletionLastEnabledDay: action("selectDispatchCompletionLastEnabledDay"),
    openOptionSection: action("openOptionSection"),
    enableChoiceOption: action("enableChoiceOption"),
    selectSimpleChoiceOptionType: action("selectSimpleChoiceOptionType"),
    fillChoiceOptionName: action("fillChoiceOptionName"),
    fillChoiceOptionValue: action("fillChoiceOptionValue"),
    applyChoiceOptionList: action("applyChoiceOptionList"),
  };
}

describe("product edit click flow", () => {
  it("runs click units in 1-depth order", async () => {
    const calls: string[] = [];
    const units = createPreorderEditClickFlowUnits(createActions(calls), [
      { name: "해외 유통구조상 예약캔슬 불가", value: "동의합니다." },
    ]);

    const results = await runProductEditClickFlow(units);

    expect(results.every((result) => result.ok)).toBe(true);
    expect(units.map((unit) => unit.id)).toEqual([
      "preorder",
      "order-period",
      "after-sale-status",
      "dispatch-completion",
      "required-option",
    ]);
    expect(calls).toEqual([
      "openPreorderSection",
      "enablePreorder",
      "openOrderStartCalendar",
      "selectOrderStartCurrentDay",
      "selectOrderStartCurrentHour",
      "openOrderEndCalendar",
      "moveOrderEndOneYearForward",
      "selectOrderEndLastEnabledDay",
      "selectOrderEndLastEnabledHour",
      "selectAfterSaleStatusOn",
      "openDispatchCompletionCalendar",
      "moveDispatchCompletionOneYearForward",
      "moveDispatchCompletionThreeMonthsForward",
      "selectDispatchCompletionLastEnabledDay",
      "openOptionSection",
      "enableChoiceOption",
      "selectSimpleChoiceOptionType",
      "fillChoiceOptionName",
      "fillChoiceOptionValue",
      "applyChoiceOptionList",
    ]);
  });

  it("does not enter dependent steps after a 1-depth prerequisite click fails", async () => {
    const calls: string[] = [];
    const units = createPreorderEditClickFlowUnits(
      createActions(calls, "openPreorderSection"),
      [{ name: "해외 유통구조상 예약캔슬 불가", value: "동의합니다." }],
    );

    const results = await runProductEditClickFlow(units);

    expect(results[0]).toEqual({
      ok: false,
      note: "openPreorderSection failed",
    });
    expect(results.slice(1).every((result) => !result.ok)).toBe(true);
    expect(calls).toEqual(["openPreorderSection"]);
  });

  it("can repeat a single 1-depth unit by passing it more than once", async () => {
    const calls: string[] = [];
    const [preorderUnit] = createPreorderEditClickFlowUnits(createActions(calls), [
      { name: "해외 유통구조상 예약캔슬 불가", value: "동의합니다." },
    ]);

    await runProductEditClickFlow([preorderUnit, preorderUnit]);

    expect(calls).toEqual([
      "openPreorderSection",
      "enablePreorder",
      "openPreorderSection",
      "enablePreorder",
    ]);
  });

  it("adds fill and apply steps for every required option", async () => {
    const calls: string[] = [];
    const units = createPreorderEditClickFlowUnits(createActions(calls), [
      { name: "옵션 A", value: "동의 A" },
      { name: "옵션 B", value: "동의 B" },
    ]);

    await runProductEditClickFlow([units.at(-1)!]);

    expect(calls).toEqual([
      "openOptionSection",
      "enableChoiceOption",
      "selectSimpleChoiceOptionType",
      "fillChoiceOptionName",
      "fillChoiceOptionValue",
      "applyChoiceOptionList",
      "fillChoiceOptionName",
      "fillChoiceOptionValue",
      "applyChoiceOptionList",
    ]);
  });
});
