import { Command } from 'commander';

import { FatalAutomationError } from '../domain/errors.js';
import { buildConfig } from '../config/schema.js';
import { createLogger } from '../services/logger.js';
import { runSmartStoreAutomation } from '../services/smartstore-runner.js';

export async function bootstrapCli(mode: 'poc' | 'full'): Promise<void> {
  const program = new Command()
    .requiredOption('-i, --input <path>', 'CSV input file path')
    .option('--dry-run', 'Classify and verify editability without saving', false)
    .option('--max-items <number>', 'Maximum number of items to process', parseIntOption)
    .option('--resume', 'Resume from output/checkpoint.json', false)
    .option('--concurrency <number>', 'Number of concurrent browser pages', parseIntOption)
    .option('--delay-ms <number>', 'Delay between items per worker', parseIntOption)
    .allowExcessArguments(false);

  await program.parseAsync(process.argv);
  const options = program.opts<{
    input: string;
    dryRun: boolean;
    maxItems?: number;
    resume: boolean;
    concurrency?: number;
    delayMs?: number;
  }>();

  const config = buildConfig(mode, {
    input: options.input,
    dryRun: options.dryRun,
    maxItems: options.maxItems,
    resume: options.resume,
    concurrency: options.concurrency ?? 1,
    delayMs: options.delayMs,
  });
  const logger = await createLogger(config.logPath);
  const summary = await runSmartStoreAutomation(config, logger);

  logger.info({ summary }, 'Run completed.');

  console.log(
    JSON.stringify(
      {
        runId: summary.runId,
        summaryPath: config.summaryPath,
        processed: summary.actualProcessedItems,
        counts: summary.counts,
        stoppedEarly: summary.stoppedEarly,
      },
      null,
      2,
    ),
  );
}

function parseIntOption(value: string): number {
  const parsed = Number.parseInt(value, 10);

  if (Number.isNaN(parsed)) {
    throw new Error(`Expected an integer but received "${value}".`);
  }

  return parsed;
}

export function printCliError(error: unknown): void {
  if (error instanceof FatalAutomationError) {
    console.error(`[${error.code}] ${error.message}`);
    return;
  }

  console.error(error instanceof Error ? error.message : error);
}
