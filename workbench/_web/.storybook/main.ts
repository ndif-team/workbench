import type { StorybookConfig } from '@storybook/nextjs-vite';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import type { Plugin } from 'vite';
import { readFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Create a Vite plugin to mock server-side dependencies
function mockServerDeps(): Plugin {
  const srcDir = resolve(__dirname, '../src');
  const mocksDir = resolve(__dirname, './mocks');
  
  // Read mock file contents
  const dbClientMock = readFileSync(resolve(mocksDir, 'db-client.ts'), 'utf-8');
  const dotenvMock = readFileSync(resolve(mocksDir, 'dotenv.ts'), 'utf-8');
  
  return {
    name: 'mock-server-deps',
    enforce: 'pre',
    // Intercept file loading
    load(id) {
      // Mock db/client.ts
      if (id.includes('src/db/client') || id.endsWith('db/client.ts')) {
        console.log('[mock-server-deps] Mocking:', id);
        return dbClientMock;
      }
      return null;
    },
    // Also handle module resolution for dotenv
    resolveId(source) {
      if (source === 'dotenv') {
        return resolve(mocksDir, 'dotenv.ts');
      }
      return null;
    },
  };
}

const config: StorybookConfig = {
  "stories": [
    "../src/**/*.mdx",
    "../src/**/*.stories.@(js|jsx|mjs|ts|tsx)"
  ],
  "addons": [
    "@chromatic-com/storybook",
    "@storybook/addon-vitest",
    "@storybook/addon-a11y",
    "@storybook/addon-docs",
    "@storybook/addon-onboarding"
  ],
  "framework": "@storybook/nextjs-vite",
  "staticDirs": [
    "../public"
  ],
  async viteFinal(config) {
    return {
      ...config,
      plugins: [
        mockServerDeps(),
        ...(config.plugins || []),
      ],
      optimizeDeps: {
        ...config.optimizeDeps,
        force: true,
        exclude: [
          ...(config.optimizeDeps?.exclude || []),
          'dotenv',
          'better-sqlite3',
          'postgres',
        ],
      },
    };
  },
};
export default config;
