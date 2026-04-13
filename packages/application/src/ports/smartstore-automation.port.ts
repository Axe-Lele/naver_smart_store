// File: packages/application/src/ports/smartstore-automation.port.ts
import type {
  BatchJobItemResult,
  ChangePlan,
  ChangePlanItem,
  ExecutionCheckpoint,
  LoginSession,
  Product,
  ProductStatus,
} from '@smart-store/core';

import type { AppSettings } from '../settings/app-settings.js';

export interface ProductQuery {
  searchText?: string;
  productIds?: readonly string[];
  statuses?: readonly ProductStatus[];
  limit?: number;
}

export interface LoadProductsRequest {
  settings: AppSettings;
  session: LoginSession;
  query?: ProductQuery;
}

export interface ExecuteBatchItemRequest {
  settings: AppSettings;
  session: LoginSession;
  plan: ChangePlan;
  item: ChangePlanItem;
  checkpoint: ExecutionCheckpoint;
  attemptNumber: number;
}

export interface SmartStoreAutomationPort {
  loadProducts(request: LoadProductsRequest): Promise<readonly Product[]>;
  executeChange(request: ExecuteBatchItemRequest): Promise<BatchJobItemResult>;
}
