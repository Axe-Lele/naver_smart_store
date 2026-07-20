// File: packages/application/src/ports/amazon-product-lookup.port.ts
import type {
  AmazonProductLookupResult,
  LookupAmazonProductsInput,
} from '../use-cases/lookup-amazon-products.use-case.js';

export interface AmazonProductLookupPort {
  lookup(input: LookupAmazonProductsInput): Promise<AmazonProductLookupResult>;
}
