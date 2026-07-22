import { describe, expect, it } from "vitest";

import {
  isAmazonJapanUrl,
  parseAmazonReleaseDate,
} from "../../apps/chrome-extension/src/infrastructure/mango-amazon-release-date.js";

describe("parseAmazonReleaseDate", () => {
  it("예약 상품 배너의 発売予定日 문장에서 날짜를 읽는다", () => {
    const html = `<div id="ppd"><span>この商品の発売予定日は2026年8月10日です。</span></div>`;
    expect(parseAmazonReleaseDate(html)).toBe("2026-08-10");
  });

  it("등록정보 표의 発売日(슬래시 표기, 제어문자 포함)를 읽는다", () => {
    const html =
      `<li><span class="a-text-bold">発売日‏ : ‎</span>` +
      `<span>2026/8/10</span></li>`;
    expect(parseAmazonReleaseDate(html)).toBe("2026-08-10");
  });

  it("발매일이 연·월까지만 있으면 YYYY-MM 으로 돌려준다", () => {
    const html = `<tr><th>発売予定日</th><td>2026年12月</td></tr>`;
    expect(parseAmazonReleaseDate(html)).toBe("2026-12");
  });

  it("発売予定日이 発売日보다 우선한다", () => {
    const html =
      `<span>発売日 : 2024/1/5</span>` + `<span>この商品の発売予定日は2026年3月1日です。</span>`;
    expect(parseAmazonReleaseDate(html)).toBe("2026-03-01");
  });

  it("키워드가 있어도 근처에 날짜가 없으면 다음 등장 위치를 계속 찾는다", () => {
    const html =
      `<span>発売日のお知らせはこちら</span><p>${"안내 ".repeat(40)}</p>` +
      `<span>発売日 : 2026年5月20日</span>`;
    expect(parseAmazonReleaseDate(html)).toBe("2026-05-20");
  });

  it("영어 UI 예약 배너(released on)에서 날짜를 읽고, 배송 예정일과 혼동하지 않는다", () => {
    const html =
      `<div><span>KRW 27,692 delivery February 16 - 22, 2027. Order within 11 hrs.</span>` +
      `<span>This item will be released on January 31, 2027.</span>` +
      `<span>Click here for details of availability.</span></div>`;
    expect(parseAmazonReleaseDate(html)).toBe("2027-01-31");
  });

  it("영어 UI 등록정보 표의 Release date 를 읽는다", () => {
    const html = `<li><span class="a-text-bold">Release date‏ : ‎</span><span>January 31, 2027</span></li>`;
    expect(parseAmazonReleaseDate(html)).toBe("2027-01-31");
  });

  it("영어 표기가 연·월까지만 있으면 YYYY-MM 으로 돌려준다", () => {
    const html = `<span>will be released on March 2027.</span>`;
    expect(parseAmazonReleaseDate(html)).toBe("2027-03");
  });

  it("날짜 정보가 전혀 없으면 null", () => {
    expect(parseAmazonReleaseDate(`<div>通常のページ</div>`)).toBeNull();
  });

  it("script 안의 날짜는 무시한다", () => {
    const html = `<script>var releaseNote = "発売日 2020/1/1";</script><div>本文</div>`;
    expect(parseAmazonReleaseDate(html)).toBeNull();
  });

  it("이미 발매되어 예약 배너가 없는 상품은, 아래쪽 캐러셀에 있는 '다른 상품'의 예약 배너를 발매일로 읽지 않는다", () => {
    const html =
      `<div id="ppd"><span>Only 1 left in stock - order soon.</span>` +
      `<span>Add to cart</span><span>Buy Now</span></div>` +
      `<div id="similarities"><h2>Customers also viewed these products</h2>` +
      `<span>Gift+ Series "Crash: Honkai Star Rail," 1/8 Scale</span>` +
      `<span>This item will be released on September 30, 2026.</span></div>` +
      `<div id="detailBullets"><span>ASIN</span><span>B0F82SSLJ6</span></div>`;
    expect(parseAmazonReleaseDate(html)).toBeNull();
  });

  it("우리 상품 자체의 예약 배너는 캐러셀 마커보다 앞에 있으면 그대로 읽는다", () => {
    const html =
      `<div id="ppd"><span>This item will be released on January 31, 2027.</span></div>` +
      `<div id="similarities"><h2>Customers also viewed these products</h2>` +
      `<span>This item will be released on September 30, 2026.</span></div>`;
    expect(parseAmazonReleaseDate(html)).toBe("2027-01-31");
  });

  it("#ppd 바깥의 캐러셀은 '다른 상품' 마커 문구가 없어도 애초에 검색 대상에서 제외된다", () => {
    const html =
      `<div id="ppd"><div id="centerCol"><span>Only 1 left in stock - order soon.</span></div></div>` +
      `<div id="similarities_feature_div"><span>This item will be released on September 30, 2026.</span></div>`;
    expect(parseAmazonReleaseDate(html)).toBeNull();
  });

  it("#ppd 안의 발매일은 안쪽에 다른 div 들이 중첩돼 있어도 정상적으로 읽는다", () => {
    const html =
      `<div id="ppd"><div id="rightCol"><div id="buybox"><span>` +
      `This item will be released on January 31, 2027.` +
      `</span></div></div></div>` +
      `<div id="similarities_feature_div"><span>This item will be released on September 30, 2026.</span></div>`;
    expect(parseAmazonReleaseDate(html)).toBe("2027-01-31");
  });
});

describe("isAmazonJapanUrl", () => {
  it("amazon.co.jp 및 서브도메인만 허용한다", () => {
    expect(isAmazonJapanUrl("https://www.amazon.co.jp/dp/B0ABCDEF")).toBe(true);
    expect(isAmazonJapanUrl("https://amazon.co.jp/dp/B0ABCDEF")).toBe(true);
    expect(isAmazonJapanUrl("https://www.amazon.com/dp/B0ABCDEF")).toBe(false);
    expect(isAmazonJapanUrl("https://evil.example/amazon.co.jp")).toBe(false);
    expect(isAmazonJapanUrl("not-a-url")).toBe(false);
  });
});
