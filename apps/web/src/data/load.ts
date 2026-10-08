/**
 * Where dungeons come from, in order:
 *   1. bundled demo fixtures (static demo build)
 *   2. the gitcrawl API (cached, server token)
 *   3. the visitor's own browser, straight from the GitHub API (lite budget)
 */
import { fetchGithubSnapshot, generateDungeon, GithubError, type DungeonSpec, type RepoRef } from '@gitcrawl/shared';
import { API_BASE, DEMO } from '../config';

export interface FixtureIndexEntry {
  fullName: string;
  file: string;
  title: string;
  theme: string;
  files: number;
  todos: number;
  boss: { name: string; loc: number } | null;
  health: number;
  grade: string;
  language: string | null;
}

let fixtureIndex: Promise<FixtureIndexEntry[]> | null = null;

export function loadFixtureIndex(): Promise<FixtureIndexEntry[]> {
  if (!fixtureIndex) {
    fixtureIndex = fetch(new URL('fixtures/index.json', document.baseURI).href)
      .then((r) => (r.ok ? r.json() : { repos: [] }))
      .then((j: { repos: FixtureIndexEntry[] }) => j.repos ?? [])
      .catch(() => []);
  }
  return fixtureIndex;
}

export async function loadFixture(fullName: string): Promise<DungeonSpec | null> {
  const index = await loadFixtureIndex();
  const entry = index.find((e) => e.fullName.toLowerCase() === fullName.toLowerCase());
  if (!entry) return null;
  const res = await fetch(new URL(`fixtures/${entry.file}`, document.baseURI).href);
  if (!res.ok) return null;
  return (await res.json()) as DungeonSpec;
}

export class LoadError extends Error {
  constructor(
    message: string,
    readonly code: 'not_found' | 'rate_limited' | 'network' | 'other',
    readonly resetAt: number | null = null,
  ) {
    super(message);
  }
}

const cache = new Map<string, DungeonSpec>();

export async function loadDungeon(ref: RepoRef, onProgress: (step: string) => void, opts: { refresh?: boolean } = {}): Promise<DungeonSpec> {
  const key = `${ref.owner}/${ref.name}`.toLowerCase();
  if (!opts.refresh && cache.has(key)) return cache.get(key)!;

  // 1. Fixtures
  if (DEMO || !opts.refresh) {
    const fixture = await loadFixture(key).catch(() => null);
    if (fixture && (DEMO || API_BASE === null)) {
      onProgress('Unrolling the map…');
      cache.set(key, fixture);
      return fixture;
    }
  }

  // 2. API
  if (API_BASE !== null) {
    onProgress('Asking the dungeon master…');
    try {
      const res = await fetch(`${API_BASE}/api/dungeon/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.name)}${opts.refresh ? '?refresh=1' : ''}`);
      if (res.ok) {
        const spec = (await res.json()) as DungeonSpec;
        cache.set(key, spec);
        return spec;
      }
      if (res.status === 404) throw new LoadError(`Couldn't find ${ref.owner}/${ref.name}. Check the name, or it may be private.`, 'not_found');
      // 429/503: the server is busy or out of GitHub budget — build it in this browser instead.
    } catch (err) {
      if (err instanceof LoadError) throw err;
    }
  }

  // 3. Browser
  onProgress('Building it in your browser…');
  try {
    const { snapshot } = await fetchGithubSnapshot(ref.owner, ref.name, { mode: 'lite', onProgress });
    const spec = generateDungeon(snapshot);
    cache.set(key, spec);
    return spec;
  } catch (err) {
    if (err instanceof GithubError) {
      if (err.code === 'not_found') throw new LoadError(`Couldn't find ${ref.owner}/${ref.name}. Check the name, or it may be private.`, 'not_found');
      if (err.code === 'rate_limited') {
        throw new LoadError('GitHub is rate-limiting this browser. Try one of the ready-made dungeons, or come back in a bit.', 'rate_limited', err.resetAt);
      }
      if (err.code === 'network') throw new LoadError("Couldn't reach GitHub from this page.", 'network');
    }
    throw new LoadError(`Something went wrong building the dungeon: ${(err as Error).message}`, 'other');
  }
}

/** Dungeon served by the local CLI (gitcrawl-cli). */
export async function loadLocalDungeon(): Promise<DungeonSpec | null> {
  try {
    const res = await fetch(new URL('local/dungeon.json', document.baseURI).href);
    if (!res.ok) return null;
    return (await res.json()) as DungeonSpec;
  } catch {
    return null;
  }
}
