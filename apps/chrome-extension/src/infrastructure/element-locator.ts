// Path: C:\smart-store\apps\chrome-extension\src\infrastructure\element-locator.ts
import type {
  SelectorCandidate,
  SelectorKey,
  SelectorRegistryPort,
} from "../application/index.js";
import { DomExplorer } from "./dom-explorer.js";

export interface LocatedElementResult {
  key: SelectorKey;
  verificationStatus: "verified" | "verification_required";
  candidate?: SelectorCandidate;
  element?: Element;
  note: string;
}

export class ElementLocator {
  public constructor(
    private readonly selectorRegistry: SelectorRegistryPort,
    private readonly explorer: DomExplorer,
  ) {}

  public resolveFirst(
    key: SelectorKey,
    root?: ParentNode,
  ): LocatedElementResult {
    const candidates = this.selectorRegistry.list(key);

    for (const candidate of candidates) {
      const matches = this.explorer.queryCandidate(candidate, root);
      if (matches.length === 1) {
        return {
          key,
          verificationStatus: candidate.verificationStatus,
          candidate,
          element: matches[0],
          note: `Resolved via ${candidate.strategy}:${candidate.value}`,
        };
      }
    }

    for (const candidate of candidates) {
      const matches = this.explorer.queryCandidate(candidate, root);
      if (matches.length > 0) {
        return {
          key,
          verificationStatus: "verification_required",
          candidate,
          element: matches[0],
          note: `Ambiguous match via ${candidate.strategy}:${candidate.value} count=${matches.length}`,
        };
      }
    }

    return {
      key,
      verificationStatus: "verification_required",
      note: `No selector candidate matched for ${key}.`,
    };
  }

  public resolveAll(key: SelectorKey, root?: ParentNode): Element[] {
    const unique = new Set<Element>();

    for (const candidate of this.selectorRegistry.list(key)) {
      for (const element of this.explorer.queryCandidate(candidate, root)) {
        unique.add(element);
      }
    }

    return [...unique];
  }
}
