import ts from 'typescript-eslint';
export default ts.config({ ignores: ['dist/**', 'dist-electron/**', 'release/**', 'node_modules/**'] }, ...ts.configs.recommended, {
  files: ['**/*.{ts,tsx}'], rules: { '@typescript-eslint/no-explicit-any': 'off', '@typescript-eslint/no-unused-expressions': ['error', { allowTernary: true }], '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }] }
}, { files: ['scripts/*.cjs'], rules: { '@typescript-eslint/no-require-imports': 'off' }, languageOptions: { sourceType: 'commonjs', globals: { require: 'readonly', process: 'readonly', console: 'readonly', Buffer: 'readonly', __dirname: 'readonly', setTimeout: 'readonly' } } });
