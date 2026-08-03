import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      // Zastany dług: ~230 miejsc z `any`. Otypowanie ich to osobny refaktor, a nie
      // powód, żeby CI świeciło na czerwono przy każdej niezwiązanej zmianie.
      // W NOWYM kodzie `any` nie przechodzi w code review.
      '@typescript-eslint/no-explicit-any': 'warn',

      // Poniższe dwie są ostrzeżeniami w oryginalnych konfiguracjach swoich wtyczek;
      // na `error` wychodzą dopiero z presetu `reactHooks.configs.flat.recommended`.
      // Zostawiamy je jako sygnał, ale nie jako blokadę:
      //  - exhaustive-deps bywa świadomie łamane (efekt ma pójść raz, nie przy każdej
      //    zmianie referencji), a „naprawianie" go w działającym kodzie to klasyczny
      //    sposób na wprowadzenie pętli renderów albo zgubionego zapytania;
      //  - only-export-components dotyczy wyłącznie wygody Fast Refresh w dev, nie
      //    poprawności produkcyjnej.
      // Reguły react-hooks łapiące realne bugi (purity, set-state-in-effect,
      // immutability, static-components) ZOSTAJĄ błędami — celowo.
      'react-hooks/exhaustive-deps': 'warn',
      'react-refresh/only-export-components': 'warn',
    },
  },
  {
    // GSAP jest na landingu ładowany leniwie (components/LandingV2/useLandingGsap.ts).
    // Pakiet deklaruje globalny `namespace gsap`, więc odwołanie do gołego `gsap.to(...)`
    // bez importu PRZECHODZI typecheck, a w runtime wywala ReferenceError — tsc tej
    // klasy błędu nie wyłapie, dlatego pilnuje jej linter.
    // Poprawnie: `const lib = peekGsap()` albo `getGsap().then(lib => lib.gsap...)`.
    files: ['src/components/LandingV2/**/*.{ts,tsx}', 'src/pages/LandingPage/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-globals': [
        'error',
        {
          name: 'gsap',
          message:
            'GSAP jest ładowany leniwie — użyj getGsap()/peekGsap() z useLandingGsap, nie globalnego `gsap`.',
        },
      ],
    },
  },
])
