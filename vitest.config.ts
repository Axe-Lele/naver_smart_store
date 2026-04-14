import path from 'node:path';

import { defineConfig } from 'vitest/config';

const workspaceRoot = __dirname;

export default defineConfig({
  resolve: {
    alias: {
      '@smart-store/core': path.resolve(
        workspaceRoot,
        'packages/core/src/index.ts',
      ),
      '@smart-store/application': path.resolve(
        workspaceRoot,
        'packages/application/src/index.ts',
      ),
      '@smart-store/infrastructure-playwright': path.resolve(
        workspaceRoot,
        'packages/infrastructure-playwright/src/index.ts',
      ),
      '@smart-store/shared': path.resolve(
        workspaceRoot,
        'packages/shared/src/index.ts',
      ),
    },
  },
  test: {
    environment: 'node',
  },
});
