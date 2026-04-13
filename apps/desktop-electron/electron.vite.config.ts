// File: apps/desktop-electron/electron.vite.config.ts
import path from 'node:path';

import react from '@vitejs/plugin-react';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';

const appDir = __dirname;
const workspaceRoot = path.resolve(appDir, '../..');
const alias = {
  '@smart-store/core': path.resolve(workspaceRoot, 'packages/core/src/index.ts'),
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
};

export default defineConfig({
  main: {
    resolve: {
      alias,
    },
    plugins: [externalizeDepsPlugin()],
    build: {
      lib: {
        entry: path.resolve(appDir, 'src/main/main.ts'),
      },
      rollupOptions: {
        output: {
          format: 'cjs',
          entryFileNames: 'main.cjs',
          chunkFileNames: 'chunks/[name]-[hash].cjs',
        },
      },
      outDir: path.resolve(workspaceRoot, 'dist/apps/desktop-electron/main'),
    },
  },
  preload: {
    resolve: {
      alias,
    },
    plugins: [externalizeDepsPlugin()],
    build: {
      lib: {
        entry: path.resolve(appDir, 'src/preload/index.ts'),
      },
      rollupOptions: {
        output: {
          format: 'cjs',
          entryFileNames: 'index.cjs',
          chunkFileNames: 'chunks/[name]-[hash].cjs',
        },
      },
      outDir: path.resolve(workspaceRoot, 'dist/apps/desktop-electron/preload'),
    },
  },
  renderer: {
    root: appDir,
    resolve: {
      alias: {
        ...alias,
        '@renderer': path.resolve(appDir, 'src/renderer'),
      },
    },
    plugins: [react()],
    build: {
      rollupOptions: {
        input: path.resolve(appDir, 'index.html'),
      },
      outDir: path.resolve(workspaceRoot, 'dist/apps/desktop-electron/renderer'),
    },
  },
});
