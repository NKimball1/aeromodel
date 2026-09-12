import { defineConfig } from 'vitest/config';

// Separate config so `pnpm ref` runs only the reference-table printer, and
// the normal `pnpm test` never picks it up.
export default defineConfig({
  test: {
    include: ['scripts/**/*.test.ts'],
    reporters: ['dot'],
  },
});
