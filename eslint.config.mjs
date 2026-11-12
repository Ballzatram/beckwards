import js from '@eslint/js';
import globals from 'globals';

export default [
  js.configs.recommended,
  {
    files: ['tests/mobile.spec.js'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: { eqeqeq: 'error' },
  },
  {
    files: ['eslint.config.mjs'],
    languageOptions: { globals: globals.node },
  },
];
