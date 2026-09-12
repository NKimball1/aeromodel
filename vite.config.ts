import { defineConfig } from 'vitest/config';

export default defineConfig({
  build: {
    // Three.js alone is ~540 kB minified (~140 kB gzip); one chunk is fine here.
    chunkSizeWarningLimit: 700,
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
});
