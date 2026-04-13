import fs from 'node:fs';
import { parse } from 'fast-csv';
import type pino from 'pino';

import type { InputReadResult, ProductTask } from '../domain/types.js';

export async function readInputCsv(
  inputFile: string,
  logger: pino.Logger,
): Promise<InputReadResult> {
  return new Promise<InputReadResult>((resolve, reject) => {
    const tasks: ProductTask[] = [];
    const seen = new Set<string>();
    let totalRows = 0;
    let invalidRowCount = 0;
    let duplicateCount = 0;
    let headerValidated = false;

    fs.createReadStream(inputFile)
      .pipe(
        parse({
          headers: true,
          trim: true,
          ignoreEmpty: true,
        }),
      )
      .on('headers', (headers: string[]) => {
        headerValidated = true;

        if (!headers.includes('productNo')) {
          reject(
            new Error(
              `Input CSV must include a "productNo" column. Received headers: ${headers.join(', ')}`,
            ),
          );
        }
      })
      .on('data', (row: Record<string, string>) => {
        totalRows += 1;
        const productNo = String(row.productNo ?? '').trim();

        if (!productNo) {
          invalidRowCount += 1;
          return;
        }

        if (seen.has(productNo)) {
          duplicateCount += 1;
          logger.warn({ productNo }, 'Skipping duplicate productNo from input.');
          return;
        }

        seen.add(productNo);
        tasks.push({
          productNo,
          rowNumber: totalRows + 1,
        });
      })
      .on('error', reject)
      .on('end', () => {
        if (!headerValidated) {
          reject(new Error('Input CSV could not be parsed or is empty.'));
          return;
        }

        resolve({
          tasks,
          totalRows,
          invalidRowCount,
          duplicateCount,
        });
      });
  });
}
