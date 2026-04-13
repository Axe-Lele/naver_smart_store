// File: packages/infrastructure-playwright/src/persistence/file-run-report.exporter.ts
import fs from 'node:fs';
import path from 'node:path';

import { format, type CsvFormatterStream } from 'fast-csv';

import type { RunReportExporterPort } from '@smart-store/application';
import type {
  BatchJob,
  BatchJobItemResultSnapshot,
  BatchJobResult,
} from '@smart-store/core';

import { appendJsonLine, ensureDir, writeJsonFile } from '../utils/fs.js';
import { OutputPathResolver } from './output-path-resolver.js';

type CsvRow = Record<string, string | number | boolean | undefined>;

const CSV_HEADERS = [
  'productId',
  'status',
  'actionResult',
  'verificationMethod',
  'reason',
  'errorMessage',
  'startedAt',
  'finishedAt',
  'durationMs',
  'attemptNumber',
  'outputBucket',
  'failureCategory',
  'screenshotPath',
  'htmlPath',
] as const;

export class FileRunReportExporter implements RunReportExporterPort {
  constructor(private readonly paths: OutputPathResolver) {}

  async exportRunReport(input: {
    job: BatchJob;
    result: BatchJobResult;
    targetPath?: string;
  }): Promise<{ targetPath: string; exportedFiles: readonly string[] }> {
    const targetDir = input.targetPath ?? (await this.paths.reportDir(input.job.id.toString()));
    await ensureDir(targetDir);

    const successCsv = path.join(targetDir, 'success.csv');
    const lockedCsv = path.join(targetDir, 'locked.csv');
    const failedCsv = path.join(targetDir, 'failed.csv');
    const resultsJsonl = path.join(targetDir, 'results.jsonl');
    const summaryJson = path.join(targetDir, 'run-summary.json');

    const snapshots = input.result.items.map((item) => item.toSnapshot());
    const successItems = snapshots.filter((item) => item.outputBucket === 'success');
    const lockedItems = snapshots.filter((item) => item.outputBucket === 'locked');
    const failedItems = snapshots.filter((item) => item.outputBucket === 'failed');

    await Promise.all([
      writeCsvFile(successCsv, successItems),
      writeCsvFile(lockedCsv, lockedItems),
      writeCsvFile(failedCsv, failedItems),
    ]);

    fs.writeFileSync(resultsJsonl, '');
    for (const item of snapshots) {
      await appendJsonLine(resultsJsonl, item);
    }

    await writeJsonFile(summaryJson, {
      exportedAt: new Date().toISOString(),
      job: input.job.toSnapshot(),
      result: input.result.toSnapshot(),
    });

    return {
      targetPath: targetDir,
      exportedFiles: [successCsv, lockedCsv, failedCsv, resultsJsonl, summaryJson],
    };
  }
}

async function writeCsvFile(
  filePath: string,
  items: readonly BatchJobItemResultSnapshot[],
): Promise<void> {
  await ensureDir(path.dirname(filePath));
  const csvStream = format<CsvRow, CsvRow>({
    headers: [...CSV_HEADERS],
    writeHeaders: true,
  });
  const writeStream = fs.createWriteStream(filePath, { flags: 'w' });

  csvStream.pipe(writeStream);
  for (const item of items) {
    csvStream.write(toCsvRow(item));
  }

  await closeCsv(csvStream);
}

function toCsvRow(item: BatchJobItemResultSnapshot): CsvRow {
  return {
    productId: item.productId,
    status: item.status,
    actionResult: item.actionResult,
    verificationMethod: item.verificationMethod,
    reason: item.reason,
    errorMessage: item.errorMessage,
    startedAt: item.startedAt,
    finishedAt: item.finishedAt,
    durationMs: item.durationMs,
    attemptNumber: item.attemptNumber,
    outputBucket: item.outputBucket,
    failureCategory: item.failureCategory,
    screenshotPath: item.artifact?.screenshotPath,
    htmlPath: item.artifact?.htmlPath,
  };
}

async function closeCsv(stream: CsvFormatterStream<CsvRow, CsvRow>): Promise<void> {
  await new Promise<void>((resolve) => {
    stream.end(() => resolve());
  });
}
