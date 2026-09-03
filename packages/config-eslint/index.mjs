import js from '@eslint/js';
import tseslint from 'typescript-eslint';

/**
 * Configuración única de ESLint (§1 del plan). Las prohibiciones se aplican aquí,
 * no en la revisión humana: `any`, catch silencioso, promesas sin await y `console`.
 */
export default tseslint.config(
  { ignores: ['**/dist/**', '**/.next/**', '**/node_modules/**', '**/coverage/**', '**/*.config.*'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      parserOptions: { projectService: true },
    },
    rules: {
      // El guion bajo marca un descarte deliberado, no un olvido.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      'no-empty': ['error', { allowEmptyCatch: false }],
      'no-console': ['error', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always'],
      'no-restricted-syntax': [
        'error',
        {
          selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message: 'Usa el Clock inyectable: la zona de negocio es America/Mexico_City (§12.1).',
        },
      ],
    },
  },
);
