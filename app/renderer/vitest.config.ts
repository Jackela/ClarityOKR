import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    name: '@clarityokr/renderer',
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
    exclude: ['node_modules', 'dist'],
    setupFiles: ['./src/test-setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      reportsDirectory: './coverage',
      thresholds: {
        branches: 80,
        functions: 80,
        lines: 80,
        statements: 80,
      },
    },
    reporters: ['verbose'],
  },
  resolve: {
    alias: {
      '@renderer': path.resolve(__dirname, './src'),
      '@clarityokr/contracts': path.resolve(__dirname, '../../packages/contracts/src/index.ts'),
      '@clarityokr/main': path.resolve(__dirname, '../../app/main/src'),
    },
  },
});
