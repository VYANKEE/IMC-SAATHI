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
            {
              name: '@langchain/google-genai',
              message:
                'Import the Gemini embedding/chat wrapper only inside src/ai/. Everywhere else, use the embedder/LLMProvider interface.',
            },
          ],
        },
      ],
    },
  },
  {
    // The adapters are the one place allowed to touch a vendor SDK —
    // src/ai/llm/ (chat) and src/ai/embeddings/ (embeddings) both qualify.
    // src/ingestion/ using @langchain/textsplitters is NOT covered here on
    // purpose: that's a text-splitting algorithm, not a vendor API client —
    // nothing about it needs to be isolated behind an adapter interface.
    files: ['src/ai/**/*.js'],
    rules: { 'no-restricted-imports': 'off' },
  },
  {
    files: ['tests/**/*.js'],
    languageOptions: { globals: { ...globals.node } },
  },
];
