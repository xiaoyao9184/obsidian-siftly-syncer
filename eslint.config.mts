import type { Linter } from 'eslint';

import { obsidianDevUtilsConfigs } from 'obsidian-dev-utils/ScriptUtils/ESLint/eslint.config';

const configs: Linter.Config[] = [
  ...obsidianDevUtilsConfigs,
  {
    files: ['package.json'],
    rules: {
      'depend/ban-dependencies': ['error', { allowed: ['moment'] }]
    }
  },
  {
    rules: {
      'obsidianmd/ui/sentence-case': [
        'error',
        {
          brands: ['React', 'Siftly', 'Svelte']
        }
      ]
    }
  }
];

// eslint-disable-next-line import-x/no-default-export -- ESLint infrastructure requires a default export.
export default configs;
