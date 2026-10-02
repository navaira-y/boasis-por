import eslint from '@eslint/js';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import { defineConfig, globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';

// One flat config for every workspace. Type-aware rules run on every TypeScript file; the
// project service finds the nearest tsconfig for each file.
export default defineConfig(
  globalIgnores([
    '**/node_modules/**',
    '**/dist/**',
    '**/coverage/**',
    '**/dev-dist/**',
    '**/test-results/**',
    '**/playwright-report/**',
    'docs/**',
  ]),
  eslint.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['apps/portal/src/**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat.recommended],
  },
  {
    // NestJS relies on decorators and class-based DI; a few strict rules fight that style.
    files: ['apps/server/src/**/*.ts'],
    rules: {
      '@typescript-eslint/no-extraneous-class': 'off',
      // Decorator metadata needs runtime imports of classes used as parameter types.
      '@typescript-eslint/consistent-type-imports': 'off',
    },
  },
  prettier,
);
