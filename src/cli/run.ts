import { bootstrapCli, printCliError } from './shared.js';

await bootstrapCli('full').catch((error) => {
  printCliError(error);
  process.exitCode = 1;
});
