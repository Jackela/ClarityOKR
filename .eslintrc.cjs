module.exports = {
  root: true,
  env: {
    es2022: true,
    node: true,
    browser: true,
  },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: ['./tsconfig.eslint.json'],
    tsconfigRootDir: __dirname,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint', 'import'],
  settings: {
    'import/resolver': {
      typescript: {
        project: ['./tsconfig.eslint.json'],
      },
    },
  },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:@typescript-eslint/recommended-requiring-type-checking',
    'plugin:import/recommended',
    'plugin:import/typescript',
    'prettier',
  ],
  ignorePatterns: [
    'dist/',
    'coverage/',
    'node_modules/',
    '*.config.cjs',
    'tests/**',
    'specs/**',
    'tests/integration/**',
    'tests/e2e/**',
    'tmp-dist/**',
  ],
  rules: {
    'import/order': [
      'error',
      {
        'newlines-between': 'always',
        groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
        alphabetize: { order: 'asc', caseInsensitive: true },
      },
    ],
    '@typescript-eslint/no-floating-promises': 'error',
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
  },
  overrides: [
    {
      files: ['tests/**/*.ts', 'app/**/*.spec.ts'],
      rules: {
        '@typescript-eslint/no-unsafe-assignment': 'off',
        '@typescript-eslint/no-unsafe-member-access': 'off',
        '@typescript-eslint/no-unsafe-call': 'off',
        '@typescript-eslint/no-unsafe-argument': 'off',
        '@typescript-eslint/no-redundant-type-constituents': 'off',
        '@typescript-eslint/require-await': 'off',
        '@typescript-eslint/no-misused-promises': 'off',
      },
    },
    {
      files: ['tests/e2e/**/*.ts'],
      rules: {
        'import/order': 'off',
        '@typescript-eslint/consistent-type-imports': 'off',
      },
    },
    {
      files: ['app/renderer/src/main.ts'],
      rules: {
        '@typescript-eslint/no-unsafe-argument': 'off',
      },
    },
    {
      files: ['app/renderer/src/app/**/*.ts', '!app/renderer/src/app/**/*.spec.ts'],
      rules: {
        '@typescript-eslint/no-unsafe-assignment': 'off',
        '@typescript-eslint/no-unsafe-member-access': 'off',
        '@typescript-eslint/no-unsafe-call': 'off',
        '@typescript-eslint/no-unsafe-return': 'off',
        '@typescript-eslint/no-unsafe-argument': 'off',
        '@typescript-eslint/no-redundant-type-constituents': 'off',
        '@typescript-eslint/unbound-method': 'off',
      },
    },
  ],
};
