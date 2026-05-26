// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  DateResolverPort,
  SellerCenterPageGatewayPort,
} from "../../apps/chrome-extension/src/application/ports.js";
import {
  ProductId,
  ProductProcessingState,
  type PreorderChangePlan,
} from "../../apps/chrome-extension/src/domain/index.js";
import {
  InMemorySelectorRegistry,
  ProductEditPageDriver,
  WaitStrategy,
} from "../../apps/chrome-extension/src/infrastructure/index.js";

describe("ProductEditPageDriver save return", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(WaitStrategy.prototype, "waitForReady").mockResolvedValue();
    vi.spyOn(WaitStrategy.prototype, "throttle").mockResolvedValue();
    Object.defineProperty(document, "readyState", {
      configurable: true,
      value: "complete",
    });
    document.body.innerHTML = "";
  });

  it("clicks the save-completion product management button instead of the side navigation item", async () => {
    let currentUrl =
      "https://sell.smartstore.naver.com/#/products/origin-edit/1234567890";
    let sideNavigationClicks = 0;
    let saveCompletionClicks = 0;

    document.body.innerHTML = `
      <aside>
        <button id="sideProductManagement" type="button">상품관리</button>
      </aside>
      <section name="preOrder">
        <strong>예약구매</strong>
        <label for="preOrder1_1">설정함</label>
        <input id="preOrder1_1" name="preOrder1" value="true" type="radio" />
        <label for="preOrder1_0">설정안함</label>
        <input id="preOrder1_0" name="preOrder1" value="false" type="radio" />
        <span>주문기간</span>
      </section>
      <button id="saveButton" type="button">저장하기</button>
      <div id="saveResult"></div>
    `;

    document
      .querySelector("#sideProductManagement")
      ?.addEventListener("click", () => {
        sideNavigationClicks += 1;
      });
    document.querySelector("#saveButton")?.addEventListener("click", () => {
      document.querySelector("#saveResult")!.innerHTML = `
        <section id="saveComplete">
          <p>저장 완료</p>
          <button id="saveCompletionProductManagement" type="button" ng-click="vm.goSearch()">
            상품관리
          </button>
        </section>
      `;
      document
        .querySelector("#saveCompletionProductManagement")
        ?.addEventListener("click", () => {
          saveCompletionClicks += 1;
          currentUrl = "https://sell.smartstore.naver.com/#/products";
        });
    });

    const driver = createDriver(() => currentUrl);

    const result = await driver.applyPreorderChangePlan(createPlan());

    expect(result.state, result.message).toBe(ProductProcessingState.SUCCEEDED);
    expect(saveCompletionClicks).toBe(1);
    expect(sideNavigationClicks).toBe(0);
    expect(currentUrl).toBe("https://sell.smartstore.naver.com/#/products");
  });
});

function createDriver(getPageUrl: () => string): ProductEditPageDriver {
  return new ProductEditPageDriver(
    createGateway(getPageUrl),
    new InMemorySelectorRegistry(),
    createDateResolver(),
    document,
    window,
    undefined,
    undefined,
    async () => true,
    async () => true,
    async () => true,
    async () => true,
    async () => true,
    async () => true,
    async () => true,
    async () => true,
    async () => true,
    async () => true,
    async () => true,
    async () => true,
    async () => true,
    async () => true,
    async () => true,
    async () => true,
    async () => true,
    async () => true,
    async () => true,
    async () => true,
  );
}

function createGateway(getPageUrl: () => string): SellerCenterPageGatewayPort {
  return {
    getPageTitle: () => "상품 수정",
    getPageUrl,
    isSellerCenterSurface: () => true,
    captureHtmlSnapshot: () => document.documentElement.outerHTML,
    getBodyText: () => document.body.textContent ?? "",
  };
}

function createDateResolver(): DateResolverPort {
  return {
    async resolveMaximumAllowedDate() {
      return {
        strategy: "ui-max",
        value: "2027-01-01",
        verificationStatus: "verified",
        note: "test resolver",
      };
    },
  };
}

function createPlan(): PreorderChangePlan {
  return {
    productId: ProductId.create("1234567890"),
    dryRun: false,
    targetScope: "bundle-delivery-search-result",
    requestedChanges: {
      productType: "PREORDER",
      orderPeriodEnd: "2027-01-01",
      postPreorderSaleStatus: "ON_SALE",
      dispatchCompletionDueDate: "2027-01-01",
      requiredOption: {
        enabled: true,
        type: "SINGLE",
        name: "해외 유통구조상 예약캔슬 불가",
        value: "동의합니다.",
      },
    },
    notes: [],
  };
}
