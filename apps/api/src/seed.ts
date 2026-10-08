/**
 * Seed the dungeon cache from the bundled demo fixtures, so a fresh server can
 * serve the example dungeons (and their share images) before any GitHub calls:
 *   pnpm --filter @gitcrawl/api seed
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { DungeonSpec } from '@gitcrawl/shared';
import { loadConfig } from './config.js';
import { DungeonStore } from './store.js';

const cfg = loadConfig();
const dir = resolve(process.argv[2] ?? join(import.meta.dirname, '..', '..', 'web', 'public', 'fixtures'));
const store = new DungeonStore(cfg.cacheDir);
let n = 0;
for (const f of readdirSync(dir)) {
  if (!f.endsWith('.json') || f === 'index.json') continue;
  const spec = JSON.parse(readFileSync(join(dir, f), 'utf8')) as DungeonSpec;
  store.set(spec.repo.fullName, spec);
  n++;
}
store.flush();
console.log(`Seeded ${n} dungeons into ${cfg.cacheDir}`);
