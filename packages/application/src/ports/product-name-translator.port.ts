// File: packages/application/src/ports/product-name-translator.port.ts
import type {
  GenerateProductNameTranslationsInput,
  ProductNameTranslationBatchResult,
} from '../use-cases/generate-product-name-translations.use-case.js';

export interface ProductNameTranslatorPort {
  generate(
    input: GenerateProductNameTranslationsInput,
  ): Promise<ProductNameTranslationBatchResult>;
}
