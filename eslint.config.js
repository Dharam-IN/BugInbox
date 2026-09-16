import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      'packages/shared/dist/**',
      'test-results/**',
      'playwright-report/**',
      'backups/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      eqeqeq: ['error', 'smart'],
      'no-console': 'off',
    },
  },
  {
    // The fixture host site is intentionally plain ES5-era browser JavaScript.
    files: ['fixtures/**/*.js'],
    languageOptions: { globals: { ...globals.browser }, sourceType: 'script' },
    rules: { 'no-var': 'off' },
  },
  {
    files: ['**/*.mjs', '*.js'],
    languageOptions: { globals: { ...globals.node } },
  },
);
