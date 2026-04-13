import pino from 'pino';
import path from 'node:path';

import { ensureDir } from '../utils/fs.js';

export async function createLogger(logPath: string): Promise<pino.Logger> {
  await ensureDir(path.dirname(logPath));

  const fileStream = pino.destination({
    dest: logPath,
    mkdir: true,
    sync: false,
  });

  return pino(
    {
      level: 'info',
      timestamp: pino.stdTimeFunctions.isoTime,
      base: undefined,
    },
    pino.multistream([
      { stream: process.stdout },
      { stream: fileStream },
    ]),
  );
}
