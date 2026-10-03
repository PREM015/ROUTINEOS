import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import reactHooks from 'eslint-plugin-react-hooks';

/**
 * `eslint-plugin-react-hooks` is declared here rather than relied on transitively
 * through `eslint-config-next`.
 *
 * `nextVitals` does register the plugin, but in a *different* config object.
 * ESLint 9.39 tightened flat-config validation so a `files`-scoped object must
 * be self-contained, and without this declaration `npx eslint scripts` aborts
 * before reading a single file with "could not find plugin react-hooks". Since
 * `npm run lint` runs `eslint .`, one unresolvable scoped block takes down the
 * entire repository's lint run, `src` included.
 *
 * The key must be exactly `react-hooks`, matching how the rules are referenced
 * (`react-hooks/set-state-in-effect`). Registering it as `reactHooks` loads the
 * same plugin object but leaves every `react-hooks/*` rule unresolvable, which
 * produces the identical error and is genuinely confusing to debug.
 *
 * Declaring it explicitly is also just correct: this config opts into React
 * Compiler rules that `nextVitals` does not set, so depending on Next's
 * transitive registration for them was relying on an implementation detail.
 */
const reactHooksPlugin = { 'react-hooks': reactHooks };

const eslintConfig = [
  {
    // Generated and vendored code is not ours to lint.
    //
    // `src/generated/prisma` is emitted by `prisma generate`; it accounted for
    // ~1058 of the 1777 reported problems (718 empty-object-type, 340
    // explicit-any, 544 unused-vars) purely because generated `.d.ts` and
    // runtime bundles do not follow hand-written style rules. Re-running
    // `prisma generate` must never be able to turn CI red.
    ignores: [
      'src/generated/**',
      '.next/**',
      'node_modules/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
      'next-env.d.ts',
      // Standalone Node maintenance scripts (.cjs). `@typescript-eslint/no-require-imports`
      // is a false positive here: a CommonJS file cannot use an ESM import, and these
      // are run by hand via `node`, not bundled by Next.
      'scripts/**',
    ],
  },
  ...nextVitals,
  ...nextTs,
  {
    plugins: reactHooksPlugin,
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          // A `catch {}` with no binding is idiomatic; a named-but-unused
          // binding is usually a leftover.
          caughtErrors: 'none',
        },
      ],

      // ── Tracked technical debt (warn, not error) ──────────────────────────
      // These are real quality gaps that Phase 5.4 works down. They are kept as
      // warnings so `npm run lint` is a usable gate today instead of a wall of
      // hundreds of pre-existing errors that blocks every future change. They
      // are still reported on every run and in CI output.
      //
      // When the count reaches zero, flip these back to 'error'.
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-empty-object-type': 'warn',

      // ── React Compiler diagnostics (warn) ──────────────────────────────────
      // Next 16's config enables the React Compiler lint rules. These flag
      // patterns that are legal React but would be rewritten by the compiler
      // (syncing state inside an effect, reading refs during render, etc.).
      // They are advisory here: the app does not run the compiler, and
      // auto-converting ~30 call sites is a behavioural change, not a lint fix.
      // The classic correctness rules below stay hard errors.
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/use-memo': 'warn',

      // ── Intentionally relaxed ──────────────────────────────────────────────
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      'react/prop-types': 'off',
      'react/react-in-jsx-scope': 'off',
      '@typescript-eslint/no-non-null-assertion': 'warn',

      // Correctness rules stay hard errors.
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'prefer-const': 'error',
      'no-var': 'error',
      '@typescript-eslint/no-require-imports': 'error',
    },
  },
  {
    // Scripts are CLI tools: logging to stdout is their job, and an unused
    // catch binding is normal at the top level of a script.
    //
    // The plugin is re-declared because a `files`-scoped object must be
    // self-contained under ESLint 9.39's flat-config validation. Without it,
    // `npx eslint scripts` aborts before reading a single file with "could not
    // find plugin react-hooks" — and because `npm run lint` runs `eslint .`, one
    // unresolvable scoped block takes down the whole repository's lint run,
    // including `src`.
    files: ['scripts/**/*.ts'],
    plugins: reactHooksPlugin,
    rules: {
      'no-console': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
];

export default eslintConfig;
