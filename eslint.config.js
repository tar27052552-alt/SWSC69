import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'scratch', '.agents', 'original_code.js', 'public/OneSignalSDKWorker.js', 'public/OneSignalSDKUpdaterWorker.js', '*.cjs', 'check_*.js', 'test_*.js', 'fix*.cjs', 'clean_*.cjs', 'reconstruct.cjs', 'strip_dashboard.cjs', 'inject_conflicts.cjs']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },
  {
    files: ['vite.config.js'],
    languageOptions: { globals: globals.node },
  },
])
