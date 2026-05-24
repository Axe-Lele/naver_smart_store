// Path: C:\smart-store\apps\chrome-extension\src\infrastructure\page-type-detector.ts
import type {
  CurrentPageTypeDetectorPort,
  PageTypeDetection,
  SellerCenterPageGatewayPort,
} from "../application/index.js";

export class CurrentPageTypeDetector implements CurrentPageTypeDetectorPort {
  public constructor(private readonly gateway: SellerCenterPageGatewayPort) {}

  public async detect(): Promise<PageTypeDetection> {
    if (!this.gateway.isSellerCenterSurface()) {
      return {
        pageType: "non_seller_center",
        verificationStatus: "verified",
        note: "Current tab origin is not the Smart Store seller center.",
        evidence: [this.gateway.getPageUrl()],
      };
    }

    const url = this.gateway.getPageUrl();
    const title = this.gateway.getPageTitle();
    const bodyText = this.gateway.getBodyText();
    const evidence = [title, url];

    if (containsAny(url, ["products"]) && containsAny(`${title} ${bodyText}`, ["상품 목록", "상품 조회"])) {
      return {
        pageType: "product_search",
        verificationStatus: "verification_required",
        note: "Heuristic detection only. Live verification is required for the product search surface.",
        evidence,
      };
    }

    if (containsAny(url, ["product", "products"]) && containsAny(`${title} ${bodyText}`, ["상품 수정", "예약구매"])) {
      return {
        pageType: "product_edit",
        verificationStatus: "verification_required",
        note: "Heuristic detection only. Live verification is required for the product edit surface.",
        evidence,
      };
    }

    return {
      pageType: "other_seller_center",
      verificationStatus: "verification_required",
      note: "Seller center surface detected, but the page type is not confidently classified yet.",
      evidence,
    };
  }
}

function containsAny(target: string, patterns: string[]): boolean {
  const normalizedTarget = target.toLowerCase();
  return patterns.some((pattern) => normalizedTarget.includes(pattern.toLowerCase()));
}
