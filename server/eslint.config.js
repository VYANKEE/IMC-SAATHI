import js from '@eslint/js';
import globals from 'globals';

export default [
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      'no-unused-vars': [
        'warn',
        // `const { departmentCode: _c, ...rest } = row` is how you omit a key.
        // The placeholder is intentionally unused.
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
      'no-console': 'warn',

      // Architecture boundary: only src/ai/llm/* may import an LLM SDK.
      // See docs/09-repo-structure.md.
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@google/generative-ai',
              message:
                'Import the LLM SDK only inside src/ai/llm/. Everywhere else, use the LLMProvider interface.',
            },
            {
              name: 'openai',
              message: 'Import the LLM SDK only inside src/ai/llm/.',
            },
          ],
        },
      ],
    },
  },
  {
    // The adapters are the one place allowed to touch a vendor SDK.
    files: ['src/ai/llm/**/*.js'],
    rules: { 'no-restricted-imports': 'off' },
  },
  {
    files: ['tests/**/*.js'],
    languageOptions: { globals: { ...globals.node } },
  },
];
