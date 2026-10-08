import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/main.ts', 'src/pregen.ts', 'src/seed.ts'],
  format: ['esm'],
  target: 'node22',
  platform: 'node',
  bundle: true,
  noExternal: ['@gitcrawl/shared'],
  external: ['@resvg/resvg-js'],
  clean: true,
});
