import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@prisma/client': resolve(__dirname, 'src/generated/prisma'),
    },
  },
  test: {
    environment: 'node',
    /*
     * `.tsx` is included for component tests, which opt into jsdom with a
     * `// @vitest-environment jsdom` docblock rather than a global setting — the
     * suite is otherwise pure logic and does not want a DOM.
     */
    include: ['tests/**/*.test.{ts,tsx}'],
    /*
      Heap ceiling for the worker pool.

      `vitest run` was dying with "Committing semi space failed" — a hard OOM, not
      a slow test — once the suite passed roughly 800 tests. Every file is
      transformed in-process and the default Node heap ran out during collection,
      so the whole run aborted with no test results at all.

      Set here rather than in the npm script so `npx vitest`, an IDE runner and
      `npm test` all get it. `execArgv` is passed to each forked worker; without
      it only the parent would have the larger heap and the workers would still
      die.
    */
    poolOptions: {
      forks: {
        execArgv: ['--max-old-space-size=8192'],
      },
    },
  },
});
