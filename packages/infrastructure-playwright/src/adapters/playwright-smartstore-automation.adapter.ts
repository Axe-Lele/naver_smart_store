// File: packages/infrastructure-playwright/src/adapters/playwright-smartstore-automation.adapter.ts
import {
  BatchJobItemResult,
  Product,
  shouldAttemptConversion,
  type FailureCategory,
  type ProductStatus,
  type VerificationMethod,
} from '@smart-store/core';
import {
  BatchExecutionAbortError,
  type ExecuteBatchItemRequest,
  type LoadProductsRequest,
  type SmartStoreAutomationPort,
} from '@smart-store/application';

import { SelectorProfileRegistry } from '../config/selector-profile.registry.js';
import {
  type SessionRecoveryRequiredError,
} from '../errors/playwright-infrastructure.error.js';
import { FileFailureArtifactStore } from '../persistence/file-failure-artifact.store.js';
import { PlaywrightBrowserSessionAdapter, type ManagedBrowserSession } from '../session/playwright-browser-session.adapter.js';
import { SessionHealthMonitor } from '../session/session-health-monitor.js';
import { SmartStoreProductEditAdapter } from './smartstore-product-edit.adapter.js';
import { SmartStoreProductListAdapter } from './smartstore-product-list.adapter.js';

interface RuntimeContext {
  browserSession: ManagedBrowserSession;
  listAdapter: SmartStoreProductListAdapter;
  editAdapter: SmartStoreProductEditAdapter;
}

export class PlaywrightSmartStoreAutomationAdapter
  implements SmartStoreAutomationPort
{
  constructor(
    private readonly browserSessionAdapter = new PlaywrightBrowserSessionAdapter(),
    private readonly selectorProfiles = new SelectorProfileRegistry(),
    private readonly failureArtifactStore = new FileFailureArtifactStore(),
  ) {}

  async loadProducts(request: LoadProductsRequest): Promise<readonly Product[]> {
    const runtime = await this.createRuntime(request.settings);

    try {
      if (request.query?.productIds?.length) {
        const limit = request.query.limit ?? request.query.productIds.length;
        return this.loadProductsById(runtime, request, limit);
      }

      return runtime.listAdapter.loadVisibleProducts(
        request.settings.productsUrl,
        request.settings.storageStatePath,
        request.query,
      );
    } finally {
      await runtime.browserSession.close();
    }
  }

  async executeChange(request: ExecuteBatchItemRequest): Promise<BatchJobItemResult> {
    const startedAt = new Date().toISOString();
    const startedAtMs = Date.now();
    let runtime: RuntimeContext | null = null;

    try {
      runtime = await this.createRuntime(request.settings);

      const searchOutcome = await runtime.listAdapter.searchAndOpenEdit(
        request.settings.productsUrl,
        request.settings.storageStatePath,
        request.item.productId.toString(),
      );

      if (searchOutcome.state === 'NOT_FOUND') {
        return this.buildItemResult({
          productId: request.item.productId.toString(),
          status: 'NOT_FOUND',
          actionResult: 'SKIPPED',
          verificationMethod: 'NOT_ATTEMPTED',
          reason: searchOutcome.reason,
          failureCategory: 'BUSINESS',
          startedAt,
          durationMs: Date.now() - startedAtMs,
          attemptNumber: request.attemptNumber,
        });
      }

      if (searchOutcome.state === 'UI_CHANGED') {
        return this.buildFailureResult({
          runtime,
          request,
          startedAt,
          startedAtMs,
          status: 'UI_CHANGED',
          reason: searchOutcome.reason,
          failureCategory: 'OPERATIONAL',
          failureLabel: 'list-search',
        });
      }

      const classifiedProduct = await runtime.editAdapter.classifyCurrentProduct(
        request.item.productId.toString(),
        request.settings.storageStatePath,
      );

      if (classifiedProduct.status === 'NOT_PREORDER') {
        return this.buildItemResult({
          productId: request.item.productId.toString(),
          status: classifiedProduct.status,
          actionResult: 'SKIPPED',
          verificationMethod: 'NOT_ATTEMPTED',
          reason: classifiedProduct.reason ?? 'The product is already a normal product.',
          failureCategory: 'BUSINESS',
          startedAt,
          durationMs: Date.now() - startedAtMs,
          attemptNumber: request.attemptNumber,
        });
      }

      if (classifiedProduct.status === 'LOCKED_BY_ORDER_PERIOD') {
        return this.buildItemResult({
          productId: request.item.productId.toString(),
          status: classifiedProduct.status,
          actionResult: 'SKIPPED',
          verificationMethod: 'NOT_ATTEMPTED',
          reason:
            classifiedProduct.reason ??
            'Preorder conversion is blocked by order-period or policy constraints.',
          failureCategory: 'BUSINESS',
          startedAt,
          durationMs: Date.now() - startedAtMs,
          attemptNumber: request.attemptNumber,
        });
      }

      if (!shouldAttemptConversion(classifiedProduct.status)) {
        return this.buildFailureResult({
          runtime,
          request,
          startedAt,
          startedAtMs,
          status: classifiedProduct.status,
          reason:
            classifiedProduct.reason ??
            'Product classification was inconclusive on the edit page.',
          failureCategory: mapFailureCategory(classifiedProduct.status),
          failureLabel: 'classification',
        });
      }

      if (request.plan.dryRun) {
        return this.buildItemResult({
          productId: request.item.productId.toString(),
          status: classifiedProduct.status,
          actionResult: 'DRY_RUN',
          verificationMethod: 'DRY_RUN',
          reason:
            classifiedProduct.reason ??
            'Dry-run confirmed that the preorder product is editable.',
          startedAt,
          durationMs: Date.now() - startedAtMs,
          attemptNumber: request.attemptNumber,
        });
      }

      try {
        await runtime.editAdapter.convertToNormalProduct();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        if (/disabled|order-period|order period|blocked/i.test(message)) {
          return this.buildItemResult({
            productId: request.item.productId.toString(),
            status: 'LOCKED_BY_ORDER_PERIOD',
            actionResult: 'SKIPPED',
            verificationMethod: 'NOT_ATTEMPTED',
            reason: message,
            failureCategory: 'BUSINESS',
            startedAt,
            durationMs: Date.now() - startedAtMs,
            attemptNumber: request.attemptNumber,
          });
        }

        return this.buildFailureResult({
          runtime,
          request,
          startedAt,
          startedAtMs,
          status: 'UI_CHANGED',
          reason: message,
          failureCategory: 'OPERATIONAL',
          errorMessage: message,
          failureLabel: 'convert',
        });
      }

      const uiSignal = await runtime.editAdapter.readSaveUiSignal();
      const verification = await this.verifyConversion(runtime, request, uiSignal);

      if (!verification.verified) {
        return this.buildFailureResult({
          runtime,
          request,
          startedAt,
          startedAtMs,
          status: 'UNKNOWN_ERROR',
          reason: verification.reason,
          failureCategory: 'OPERATIONAL',
          failureLabel: 'verification',
        });
      }

      return this.buildItemResult({
        productId: request.item.productId.toString(),
        status: 'EDITABLE_PREORDER',
        actionResult: 'CONVERTED',
        verificationMethod: verification.verificationMethod,
        reason: verification.reason,
        startedAt,
        durationMs: Date.now() - startedAtMs,
        attemptNumber: request.attemptNumber,
      });
    } catch (error) {
      if (this.isSessionRecoveryError(error)) {
        const artifact = runtime
          ? await this.failureArtifactStore.capturePage(runtime.browserSession.page, {
              settings: request.settings,
              jobId: request.plan.jobId.toString(),
              productId: request.item.productId.toString(),
              status: 'UNKNOWN_ERROR',
              failureLabel: 'session-expired',
            })
          : undefined;
        const failureCategory: FailureCategory =
          error.reason === 'ACCESS_DENIED' ? 'ACCESS' : 'SESSION';
        const itemResult = this.buildItemResult({
          productId: request.item.productId.toString(),
          status: 'UNKNOWN_ERROR',
          actionResult: 'FAILED',
          verificationMethod: 'NOT_ATTEMPTED',
          reason: 'Login session expired or requires recovery before continuing.',
          failureCategory,
          errorMessage: error.message,
          artifact,
          startedAt,
          durationMs: Date.now() - startedAtMs,
          attemptNumber: request.attemptNumber,
        });

        throw new BatchExecutionAbortError(itemResult, error.message, error);
      }

      const message = error instanceof Error ? error.message : String(error);
      if (!runtime) {
        return this.buildItemResult({
          productId: request.item.productId.toString(),
          status: 'UNKNOWN_ERROR',
          actionResult: 'FAILED',
          verificationMethod: 'NOT_ATTEMPTED',
          reason: 'Failed to initialize the Playwright automation runtime.',
          failureCategory: 'OPERATIONAL',
          errorMessage: message,
          startedAt,
          durationMs: Date.now() - startedAtMs,
          attemptNumber: request.attemptNumber,
        });
      }

      return this.buildFailureResult({
        runtime,
        request,
        startedAt,
        startedAtMs,
        status: 'UNKNOWN_ERROR',
        reason: 'Unhandled exception during Smart Store automation execution.',
        failureCategory: 'OPERATIONAL',
        errorMessage: message,
        failureLabel: 'unhandled',
      });
    } finally {
      if (runtime) {
        await runtime.browserSession.close();
      }
    }
  }

  private async loadProductsById(
    runtime: RuntimeContext,
    request: LoadProductsRequest,
    limit: number,
  ): Promise<readonly Product[]> {
    const productIds = request.query?.productIds?.slice(0, limit) ?? [];
    const products: Product[] = [];

    for (const productId of productIds) {
      const searchOutcome = await runtime.listAdapter.searchAndOpenEdit(
        request.settings.productsUrl,
        request.settings.storageStatePath,
        productId,
      );

      if (searchOutcome.state === 'NOT_FOUND') {
        products.push(
          this.createProduct(productId, 'NOT_FOUND', searchOutcome.reason),
        );
        continue;
      }

      if (searchOutcome.state === 'UI_CHANGED') {
        products.push(
          this.createProduct(productId, 'UI_CHANGED', searchOutcome.reason),
        );
        continue;
      }

      const classifiedProduct = await runtime.editAdapter.classifyCurrentProduct(
        productId,
        request.settings.storageStatePath,
      );
      products.push(classifiedProduct);
    }

    if (request.query?.statuses?.length) {
      const allowed = new Set(request.query.statuses);
      return products.filter((product) => allowed.has(product.status));
    }

    return products;
  }

  private async verifyConversion(
    runtime: RuntimeContext,
    request: ExecuteBatchItemRequest,
    uiSignal: 'TOAST' | 'BANNER' | null,
  ): Promise<{
    verified: boolean;
    verificationMethod: VerificationMethod;
    reason: string;
  }> {
    const searchOutcome = await runtime.listAdapter.searchAndOpenEdit(
      request.settings.productsUrl,
      request.settings.storageStatePath,
      request.item.productId.toString(),
    );

    if (searchOutcome.state !== 'FOUND') {
      return {
        verified: false,
        verificationMethod: verificationFromUiSignal(uiSignal),
        reason: `Save was attempted, but re-query failed: ${searchOutcome.reason}`,
      };
    }

    const product = await runtime.editAdapter.classifyCurrentProduct(
      request.item.productId.toString(),
      request.settings.storageStatePath,
    );

    if (product.status === 'NOT_PREORDER') {
      return {
        verified: true,
        verificationMethod: verificationWithRequery(uiSignal),
        reason:
          uiSignal === null
            ? 'Re-query confirmed the product is now a normal product.'
            : `Save ${uiSignal.toLowerCase()} was visible and re-query confirmed the product is now normal.`,
      };
    }

    return {
      verified: false,
      verificationMethod: verificationFromUiSignal(uiSignal),
      reason:
        product.reason ??
        `Re-query after save still classified the product as ${product.status}.`,
    };
  }

  private async buildFailureResult(input: {
    runtime: RuntimeContext;
    request: ExecuteBatchItemRequest;
    startedAt: string;
    startedAtMs: number;
    status: ProductStatus;
    reason: string;
    failureCategory: FailureCategory;
    errorMessage?: string;
    failureLabel?: string;
  }): Promise<BatchJobItemResult> {
    const artifact = await this.failureArtifactStore.capturePage(
      input.runtime.browserSession.page,
      {
        settings: input.request.settings,
        jobId: input.request.plan.jobId.toString(),
        productId: input.request.item.productId.toString(),
        status: input.status,
        failureLabel: input.failureLabel,
      },
    );

    return this.buildItemResult({
      productId: input.request.item.productId.toString(),
      status: input.status,
      actionResult: 'FAILED',
      verificationMethod: 'NOT_ATTEMPTED',
      reason: input.reason,
      failureCategory: input.failureCategory,
      errorMessage: input.errorMessage,
      artifact,
      startedAt: input.startedAt,
      durationMs: Date.now() - input.startedAtMs,
      attemptNumber: input.request.attemptNumber,
    });
  }

  private buildItemResult(input: {
    productId: string;
    status: ProductStatus;
    actionResult: 'SKIPPED' | 'FAILED' | 'DRY_RUN' | 'CONVERTED';
    verificationMethod: VerificationMethod;
    reason: string;
    failureCategory?: FailureCategory;
    errorMessage?: string;
    artifact?: { toSnapshot(): { screenshotPath?: string; htmlPath?: string; capturedAt?: string } } | undefined;
    startedAt: string;
    durationMs: number;
    attemptNumber: number;
  }): BatchJobItemResult {
    return BatchJobItemResult.create({
      productId: input.productId,
      status: input.status,
      actionResult: input.actionResult,
      verificationMethod: input.verificationMethod,
      reason: input.reason,
      failureCategory: input.failureCategory,
      errorMessage: input.errorMessage,
      artifact: input.artifact?.toSnapshot(),
      startedAt: input.startedAt,
      finishedAt: new Date().toISOString(),
      durationMs: input.durationMs,
      attemptNumber: input.attemptNumber,
    });
  }

  private createProduct(
    productId: string,
    status: ProductStatus,
    reason: string,
  ): Product {
    return Product.create({
      id: productId,
      status,
      saleType:
        status === 'EDITABLE_PREORDER' || status === 'LOCKED_BY_ORDER_PERIOD'
          ? 'PREORDER'
          : status === 'NOT_PREORDER'
            ? 'NORMAL'
            : 'UNKNOWN',
      reason,
    });
  }

  private async createRuntime(settings: LoadProductsRequest['settings']): Promise<RuntimeContext> {
    const selectorProfile = await this.selectorProfiles.getResolved({
      profileId: settings.selectorProfileId,
      selectorConfigPath: settings.selectorConfigPath,
    });
    const browserSession = await this.browserSessionAdapter.openForAutomation(settings);
    const sessionMonitor = new SessionHealthMonitor(selectorProfile);

    return {
      browserSession,
      listAdapter: new SmartStoreProductListAdapter(
        browserSession.page,
        selectorProfile,
        sessionMonitor,
      ),
      editAdapter: new SmartStoreProductEditAdapter(
        browserSession.page,
        selectorProfile,
        sessionMonitor,
      ),
    };
  }

  private isSessionRecoveryError(
    error: unknown,
  ): error is SessionRecoveryRequiredError {
    return (
      error instanceof Error &&
      error.name === 'SessionRecoveryRequiredError' &&
      'reason' in error &&
      'session' in error
    );
  }
}

function mapFailureCategory(status: ProductStatus): FailureCategory {
  if (status === 'UI_CHANGED' || status === 'UNKNOWN_ERROR') {
    return 'OPERATIONAL';
  }

  return 'BUSINESS';
}

function verificationFromUiSignal(signal: 'TOAST' | 'BANNER' | null): VerificationMethod {
  if (signal === 'TOAST') {
    return 'TOAST';
  }

  if (signal === 'BANNER') {
    return 'BANNER';
  }

  return 'NOT_ATTEMPTED';
}

function verificationWithRequery(signal: 'TOAST' | 'BANNER' | null): VerificationMethod {
  if (signal === 'TOAST') {
    return 'TOAST_AND_REQUERY';
  }

  if (signal === 'BANNER') {
    return 'BANNER_AND_REQUERY';
  }

  return 'REQUERY';
}
