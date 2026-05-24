// File: C:\smart-store\vitest.config.ts
import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    restoreMocks: true,
    clearMocks: true,
  },
  resolve: {
    alias: {
      '@smart-store/core': path.resolve(__dirname, 'packages/core/src/index.ts'),
      '@smart-store/core/*': path.resolve(__dirname, 'packages/core/src/*'),
      '@smart-store/application': path.resolve(__dirname, 'packages/application/src/index.ts'),
      '@smart-store/application/*': path.resolve(__dirname, 'packages/application/src/*'),
      '@smart-store/shared': path.resolve(__dirname, 'packages/shared/src/index.ts'),
      '@smart-store/shared/*': path.resolve(__dirname, 'packages/shared/src/*'),
      '@smart-store/infrastructure-playwright': path.resolve(
        __dirname,
        'packages/infrastructure-playwright/src/index.ts',
      ),
      '@smart-store/infrastructure-playwright/*': path.resolve(
        __dirname,
        'packages/infrastructure-playwright/src/*',
      ),
    },
  },
});
