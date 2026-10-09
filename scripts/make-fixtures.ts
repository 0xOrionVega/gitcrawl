/**
 * Builds demo dungeons from real public repos using only git (no GitHub API):
 *   pnpm fixtures [owner/repo ...]
 * Output: apps/web/public/fixtures/<owner>__<name>.json + index.json
 *
 * Issues, quests and stars need the GitHub API, so fixture dungeons have no
 * ghosts or quest board; the live site fills those in.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { generateDungeon } from '../packages/shared/src/index.js';
import { localSnapshot } from '../packages/cli/src/local.js';

const DEFAULT_REPOS = [
  'facebook/react',
  'torvalds/linux',
  'vuejs/core',
  'pallets/flask',
  'BurntSushi/ripgrep',
  'junegunn/fzf',
  'bitcoin/bitcoin',
  'rails/rails',
  'ohmyzsh/ohmyzsh',
  'kelseyhightower/nocode',
];

const root = resolve(import.meta.dirname, '..');
const outDir = join(root, 'apps', 'web', 'public', 'fixtures');
const work = process.env.GITCRAWL_CLONE_DIR ?? join(root, '.cache', 'clones');
mkdirSync(outDir, { recursive: true });
mkdirSync(work, { recursive: true });

const repos = process.argv.slice(2).length > 0 ? process.argv.slice(2) : DEFAULT_REPOS;

function run(cwd: string, args: string[], timeoutMs = 600_000): string {
  return execFileSync('git', args, { cwd, timeout: timeoutMs, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 256 * 1024 * 1024 }).toString();
}

for (const full of repos) {
  const [owner, name] = full.split('/');
  const dir = join(work, `${owner}__${name}`);
  const started = Date.now();
  try {
    if (full === 'self') {
      // This repo itself.
      const snap = await localSnapshot(root, { owner: 'gitcrawl', name: 'gitcrawl', source: 'fixture' });
      write('gitcrawl', 'gitcrawl', snap);
      continue;
    }
    if (!existsSync(dir)) {
      const depth = owner === 'torvalds' ? '60' : '400';
      console.log(`[fixtures] cloning ${full}…`);
      run(work, ['clone', '-q', '--filter=blob:none', `--depth=${depth}`, '--no-tags', '--single-branch', `https://github.com/${full}.git`, dir], 1_800_000);
      // Fetch branch tips (commits only) so stale branches can become skeletons.
      try {
        const heads = run(dir, ['ls-remote', '--heads', 'origin'])
          .split('\n')
          .map((l) => l.split('\t')[1])
          .filter((r): r is string => !!r && r.startsWith('refs/heads/'))
          .slice(0, 40);
        const refspecs = heads.map((r) => `+${r}:refs/remotes/origin/${r.slice('refs/heads/'.length)}`);
        if (refspecs.length > 0) run(dir, ['fetch', '-q', '--depth=1', '--filter=tree:0', 'origin', ...refspecs], 300_000);
      } catch (err) {
        console.warn(`[fixtures] ${full}: could not fetch branch tips (${(err as Error).message.split('\n')[0]})`);
      }
    }
    const snap = await localSnapshot(dir, { owner, name, source: 'fixture', historyDepth: 400 });
    write(owner, name, snap);
    console.log(`[fixtures] ${full} done in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  } catch (err) {
    console.error(`[fixtures] ${full} failed: ${(err as Error).message}`);
  }
}

function write(owner: string, name: string, snap: Awaited<ReturnType<typeof localSnapshot>>) {
  // Fixtures come from public GitHub repos: point links at GitHub.
  snap.htmlUrl = `https://github.com/${owner}/${name}`;
  snap.avatarUrl = `https://github.com/${owner}.png?size=120`;
  snap.notes = snap.notes.filter((n) => !n.startsWith('Issues and quests'));
  snap.notes.push('Demo dungeon built from a git clone: issues, quests and stars appear on the live site.');
  const spec = generateDungeon(snap);
  const file = `${owner}__${name}.json`;
  writeFileSync(join(outDir, file), JSON.stringify(spec));
  console.log(
    `[fixtures] ${owner}/${name}: ${spec.stats.files} files, ${spec.rooms.length} rooms, ${spec.stats.todos} TODOs, boss ${spec.boss?.name ?? 'none'} (${spec.boss?.loc ?? 0} LOC), health ${spec.health.score} ${spec.health.grade}, "${spec.title.name}", ${Math.round(JSON.stringify(spec).length / 1024)} KB`,
  );
  rebuildIndex();
}

function rebuildIndex() {
  const entries = readdirSync(outDir)
    .filter((f) => f.endsWith('.json') && f !== 'index.json')
    .map((f) => {
      const spec = JSON.parse(readFileSync(join(outDir, f), 'utf8'));
      return {
        fullName: spec.repo.fullName,
        file: f,
        title: spec.title.name,
        theme: spec.theme,
        files: spec.stats.files,
        todos: spec.stats.todos,
        boss: spec.boss ? { name: spec.boss.name, loc: spec.boss.loc } : null,
        health: spec.health.score,
        grade: spec.health.grade,
        language: spec.repo.primaryLanguage,
      };
    })
    .sort((a, b) => a.fullName.localeCompare(b.fullName));
  writeFileSync(join(outDir, 'index.json'), JSON.stringify({ generatedAt: new Date().toISOString(), repos: entries }, null, 2));
}

if (process.env.GITCRAWL_KEEP_CLONES !== '1' && process.env.GITCRAWL_CLEAN_CLONES === '1') rmSync(work, { recursive: true, force: true });
