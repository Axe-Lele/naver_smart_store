// File: apps/desktop-electron/src/main/amazon-paapi-product-lookup.ts
import { createHash, createHmac } from 'node:crypto';

import type {
  AmazonProductLookupItem,
  AmazonProductLookupPort,
  AmazonProductLookupResult,
  LookupAmazonProductsInput,
} from '@smart-store/application';

const DEFAULT_HOST = 'webservices.amazon.co.jp';
const DEFAULT_MARKETPLACE = 'www.amazon.co.jp';
const DEFAULT_REGION = 'us-west-2';
const DEFAULT_TIMEOUT_MS = 30_000;
const SERVICE = 'ProductAdvertisingAPI';
const TARGET = 'com.amazon.paapi5.v1.ProductAdvertisingAPIv1.GetItems';
const API_PATH = '/paapi5/getitems';

const ITEM_RESOURCES = [
  'Images.Primary.Large',
  'Images.Variants.Large',
  'ItemInfo.ByLineInfo',
  'ItemInfo.Classifications',
  'ItemInfo.ExternalIds',
  'ItemInfo.Features',
  'ItemInfo.ManufactureInfo',
  'ItemInfo.ProductInfo',
  'ItemInfo.Title',
  'OffersV2.Listings.Availability',
  'OffersV2.Listings.Condition',
  'OffersV2.Listings.MerchantInfo',
  'OffersV2.Listings.Price',
  'ParentASIN',
] as const;

type AmazonPaApiProductLookupOptions = {
  accessKey?: string;
  secretKey?: string;
  partnerTag?: string;
  host?: string;
  marketplace?: string;
  region?: string;
  timeoutMs?: number;
};

export class AmazonPaApiProductLookup implements AmazonProductLookupPort {
  private readonly accessKey?: string;

  private readonly secretKey?: string;

  private readonly partnerTag?: string;

  private readonly host: string;

  private readonly marketplace: string;

  private readonly region: string;

  private readonly timeoutMs: number;

  constructor(options: AmazonPaApiProductLookupOptions = {}) {
    this.accessKey = options.accessKey?.trim();
    this.secretKey = options.secretKey?.trim();
    this.partnerTag = options.partnerTag?.trim();
    this.host = options.host?.trim() || DEFAULT_HOST;
    this.marketplace = options.marketplace?.trim() || DEFAULT_MARKETPLACE;
    this.region = options.region?.trim() || DEFAULT_REGION;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async lookup(input: LookupAmazonProductsInput): Promise<AmazonProductLookupResult> {
    const queries = input.queries.map((query, index) => ({
      id: `amazon-${index + 1}`,
      source: query.source,
      asin: extractAmazonAsin(query.source),
    }));
    const missingItems = queries
      .filter((query) => !query.asin)
      .map((query): AmazonProductLookupItem => createMissingAsinItem(query.id, query.source));
    const asinQueries = queries.filter(
      (query): query is { id: string; source: string; asin: string } => Boolean(query.asin),
    );

    if (asinQueries.length === 0) {
      return { items: missingItems };
    }

    this.assertConfigured();

    const responseItems = await this.fetchItems([...new Set(asinQueries.map((query) => query.asin))]);
    const itemByAsin = new Map(
      responseItems.map((item) => [readString((item as Record<string, unknown>).ASIN), item]),
    );

    return {
      items: [
        ...missingItems,
        ...asinQueries.map((query) => {
          const rawItem = itemByAsin.get(query.asin);
          if (!rawItem) {
            return createNotFoundItem(query.id, query.source, query.asin);
          }

          return mapAmazonItem(query.id, query.source, query.asin, rawItem);
        }),
      ],
    };
  }

  private assertConfigured(): void {
    if (!this.accessKey || !this.secretKey || !this.partnerTag) {
      throw new AmazonProductLookupConfigurationError(
        'Amazon PA-API 환경변수를 설정한 뒤 앱을 다시 시작해 주세요.',
      );
    }
  }

  private async fetchItems(asins: readonly string[]): Promise<unknown[]> {
    const payload = JSON.stringify({
      ItemIds: asins,
      ItemIdType: 'ASIN',
      LanguagesOfPreference: ['ja_JP'],
      Marketplace: this.marketplace,
      PartnerTag: this.partnerTag,
      PartnerType: 'Associates',
      Resources: ITEM_RESOURCES,
    });
    const headers = this.signRequest(payload);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`https://${this.host}${API_PATH}`, {
        method: 'POST',
        headers,
        signal: controller.signal,
        body: payload,
      });
      const body = await readJsonBody(response);

      if (!response.ok) {
        throw new AmazonProductLookupApiError(readAmazonErrorMessage(body, response.status));
      }

      const itemsResult = readRecord(readRecord(body).ItemsResult);
      const items = itemsResult && Array.isArray(itemsResult.Items) ? itemsResult.Items : [];
      return items;
    } catch (error) {
      if (error instanceof AmazonProductLookupError) {
        throw error;
      }

      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new AmazonProductLookupApiError('Amazon 상품 조회 요청 시간이 초과되었습니다.');
      }

      throw new AmazonProductLookupApiError(
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private signRequest(payload: string): Record<string, string> {
    const now = new Date();
    const amzDate = formatAmzDate(now);
    const dateStamp = amzDate.slice(0, 8);
    const headers = {
      'content-encoding': 'amz-1.0',
      'content-type': 'application/json; charset=utf-8',
      host: this.host,
      'x-amz-date': amzDate,
      'x-amz-target': TARGET,
    };
    const signedHeaders = Object.keys(headers).sort().join(';');
    const canonicalHeaders = Object.entries(headers)
      .sort(([first], [second]) => first.localeCompare(second))
      .map(([key, value]) => `${key}:${value}\n`)
      .join('');
    const canonicalRequest = [
      'POST',
      API_PATH,
      '',
      canonicalHeaders,
      signedHeaders,
      sha256(payload),
    ].join('\n');
    const credentialScope = `${dateStamp}/${this.region}/${SERVICE}/aws4_request`;
    const stringToSign = [
      'AWS4-HMAC-SHA256',
      amzDate,
      credentialScope,
      sha256(canonicalRequest),
    ].join('\n');
    const signingKey = getSignatureKey(this.secretKey ?? '', dateStamp, this.region, SERVICE);
    const signature = hmacHex(signingKey, stringToSign);

    return {
      ...headers,
      Authorization: [
        `AWS4-HMAC-SHA256 Credential=${this.accessKey}/${credentialScope}`,
        `SignedHeaders=${signedHeaders}`,
        `Signature=${signature}`,
      ].join(', '),
    };
  }
}

class AmazonProductLookupError extends Error {
  readonly code: string;

  readonly recoveryCommand?: string;

  constructor(code: string, message: string, recoveryCommand?: string) {
    super(message);
    this.name = code;
    this.code = code;
    this.recoveryCommand = recoveryCommand;
  }
}

class AmazonProductLookupConfigurationError extends AmazonProductLookupError {
  constructor(message: string) {
    super(
      'AMAZON_PRODUCT_LOOKUP_NOT_CONFIGURED',
      message,
      [
        'AMAZON_PA_API_ACCESS_KEY',
        'AMAZON_PA_API_SECRET_KEY',
        'AMAZON_PA_API_PARTNER_TAG',
        '환경변수를 설정한 뒤 앱을 다시 시작하세요.',
      ].join(', '),
    );
  }
}

class AmazonProductLookupApiError extends AmazonProductLookupError {
  constructor(message: string) {
    super('AMAZON_PRODUCT_LOOKUP_FAILED', message);
  }
}

function extractAmazonAsin(source: string): string | undefined {
  const decoded = safeDecode(source).trim();
  const direct = decoded.match(/^[A-Z0-9]{10}$/i)?.[0];
  if (direct) {
    return direct.toUpperCase();
  }

  const patterns = [
    /\/(?:dp|gp\/product|product)\/([A-Z0-9]{10})(?:[/?#]|$)/i,
    /[?&](?:asin|ASIN)=([A-Z0-9]{10})(?:&|$)/,
  ];

  for (const pattern of patterns) {
    const matched = decoded.match(pattern);
    if (matched?.[1]) {
      return matched[1].toUpperCase();
    }
  }

  return undefined;
}

function mapAmazonItem(
  id: string,
  source: string,
  asin: string,
  rawItem: unknown,
): AmazonProductLookupItem {
  const item = readRecord(rawItem);
  const itemInfo = readRecord(item.ItemInfo);
  const byLineInfo = readRecord(itemInfo.ByLineInfo);
  const manufactureInfo = readRecord(itemInfo.ManufactureInfo);
  const productInfo = readRecord(itemInfo.ProductInfo);
  const classifications = readRecord(itemInfo.Classifications);
  const externalIds = readRecord(itemInfo.ExternalIds);
  const offersV2 = readRecord(item.OffersV2);
  const listing = readFirstRecord(readRecord(offersV2).Listings);
  const availability = readRecord(listing.Availability);
  const price = readRecord(listing.Price);
  const images = readRecord(item.Images);
  const primaryImage = readRecord(readRecord(images.Primary).Large);
  const title = readDisplayValue(readRecord(itemInfo.Title));
  const releaseDate = normalizeDate(readDisplayValue(readRecord(productInfo.ReleaseDate)));
  const releaseMonth = releaseDate?.slice(0, 7);
  const availabilityMessage = firstNonEmptyString(
    readDisplayValue(availability),
    readDisplayValue(readRecord(availability.Message)),
    readString(availability.Message),
  );
  const preorder = classifyPreorder({
    releaseDate,
    availabilityMessage,
  });

  return {
    id,
    source,
    status: title ? 'READY' : 'FAILED',
    asin,
    detailPageUrl: readString(item.DetailPageURL),
    title,
    brand: readDisplayValue(readRecord(byLineInfo.Brand)),
    manufacturer: readDisplayValue(readRecord(byLineInfo.Manufacturer)),
    model: readDisplayValue(readRecord(manufactureInfo.Model)),
    partNumber: readDisplayValue(readRecord(manufactureInfo.ItemPartNumber)),
    category: firstNonEmptyString(
      readDisplayValue(readRecord(classifications.ProductGroup)),
      readDisplayValue(readRecord(classifications.Binding)),
    ),
    releaseDate,
    releaseMonth,
    preorderStatus: preorder.preorderStatus,
    shippingStartDate: preorder.shippingStartDate,
    shippingStartConfidence: preorder.shippingStartConfidence,
    availabilityMessage,
    priceDisplay: firstNonEmptyString(
      readString(price.DisplayAmount),
      readString(readRecord(price.Money).DisplayAmount),
    ),
    imageUrl: readString(primaryImage.URL),
    features: readStringArray(readRecord(itemInfo.Features).DisplayValues),
    externalIds: {
      eans: readStringArray(readRecord(externalIds.EANs).DisplayValues),
      upcs: readStringArray(readRecord(externalIds.UPCs).DisplayValues),
      isbns: readStringArray(readRecord(externalIds.ISBNs).DisplayValues),
    },
    evidence: buildEvidence({
      title,
      brand: readDisplayValue(readRecord(byLineInfo.Brand)),
      manufacturer: readDisplayValue(readRecord(byLineInfo.Manufacturer)),
      releaseDate,
      availabilityMessage,
    }),
    warning: title ? undefined : 'Amazon 응답에 상품명이 없습니다.',
  };
}

function classifyPreorder(input: {
  releaseDate?: string;
  availabilityMessage?: string;
}): Pick<
  AmazonProductLookupItem,
  'preorderStatus' | 'shippingStartDate' | 'shippingStartConfidence'
> {
  const releaseTime = input.releaseDate ? Date.parse(`${input.releaseDate}T00:00:00Z`) : NaN;
  const hasFutureRelease = Number.isFinite(releaseTime) && releaseTime > Date.now();
  const availability = input.availabilityMessage?.toLocaleLowerCase('ja-JP') ?? '';
  const hasPreorderMessage = /予約|発売予定|pre-?order|pre order/.test(availability);

  if (hasFutureRelease && hasPreorderMessage) {
    return {
      preorderStatus: 'PREORDER_LIKELY',
      shippingStartDate: input.releaseDate,
      shippingStartConfidence: 'HIGH',
    };
  }

  if (hasFutureRelease) {
    return {
      preorderStatus: 'PREORDER_LIKELY',
      shippingStartDate: input.releaseDate,
      shippingStartConfidence: 'MEDIUM',
    };
  }

  if (hasPreorderMessage) {
    return {
      preorderStatus: 'PREORDER_LIKELY',
      shippingStartConfidence: 'LOW',
    };
  }

  if (availability) {
    return {
      preorderStatus: 'RELEASED_OR_AVAILABLE',
      shippingStartConfidence: 'LOW',
    };
  }

  return {
    preorderStatus: 'UNKNOWN',
    shippingStartConfidence: 'UNKNOWN',
  };
}

function buildEvidence(input: {
  title?: string;
  brand?: string;
  manufacturer?: string;
  releaseDate?: string;
  availabilityMessage?: string;
}): string[] {
  return [
    input.title ? 'ItemInfo.Title' : '',
    input.brand ? 'ItemInfo.ByLineInfo.Brand' : '',
    input.manufacturer ? 'ItemInfo.ByLineInfo.Manufacturer' : '',
    input.releaseDate ? 'ItemInfo.ProductInfo.ReleaseDate' : '',
    input.availabilityMessage ? 'OffersV2.Listings.Availability' : '',
  ].filter(Boolean);
}

function createMissingAsinItem(id: string, source: string): AmazonProductLookupItem {
  return {
    id,
    source,
    status: 'MISSING_ASIN',
    preorderStatus: 'UNKNOWN',
    shippingStartConfidence: 'UNKNOWN',
    features: [],
    externalIds: {
      eans: [],
      upcs: [],
      isbns: [],
    },
    evidence: [],
    warning: 'Amazon URL 또는 ASIN에서 ASIN을 찾지 못했습니다.',
  };
}

function createNotFoundItem(
  id: string,
  source: string,
  asin: string,
): AmazonProductLookupItem {
  return {
    id,
    source,
    status: 'NOT_FOUND',
    asin,
    preorderStatus: 'UNKNOWN',
    shippingStartConfidence: 'UNKNOWN',
    features: [],
    externalIds: {
      eans: [],
      upcs: [],
      isbns: [],
    },
    evidence: [],
    warning: 'Amazon API 응답에서 해당 ASIN 상품을 찾지 못했습니다.',
  };
}

async function readJsonBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { raw: text };
  }
}

function readAmazonErrorMessage(body: unknown, status: number): string {
  const errors = readRecord(body).Errors;
  if (Array.isArray(errors)) {
    const messages = errors
      .map((error) => readString(readRecord(error).Message))
      .filter((message): message is string => Boolean(message));
    if (messages.length > 0) {
      return messages.join('\n');
    }
  }

  return `Amazon 상품 조회 요청에 실패했습니다. HTTP ${status}`;
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function normalizeDate(value?: string): string | undefined {
  if (!value) {
    return undefined;
  }

  const date = new Date(value);
  if (!Number.isNaN(date.getTime())) {
    return date.toISOString().slice(0, 10);
  }

  const matched = value.match(/(\d{4})[./-](\d{1,2})[./-](\d{1,2})/);
  if (!matched) {
    return undefined;
  }

  return [
    matched[1],
    matched[2].padStart(2, '0'),
    matched[3].padStart(2, '0'),
  ].join('-');
}

function readRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

function readFirstRecord(value: unknown): Record<string, unknown> {
  return Array.isArray(value) ? readRecord(value[0]) : {};
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function firstNonEmptyString(...values: Array<string | undefined>): string | undefined {
  return values.find((value) => value && value.trim().length > 0);
}

function readDisplayValue(value: Record<string, unknown>): string | undefined {
  const displayValue = readString(value.DisplayValue);
  if (displayValue) {
    return displayValue;
  }

  return readString(value.Value);
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value
        .map((item) => readString(item))
        .filter((item): item is string => Boolean(item))
    : [];
}

function formatAmzDate(date: Date): string {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, '');
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function hmac(key: Buffer | string, value: string): Buffer {
  return createHmac('sha256', key).update(value, 'utf8').digest();
}

function hmacHex(key: Buffer, value: string): string {
  return createHmac('sha256', key).update(value, 'utf8').digest('hex');
}

function getSignatureKey(
  secretKey: string,
  dateStamp: string,
  regionName: string,
  serviceName: string,
): Buffer {
  const dateKey = hmac(`AWS4${secretKey}`, dateStamp);
  const regionKey = hmac(dateKey, regionName);
  const serviceKey = hmac(regionKey, serviceName);
  return hmac(serviceKey, 'aws4_request');
}
