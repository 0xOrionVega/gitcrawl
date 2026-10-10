import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/extension.ts'],
  format: ['cjs'],
  target: 'node18',
  platform: 'node',
  bundle: true,
  noExternal: ['@gitcrawl/shared'],
  external: ['vscode'],
  clean: true,
});
