// Path: C:\smart-store\apps\chrome-extension\src\infrastructure\product-edit-page.parser.ts
import type {
  ProductEditPageParserPort,
  ProductEditPageDraft,
  SelectorKeyInspection,
  SelectorRegistryPort,
} from "../application/index.js";
import { DomExplorer } from "./dom-explorer.js";

export class ProductEditPageParser implements ProductEditPageParserPort {
  public constructor(
    private readonly explorer: DomExplorer,
    private readonly selectorRegistry: SelectorRegistryPort,
  ) {}

  public async inspectCurrentPage(): Promise<ProductEditPageDraft> {
    const keys = this.selectorRegistry.keysForPageType("product_edit");
    const matchedSelectorKeys = keys.map<SelectorKeyInspection>((key) => {
      const candidateInspections = this.selectorRegistry
        .list(key)
        .map((candidate) => this.explorer.inspectCandidate(candidate));

      return {
        key,
        verificationStatus: "verification_required",
        candidateInspections,
        summary: summarize(key, candidateInspections),
      };
    });

    return {
      pageType: "product_edit",
      verificationStatus: "verification_required",
      matchedSelectorKeys,
      notes: [
        "Product edit parser is draft-only.",
        "Verification required for preorder section, save button, and date controls.",
      ],
    };
  }
}

function summarize(
  key: string,
  candidateInspections: SelectorKeyInspection["candidateInspections"],
): string {
  const matches = candidateInspections
    .filter((inspection) => inspection.matchedCount > 0)
    .map((inspection) => `${inspection.candidate.strategy}:${inspection.matchedCount}`);

  return matches.length > 0
    ? `${key} => ${matches.join(", ")}`
    : `${key} => no candidate matches`;
}
