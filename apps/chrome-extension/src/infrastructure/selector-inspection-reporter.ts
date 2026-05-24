// Path: C:\smart-store\apps\chrome-extension\src\infrastructure\selector-inspection-reporter.ts
import type {
  PageTypeDetection,
  SelectorInspectionReport,
  SelectorKeyInspection,
  SelectorRegistryPort,
  SellerCenterPageGatewayPort,
} from "../application/index.js";
import { DomExplorer } from "./dom-explorer.js";

export class SelectorInspectionReporter {
  public constructor(
    private readonly gateway: SellerCenterPageGatewayPort,
    private readonly selectorRegistry: SelectorRegistryPort,
    private readonly explorer: DomExplorer,
  ) {}

  public buildReport(detection: PageTypeDetection): SelectorInspectionReport {
    const keyInspections = this.selectorRegistry
      .keysForPageType(detection.pageType)
      .map<SelectorKeyInspection>((key) => {
        const candidateInspections = this.selectorRegistry
          .list(key)
          .map((candidate) => this.explorer.inspectCandidate(candidate));

        return {
          key,
          verificationStatus: "verification_required",
          candidateInspections,
          summary: summarizeKeyInspection(key, candidateInspections.length, candidateInspections),
        };
      });

    return {
      pageType: detection.pageType,
      pageTitle: this.gateway.getPageTitle(),
      pageUrl: this.gateway.getPageUrl(),
      generatedAt: new Date().toISOString(),
      verificationStatus: detection.verificationStatus,
      keyInspections,
      summary: [
        detection.note,
        ...keyInspections.map((inspection) => inspection.summary),
      ],
    };
  }

  public formatUnverifiedReport(report: SelectorInspectionReport): string {
    const lines: string[] = [];
    lines.push(`pageType=${report.pageType}`);
    lines.push(`pageTitle=${report.pageTitle}`);
    lines.push(`pageUrl=${report.pageUrl}`);
    lines.push(`verificationStatus=${report.verificationStatus}`);

    for (const inspection of report.keyInspections) {
      lines.push(`- ${inspection.key} [${inspection.verificationStatus}]`);
      for (const candidateInspection of inspection.candidateInspections) {
        lines.push(
          `  - ${candidateInspection.candidate.strategy}:${candidateInspection.candidate.value} ` +
            `(matched=${candidateInspection.matchedCount}, fallback=${candidateInspection.candidate.fallback}, status=${candidateInspection.candidate.verificationStatus})`,
        );
      }
    }

    return lines.join("\n");
  }
}

function summarizeKeyInspection(
  key: string,
  totalCandidates: number,
  candidateInspections: SelectorKeyInspection["candidateInspections"],
): string {
  const matchedCount = candidateInspections.filter(
    (inspection) => inspection.matchedCount > 0,
  ).length;

  return `${key}: ${matchedCount}/${totalCandidates} candidates matched`;
}
