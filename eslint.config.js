import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'coverage/**',
      '**/*.js',
      '**/*.d.ts',
      'vite.config.ts',
    ],
  },

  // Base: type-aware rules for all TS/TSX sources and tests.
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.eslint.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      globals: { ...globals.node },
    },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      // Async functions passed as Ink/React event handlers (onSubmit, onChange,
      // props callbacks) are idiomatic here — errors are handled inside them.
      // Keep the dangerous checks (awaited/conditional misuse), allow handlers.
      '@typescript-eslint/no-misused-promises': [
        'error',
        { checksVoidReturn: { attributes: false, properties: false } },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },

  // React (Ink TUI + web UI): enforce the stable Rules of Hooks. The newer
  // React-Compiler-era rules that ship in this plugin's `recommended` set
  // (set-state-in-effect, immutability, refs, purity, exhaustive-deps) flag a
  // large amount of pre-existing intentional code and are deferred to a
  // dedicated follow-up rather than blocking CI in this initial adoption.
  {
    files: ['src/tui/**/*.{ts,tsx}', 'src/web-ui/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },

  // Web UI runs in the browser; add browser globals + fast-refresh rule.
  {
    files: ['src/web-ui/**/*.{ts,tsx}'],
    ...reactRefresh.configs.recommended,
    languageOptions: {
      globals: { ...globals.browser },
    },
  },

  // Tests: node:test intentionally leaves `test()` promises floating and works
  // with untyped parsed JSON. Turn off the type-aware rules that only produce
  // noise here; keep correctness rules like no-unused-vars.
  {
    files: ['test/**/*.{ts,tsx}'],
    rules: {
      // Tests build minimal fixtures with `as any`; the surrounding type-aware
      // rules already cover real correctness. Allow explicit any here.
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-floating-promises': 'off',
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-base-to-string': 'off',
    },
  },
);
