import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/main.ts'],
  format: ['esm'],
  target: 'node20',
  platform: 'node',
  bundle: true,
  noExternal: ['@gitcrawl/shared'],
  clean: true,
  banner: { js: '#!/usr/bin/env node' },
});
