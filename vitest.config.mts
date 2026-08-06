import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

/*
 * Node environment, no React plugin: the brief scopes tests to "the priority
 * logic and the store, not the pixels", and both are plain modules. Adding a
 * DOM and a JSX transform for tests that need neither would be ceremony.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
