// Path: C:\smart-store\apps\chrome-extension\src\infrastructure\seller-center-page.gateway.ts
import type { SellerCenterPageGatewayPort } from "../application/index.js";

export class SellerCenterPageGateway implements SellerCenterPageGatewayPort {
  public constructor(
    private readonly windowRef: Window,
    private readonly documentRef: Document,
  ) {}

  public getPageTitle(): string {
    return this.documentRef.title;
  }

  public getPageUrl(): string {
    return this.windowRef.location.href;
  }

  public isSellerCenterSurface(): boolean {
    return this.windowRef.location.origin === "https://sell.smartstore.naver.com";
  }

  public captureHtmlSnapshot(): string {
    return this.documentRef.documentElement.outerHTML;
  }

  public getBodyText(): string {
    return this.documentRef.body?.innerText ?? "";
  }
}
