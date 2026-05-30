// Path: C:\smart-store\apps\chrome-extension\src\application\use-cases.ts
import type {
  CurrentPageTypeDetectorPort,
  LoggerPort,
  ProductEditPageParserPort,
  ProductEditPageDriverPort,
  ProductListPageDraft,
  ProductEditPageDraft,
  ProductSearchPageParserPort,
  ProgressSnapshot,
  ProgressStorePort,
  SelectorInspectionReport,
} from "./ports.js";
import {
  DEFAULT_RUN_POLICY,
  ProductProcessingState,
  type ProcessingResult,
  type Product,
  type RunPolicy,
} from "../domain/index.js";

const createEmptySnapshot = (phase: ProgressSnapshot["phase"]): ProgressSnapshot => ({
  phase,
  updatedAt: new Date().toISOString(),
  targetCount: 0,
  completedCount: 0,
  results: [],
  logs: [],
});

export class CollectTargetProductsUseCase {
  public constructor(
    private readonly parser: ProductSearchPageParserPort,
    private readonly logger: LoggerPort,
  ) {}

  public async execute(): Promise<{
    products: Product[];
    verificationRequired: boolean;
    note: string;
  }> {
    const parsed = await this.parser.collectBundleDeliveryTargets({
      pagination: "all-pages",
    });

    this.logger.info("Collected target candidates", {
      count: parsed.products.length,
      verificationStatus: parsed.verificationStatus,
    });

    return {
      products: parsed.products,
      verificationRequired: parsed.verificationStatus === "verification_required",
      note: parsed.note,
    };
  }
}

export class ExecuteDryRunUseCase {
  public constructor(
    private readonly collector: CollectTargetProductsUseCase,
    private readonly progressStore: ProgressStorePort,
    private readonly logger: LoggerPort,
  ) {}

  public async execute(policy: RunPolicy = DEFAULT_RUN_POLICY): Promise<ProgressSnapshot> {
    const collected = await this.collector.execute();
    const snapshot = createEmptySnapshot(
      collected.verificationRequired ? "verification-required" : "dry-run",
    );

    if (collected.verificationRequired) {
      snapshot.logs.push({
        timestamp: new Date().toISOString(),
        level: "warn",
        message: collected.note,
      });
      await this.progressStore.save(snapshot);
      return snapshot;
    }

    const products = applyMaxItems(collected.products, policy.maxItems);
    const results: ProcessingResult[] = products.slice(0, 5).map((product) => ({
      productId: product.id,
      state: ProductProcessingState.DRY_RUN_READY,
      message: [
        "Preview target collected.",
        product.name ? `name=${product.name}` : undefined,
        product.editUrl ? `editUrl=${product.editUrl}` : "editUrl=missing",
      ]
        .filter(Boolean)
        .join(" | "),
      retryable: false,
      artifacts: [],
    }));

    snapshot.updatedAt = new Date().toISOString();
    snapshot.targetCount = products.length;
    snapshot.completedCount = results.length;
    snapshot.results = results.map(mapResultSummary);
    await this.progressStore.save(snapshot);
    this.logger.info("Dry-run completed", { count: results.length });

    return snapshot;
  }
}

export class ExecuteBatchUseCase {
  public constructor(
    private readonly collector: CollectTargetProductsUseCase,
    private readonly driver: ProductEditPageDriverPort,
    private readonly progressStore: ProgressStorePort,
    private readonly logger: LoggerPort,
  ) {}

  public async execute(policy: RunPolicy = DEFAULT_RUN_POLICY): Promise<ProgressSnapshot> {
    const collected = await this.collector.execute();
    const snapshot = createEmptySnapshot(
      collected.verificationRequired ? "verification-required" : "executing",
    );

    if (collected.verificationRequired) {
      snapshot.logs.push({
        timestamp: new Date().toISOString(),
        level: "warn",
        message: collected.note,
      });
      await this.progressStore.save(snapshot);
      return snapshot;
    }

    const products = applyMaxItems(collected.products, policy.maxItems);
    const results: ProcessingResult[] = [];

    for (const product of products) {
      const prepared = await this.driver.preparePreorderChangePlan(product, {
        ...policy,
        dryRun: false,
      });

      if ("state" in prepared) {
        results.push(prepared);
        continue;
      }

      results.push(await this.driver.applyPreorderChangePlan(prepared));
    }

    snapshot.updatedAt = new Date().toISOString();
    snapshot.targetCount = products.length;
    snapshot.completedCount = results.length;
    snapshot.results = results.map(mapResultSummary);
    await this.progressStore.save(snapshot);
    this.logger.info("Batch execution completed", { count: results.length });

    return snapshot;
  }
}

export class InspectDomUseCase {
  public constructor(
    private readonly detector: CurrentPageTypeDetectorPort,
    private readonly searchParser: ProductSearchPageParserPort,
    private readonly editParser: ProductEditPageParserPort,
    private readonly reportReader: {
      buildReport(
        detection: Awaited<ReturnType<CurrentPageTypeDetectorPort["detect"]>>,
      ): SelectorInspectionReport;
      formatUnverifiedReport(report: SelectorInspectionReport): string;
    },
    private readonly progressStore: ProgressStorePort,
    private readonly logger: LoggerPort,
  ) {}

  public async execute(): Promise<{
    detection: Awaited<ReturnType<CurrentPageTypeDetectorPort["detect"]>>;
    report: SelectorInspectionReport;
    reportText: string;
    pageDraft: ProductListPageDraft | ProductEditPageDraft | null;
    progress: ProgressSnapshot;
  }> {
    const detection = await this.detector.detect();
    const report = this.reportReader.buildReport(detection);
    const reportText = this.reportReader.formatUnverifiedReport(report);
    const pageDraft =
      detection.pageType === "product_search"
        ? await this.searchParser.inspectCurrentPage()
        : detection.pageType === "product_edit"
          ? await this.editParser.inspectCurrentPage()
          : null;

    const progress: ProgressSnapshot = {
      phase: "inspecting",
      updatedAt: new Date().toISOString(),
      targetCount: 0,
      completedCount: 0,
      results: [],
      logs: [
        {
          timestamp: new Date().toISOString(),
          level: "info",
          message: `DOM inspection completed for ${detection.pageType}.`,
        },
      ],
    };

    await this.progressStore.save(progress);
    this.logger.info("DOM inspection completed", {
      pageType: detection.pageType,
      verificationStatus: detection.verificationStatus,
    });

    return {
      detection,
      report,
      reportText,
      pageDraft,
      progress,
    };
  }
}

function applyMaxItems(products: Product[], maxItems: number | null): Product[] {
  if (maxItems === null) {
    return products;
  }

  return products.slice(0, maxItems);
}

function mapResultSummary(result: ProcessingResult): ProgressSnapshot["results"][number] {
  return {
    productId: result.productId.toString(),
    state: result.state,
    message: result.message,
  };
}
