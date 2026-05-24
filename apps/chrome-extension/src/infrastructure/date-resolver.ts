// Path: C:\smart-store\apps\chrome-extension\src\infrastructure\date-resolver.ts
import type {
  DateResolverPort,
  SelectorRegistryPort,
} from "../application/index.js";
import type { RunPolicy } from "../domain/index.js";
import { DomExplorer } from "./dom-explorer.js";
import { ElementLocator } from "./element-locator.js";
import { WaitStrategy } from "./wait-strategy.js";

export class UiMaxDateResolver implements DateResolverPort {
  private readonly explorer: DomExplorer;
  private readonly locator: ElementLocator;
  private readonly waitStrategy: WaitStrategy;

  public constructor(
    private readonly selectorRegistry: SelectorRegistryPort,
    private readonly documentRef: Document = document,
    private readonly windowRef: Window = window,
  ) {
    this.explorer = new DomExplorer(this.documentRef);
    this.locator = new ElementLocator(this.selectorRegistry, this.explorer);
    this.waitStrategy = new WaitStrategy(this.windowRef, this.documentRef);
  }

  public async resolveMaximumAllowedDate(input: {
    control:
      | "editor.orderPeriodControl"
      | "editor.dispatchCompletionDateControl";
    policy: RunPolicy;
  }): Promise<{
    strategy: "ui-max";
    value?: string;
    verificationStatus: "verified" | "verification_required";
    note: string;
  }> {
    await this.waitStrategy.waitForReady({ timeoutMs: 8_000, retries: 1 });

    const located = this.locator.resolveFirst(input.control);
    if (!located.element) {
      return {
        strategy: "ui-max",
        verificationStatus: "verification_required",
        note: `No candidate element resolved for ${input.control}. ${located.note}`,
      };
    }

    const directMax = this.readInputMax(located.element);
    if (directMax) {
      return {
        strategy: "ui-max",
        value: directMax,
        verificationStatus: located.verificationStatus,
        note: `Resolved from input max attribute via ${located.note}`,
      };
    }

    const selectMax = this.readSelectMax(located.element);
    if (selectMax) {
      return {
        strategy: "ui-max",
        value: selectMax,
        verificationStatus: "verification_required",
        note: `Resolved from selectable options via ${located.note}`,
      };
    }

    const datePickerMax = this.readDatepickerMax(located.element);
    if (datePickerMax) {
      return {
        strategy: "ui-max",
        value: datePickerMax,
        verificationStatus: "verification_required",
        note: `Resolved from nearby datepicker candidates via ${located.note}`,
      };
    }

    const validationMax = this.readValidationDerivedMax(located.element);
    if (validationMax) {
      return {
        strategy: "ui-max",
        value: validationMax,
        verificationStatus: "verification_required",
        note: `Resolved from validation message via ${located.note}`,
      };
    }

    return {
      strategy: "ui-max",
      verificationStatus: "verification_required",
      note: `Unable to determine a maximum UI date for ${input.control}. Live verification is required.`,
    };
  }

  private readInputMax(element: Element): string | undefined {
    if (element instanceof HTMLInputElement) {
      return normalizeDateValue(element.max) ?? undefined;
    }

    const input = element.querySelector("input");
    if (input instanceof HTMLInputElement) {
      return normalizeDateValue(input.max) ?? undefined;
    }

    return undefined;
  }

  private readSelectMax(element: Element): string | undefined {
    const select =
      element instanceof HTMLSelectElement
        ? element
        : element.querySelector("select");

    if (!(select instanceof HTMLSelectElement)) {
      return undefined;
    }

    const candidates = Array.from(select.options)
      .map((option) => normalizeDateValue(option.value) ?? normalizeDateValue(option.text))
      .filter((value): value is string => Boolean(value))
      .sort();

    return candidates.at(-1);
  }

  private readDatepickerMax(element: Element): string | undefined {
    const root = element.closest("section, article, form, fieldset, div") ?? this.documentRef;
    const values = new Set<string>();

    for (const node of root.querySelectorAll("button, [data-date], [aria-label], [value]")) {
      const candidates = [
        (node as HTMLElement).dataset?.date,
        node.getAttribute("aria-label"),
        node.getAttribute("value"),
        node.textContent,
      ];

      for (const candidate of candidates) {
        const normalized = normalizeDateValue(candidate);
        if (normalized) {
          values.add(normalized);
        }
      }
    }

    const sorted = [...values].sort();
    return sorted.at(-1);
  }

  private readValidationDerivedMax(element: Element): string | undefined {
    const input =
      element instanceof HTMLInputElement
        ? element
        : element.querySelector("input");

    if (!(input instanceof HTMLInputElement)) {
      return undefined;
    }

    const originalValue = input.value;
    const probeValue = "2099-12-31";
    input.value = probeValue;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));

    const fromMessage = extractDateFromText(input.validationMessage);

    input.value = originalValue;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));

    return fromMessage ?? undefined;
  }
}

function normalizeDateValue(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const normalized = value.replace(/[./]/g, "-").replace(/\s+/, "T");
  const dateTimeMatch = normalized.match(/\d{4}-\d{1,2}-\d{1,2}T\d{1,2}:\d{2}/);
  if (dateTimeMatch) {
    const [date, time] = dateTimeMatch[0].split("T");
    const [year, month, day] = date.split("-");
    const [hour, minute] = time.split(":");
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}T${hour.padStart(2, "0")}:${minute}`;
  }

  const dateMatch = normalized.match(/\d{4}-\d{1,2}-\d{1,2}/);
  if (!dateMatch) {
    return null;
  }

  const [year, month, day] = dateMatch[0].split("-");
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function extractDateFromText(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  return normalizeDateValue(value);
}
