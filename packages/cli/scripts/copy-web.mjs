// Copies the built web client into the CLI package so `gitcrawl` can serve it offline.
import { cpSync, existsSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, '..', '..', '..', 'apps', 'web', 'dist');
const dest = join(here, '..', 'dist', 'web');
if (!existsSync(src)) {
  console.warn('[gitcrawl-cli] apps/web/dist not found — build the web app first (pnpm --filter @gitcrawl/web build).');
  process.exit(0);
}
rmSync(dest, { recursive: true, force: true });
cpSync(src, dest, { recursive: true });
console.log('[gitcrawl-cli] bundled web client into dist/web');
