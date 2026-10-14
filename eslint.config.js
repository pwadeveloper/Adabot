import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/', 'demo-dist/', 'node_modules/', 'fidelity/', 'handoff/', 'public/'] },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked.map(c => ({ ...c, files: ['**/*.{ts,tsx}'] })),
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: { parserOptions: { project: './tsconfig.json', tsconfigRootDir: import.meta.dirname }, globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      '@typescript-eslint/no-confusing-void-expression': 'off',
      '@typescript-eslint/restrict-plus-operands': ['error', { allowNumberAndString: true }]
    }
  },
  { files: ['scripts/**/*.mjs', '*.js'], languageOptions: { globals: { ...globals.node, window: 'readonly', document: 'readonly', localStorage: 'readonly', requestAnimationFrame: 'readonly' } } }
);
