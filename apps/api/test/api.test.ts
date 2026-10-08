import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../src/server.js';
import { loadConfig } from '../src/config.js';
import { seal, unseal } from '../src/auth.js';

process.env.NODE_ENV = 'test';

const SHA = 'abcabcabcabcabcabcabcabcabcabcabcabcabca';

function fakeGithub(): { fetchImpl: typeof fetch; calls: string[] } {
  const calls: string[] = [];
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'x-ratelimit-remaining': '4900', 'x-ratelimit-limit': '5000', 'x-ratelimit-reset': '1999999999' } });
  const fetchImpl = (async (input: RequestInfo | URL) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    calls.push(url.pathname);
    const p = url.pathname;
    if (url.host === 'raw.githubusercontent.com') return new Response('// TODO: tame this\n// Here be dragons, careful with this loop!\nexport const x = 1;\n');
    if (p === '/repos/demo/thing') {
      return json({
        name: 'thing',
        owner: { login: 'demo', avatar_url: 'https://avatars.githubusercontent.com/u/1' },
        description: 'Demo',
        html_url: 'https://github.com/demo/thing',
        default_branch: 'main',
        stargazers_count: 7,
        forks_count: 1,
        license: { spdx_id: 'MIT', name: 'MIT License' },
        pushed_at: '2026-09-01T00:00:00Z',
        language: 'TypeScript',
        has_issues: true,
      });
    }
    if (p === '/repos/demo/thing/commits/main') return new Response(SHA);
    if (p.startsWith('/repos/demo/thing/git/trees/')) {
      return json({
        sha: 't',
        truncated: false,
        tree: [
          { path: 'README.md', type: 'blob', sha: '1', size: 100 },
          { path: 'src/big.ts', type: 'blob', sha: '2', size: 60_000 },
          { path: 'src/small.ts', type: 'blob', sha: '3', size: 3000 },
          { path: 'test/big.test.ts', type: 'blob', sha: '4', size: 9000 },
        ],
      });
    }
    if (p === '/repos/demo/thing/languages') return json({ TypeScript: 70000 });
    if (p === '/repos/demo/thing/contributors') return json([{ login: 'alice', contributions: 3, type: 'User' }]);
    if (p === '/repos/demo/thing/issues') return json([]);
    if (p === '/repos/demo/thing/branches') return json([{ name: 'main', commit: { sha: SHA } }]);
    if (p === '/repos/demo/thing/commits') return json([]);
    return json({ message: 'Not Found' }, 404);
  }) as typeof fetch;
  return { fetchImpl, calls };
}

let dir: string;
let app: FastifyInstance;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'gitcrawl-api-'));
  const web = join(dir, 'web');
  mkdirSync(web);
  writeFileSync(
    join(web, 'index.html'),
    '<html><head><title>x</title><!--gitcrawl:meta--><meta property="og:title" content="gitcrawl" /><!--/gitcrawl:meta--></head><body></body></html>',
  );
  const cfg = loadConfig({
    CACHE_DIR: join(dir, 'cache'),
    WEB_DIST: web,
    GITHUB_TOKEN: 'test-token',
    SITE_URL: 'https://gitcrawl.test',
    GENERATE_PER_HOUR: '2',
  } as NodeJS.ProcessEnv);
  app = await buildServer(cfg, { fetchImpl: fakeGithub().fetchImpl });
});

afterAll(async () => {
  await app.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('gitcrawl API', () => {
  it('generates, caches and serves dungeons', async () => {
    const first = await app.inject({ method: 'GET', url: '/api/dungeon/demo/thing' });
    expect(first.statusCode).toBe(200);
    expect(first.headers['x-gitcrawl-cache']).toBe('miss');
    const spec = first.json();
    expect(spec.repo.fullName).toBe('demo/thing');
    expect(spec.boss.name).toBe('big.ts');
    const second = await app.inject({ method: 'GET', url: '/api/dungeon/Demo/Thing' });
    expect(second.statusCode).toBe(200);
    expect(second.headers['x-gitcrawl-cache']).toBe('hit');
  });

  it('returns 404 for missing repos and limits uncached generations per IP', async () => {
    const missing = await app.inject({ method: 'GET', url: '/api/dungeon/nobody/nothing' });
    expect(missing.statusCode).toBe(404);
    const limited = await app.inject({ method: 'GET', url: '/api/dungeon/nobody/else' });
    expect(limited.statusCode).toBe(429);
    expect(limited.json().fallback).toBe('browser');
  });

  it('accepts valid runs and ranks them', async () => {
    const spec = (await app.inject({ method: 'GET', url: '/api/dungeon/demo/thing' })).json();
    const bad = await app.inject({ method: 'POST', url: '/api/runs/demo/thing', payload: { nickname: '<script>', timeMs: 60000, seed: spec.seed } });
    expect(bad.statusCode).toBe(400);
    const tooFast = await app.inject({ method: 'POST', url: '/api/runs/demo/thing', payload: { nickname: 'oleg', timeMs: 100, seed: spec.seed } });
    expect(tooFast.statusCode).toBe(400);
    const wrongSeed = await app.inject({ method: 'POST', url: '/api/runs/demo/thing', payload: { nickname: 'oleg', timeMs: 60000, seed: 1 } });
    expect(wrongSeed.statusCode).toBe(409);
    const ok = await app.inject({ method: 'POST', url: '/api/runs/demo/thing', payload: { nickname: 'oleg', timeMs: 60000, goblins: 4, deaths: 1, seed: spec.seed } });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().rank).toBe(1);
    const faster = await app.inject({ method: 'POST', url: '/api/runs/demo/thing', payload: { nickname: 'speedy', timeMs: 30000, goblins: 1, deaths: 0, seed: spec.seed } });
    expect(faster.json().rank).toBe(1);
    const board = (await app.inject({ method: 'GET', url: '/api/leaderboard/demo/thing' })).json();
    expect(board.entries.map((e: { nickname: string }) => e.nickname)).toEqual(['speedy', 'oleg']);
  });

  it('renders badges, share images and the hall', async () => {
    const badge = await app.inject({ method: 'GET', url: '/badge/demo/thing.svg' });
    expect(badge.headers['content-type']).toContain('image/svg+xml');
    expect(badge.body).toContain('health');
    const unknown = await app.inject({ method: 'GET', url: '/badge/some/one.svg' });
    expect(unknown.body).toContain('play this repo');
    const og = await app.inject({ method: 'GET', url: '/og/demo/thing.png' });
    expect(og.statusCode).toBe(200);
    expect(og.rawPayload.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    const hall = (await app.inject({ method: 'GET', url: '/api/hall' })).json();
    expect(hall.biggestBosses[0].fullName).toBe('demo/thing');
    const daily = (await app.inject({ method: 'GET', url: '/api/daily' })).json();
    expect(daily.repo).toMatch(/\//);
  });

  it('serves the web app with per-repo link previews', async () => {
    const page = await app.inject({ method: 'GET', url: '/r/demo/thing' });
    expect(page.statusCode).toBe(200);
    expect(page.body).toContain('og:image" content="https://gitcrawl.test/og/demo/thing.png"');
    expect(page.body).toContain('demo/thing as a dungeon');
    const home = await app.inject({ method: 'GET', url: '/' });
    expect(home.body).toContain('og:image" content="https://gitcrawl.test/og/default.png"');
    const asset = await app.inject({ method: 'GET', url: '/missing.js' });
    expect(asset.statusCode).toBe(404);
  });

  it('keeps private-repo auth disabled without config, and seals sessions', async () => {
    const status = (await app.inject({ method: 'GET', url: '/auth/status' })).json();
    expect(status.enabled).toBe(false);
    const sealed = seal({ token: 'x', login: 'oleg' }, 'secret');
    expect(unseal<{ login: string }>(sealed, 'secret')?.login).toBe('oleg');
    expect(unseal(sealed, 'other-secret')).toBeNull();
  });
});
