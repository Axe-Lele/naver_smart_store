import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';

import { format, type CsvFormatterStream } from 'fast-csv';
import type { Page } from 'playwright';

import type { AppConfig } from '../config/schema.js';
import type {
  ArtifactPaths,
  ProductProcessResult,
  RunSummary,
} from '../domain/types.js';
import {
  ensureDir,
  fileExists,
  sanitizeFileSegment,
  toWorkspaceRelative,
  writeJsonFile,
} from '../utils/fs.js';

type CsvRow = Record<string, string | number | boolean | undefined>;
const CSV_HEADERS = [
  'productNo',
  'rowNumber',
  'status',
  'actionResult',
  'verificationMethod',
  'reason',
  'errorMessage',
  'startedAt',
  'finishedAt',
  'durationMs',
  'workerId',
  'dryRun',
  'screenshotPath',
  'htmlPath',
] as const;

export class OutputManager {
  private writeChain = Promise.resolve();

  private constructor(
    private readonly config: AppConfig,
    private readonly successCsv: CsvFormatterStream<CsvRow, CsvRow>,
    private readonly lockedCsv: CsvFormatterStream<CsvRow, CsvRow>,
    private readonly failedCsv: CsvFormatterStream<CsvRow, CsvRow>,
    private readonly resultsStream: fs.WriteStream,
  ) {}

  static async create(config: AppConfig): Promise<OutputManager> {
    await ensureDir(config.outputDir);
    await ensureDir(config.screenshotsDir);
    await ensureDir(config.htmlDir);

    const successCsv = await createCsvStream(config.successCsvPath, config.resume);
    const lockedCsv = await createCsvStream(config.lockedCsvPath, config.resume);
    const failedCsv = await createCsvStream(config.failedCsvPath, config.resume);
    const resultsStream = await createJsonlStream(config.resultsJsonlPath, config.resume);

    return new OutputManager(
      config,
      successCsv,
      lockedCsv,
      failedCsv,
      resultsStream,
    );
  }

  async captureFailureArtifacts(
    page: Page,
    productNo: string,
    status: ProductProcessResult['status'],
  ): Promise<ArtifactPaths> {
    const fileStem = `${new Date()
      .toISOString()
      .replace(/[:.]/g, '-')}_${sanitizeFileSegment(productNo)}_${status.toLowerCase()}`;
    const artifactPaths: ArtifactPaths = {};

    if (this.config.captureScreenshotOnFailure) {
      try {
        const screenshotPath = path.join(
          this.config.screenshotsDir,
          `${fileStem}.png`,
        );
        await page.screenshot({
          path: screenshotPath,
          fullPage: true,
        });
        artifactPaths.screenshotPath = toWorkspaceRelative(screenshotPath);
      } catch {}
    }

    if (this.config.captureHtmlOnFailure) {
      try {
        const htmlPath = path.join(this.config.htmlDir, `${fileStem}.html`);
        await fsPromises.writeFile(htmlPath, await page.content(), 'utf8');
        artifactPaths.htmlPath = toWorkspaceRelative(htmlPath);
      } catch {}
    }

    return artifactPaths;
  }

  async appendResult(result: ProductProcessResult): Promise<void> {
    this.writeChain = this.writeChain.then(async () => {
      const csvRow = toCsvRow(result);

      if (result.outputBucket === 'success') {
        this.successCsv.write(csvRow);
      } else if (result.outputBucket === 'locked') {
        this.lockedCsv.write(csvRow);
      } else {
        this.failedCsv.write(csvRow);
      }

      this.resultsStream.write(`${JSON.stringify(result)}\n`);
    });

    await this.writeChain;
  }

  async writeSummary(summary: RunSummary): Promise<void> {
    await this.writeChain;
    await writeJsonFile(this.config.summaryPath, summary);
  }

  async close(): Promise<void> {
    await this.writeChain;
    await Promise.all([
      closeCsv(this.successCsv),
      closeCsv(this.lockedCsv),
      closeCsv(this.failedCsv),
      closeWriteStream(this.resultsStream),
    ]);
  }
}

async function createCsvStream(
  filePath: string,
  append: boolean,
): Promise<CsvFormatterStream<CsvRow, CsvRow>> {
  await ensureDir(path.dirname(filePath));
  const shouldAppend = append && (await fileExists(filePath));
  const csvStream = format<CsvRow, CsvRow>({
    headers: [...CSV_HEADERS],
    writeHeaders: !shouldAppend,
  });
  const writeStream = fs.createWriteStream(filePath, {
    flags: shouldAppend ? 'a' : 'w',
  });

  csvStream.pipe(writeStream);
  return csvStream;
}

async function createJsonlStream(
  filePath: string,
  append: boolean,
): Promise<fs.WriteStream> {
  await ensureDir(path.dirname(filePath));
  const shouldAppend = append && (await fileExists(filePath));
  return fs.createWriteStream(filePath, {
    flags: shouldAppend ? 'a' : 'w',
  });
}

function toCsvRow(result: ProductProcessResult): CsvRow {
  return {
    productNo: result.productNo,
    rowNumber: result.rowNumber,
    status: result.status,
    actionResult: result.actionResult,
    verificationMethod: result.verificationMethod,
    reason: result.reason,
    errorMessage: result.errorMessage,
    startedAt: result.startedAt,
    finishedAt: result.finishedAt,
    durationMs: result.durationMs,
    workerId: result.workerId,
    dryRun: result.dryRun,
    screenshotPath: result.artifactPaths?.screenshotPath,
    htmlPath: result.artifactPaths?.htmlPath,
  };
}

async function closeCsv(
  stream: CsvFormatterStream<CsvRow, CsvRow>,
): Promise<void> {
  await new Promise<void>((resolve) => {
    stream.end(() => resolve());
  });
}

async function closeWriteStream(stream: fs.WriteStream): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    stream.end((error?: Error | null) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}
