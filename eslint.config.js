import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // `dist` = build output, `.kilo/worktrees` = tool-managed worktree copies,
  // and the root-level check-/fix-/test-/… files are one-off Node debug scripts
  // (not part of the app bundle). Leading `/` anchors them to the project root.
  globalIgnores([
    'dist',
    '.kilo/worktrees',
    '/check-*.js',
    '/check-*.mjs',
    '/compare-db.mjs',
    '/fix-*.js',
    '/fix-*.mjs',
    '/inspect-*.mjs',
    '/patch.js',
    '/test-*.js',
    '/test-*.mjs',
    '/verify-*.mjs',
  ]),
  {
    // Bundler/ESLint config files run in Node
    files: ['*.config.js'],
    extends: [js.configs.recommended],
    languageOptions: { globals: globals.node },
  },
  {
    // App source (browser + JSX)
    files: ['src/**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      // Parity with the pre-upgrade react-hooks v5 flat.recommended preset.
      // (v7's `recommended-latest` adds the full React Compiler rule set,
      // which can be opted into later via a dedicated cleanup pass.)
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
])
