import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'src/react-jsx-compat.d.ts', 'src/vite-env.d.ts']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      // Sprint 2 — pendiente Alfredo: refactorizar useEffect con async
      'react-hooks/set-state-in-effect': 'warn',
      // Sprint 2 — button.tsx exporta constantes junto a componentes
      'react-refresh/only-export-components': 'warn',
      // Interfaces de compatibilidad TS generadas automáticamente
      '@typescript-eslint/no-empty-object-type': 'warn',
    },
  },
])