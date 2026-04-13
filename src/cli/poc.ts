import { bootstrapCli, printCliError } from './shared.js';

await bootstrapCli('poc').catch((error) => {
  printCliError(error);
  process.exitCode = 1;
});
