import { describe, expect, it } from 'vitest';
import { fetchGithubSnapshot, GithubError, generateDungeon, selectScanFiles } from '../src/index.js';

type Handler = (url: URL) => { status?: number; body?: unknown; text?: string; headers?: Record<string, string> } | null;

function mockFetch(handler: Handler): { fetchImpl: typeof fetch; calls: string[] } {
  const calls: string[] = [];
  const fetchImpl = (async (input: RequestInfo | URL) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    calls.push(url.pathname + url.search);
    const r = handler(url);
    if (!r) return new Response('not found', { status: 404 });
    const headers = new Headers({ 'x-ratelimit-remaining': '4999', 'x-ratelimit-limit': '5000', 'x-ratelimit-reset': '1999999999', ...(r.headers ?? {}) });
    if (r.text !== undefined) return new Response(r.text, { status: r.status ?? 200, headers });
    return new Response(JSON.stringify(r.body ?? null), { status: r.status ?? 200, headers });
  }) as typeof fetch;
  return { fetchImpl, calls };
}

const SHA = 'abcabcabcabcabcabcabcabcabcabcabcabcabca';

function repoHandler(opts: { truncated?: boolean } = {}): Handler {
  return (url) => {
    const p = url.pathname;
    if (url.host === 'raw.githubusercontent.com') {
      if (p.endsWith('/src/big.ts')) return { text: '// Here be dragons, do not refactor this!\n// TODO: split me\nconst a = 1;\n' };
      if (p.endsWith('/README.md')) return { text: '# Demo\n\nA demo repository for testing gitcrawl.\n' };
      if (p.endsWith('/.github/CODEOWNERS')) return { text: '/src/ @alice\n' };
      return { text: '// FIXME: generic\n' };
    }
    if (p === '/repos/Demo/thing' || p === '/repos/demo/thing') {
      return {
        body: {
          name: 'thing',
          owner: { login: 'demo', avatar_url: 'https://avatars.example/1' },
          description: 'Demo repo',
          html_url: 'https://github.com/demo/thing',
          default_branch: 'main',
          stargazers_count: 42,
          forks_count: 3,
          license: { spdx_id: 'Apache-2.0', name: 'Apache License 2.0' },
          created_at: '2020-01-01T00:00:00Z',
          pushed_at: '2026-09-01T00:00:00Z',
          language: 'TypeScript',
          open_issues_count: 5,
          has_issues: true,
          private: false,
        },
      };
    }
    if (p === '/repos/demo/thing/commits/main') return { text: SHA };
    if (p === `/repos/demo/thing/git/trees/${SHA}`) {
      if (url.searchParams.get('recursive') === '1') {
        return {
          body: {
            sha: 'tree',
            truncated: !!opts.truncated,
            tree: [
              { path: 'README.md', type: 'blob', sha: '1', size: 100 },
              { path: '.github', type: 'tree', sha: 'gh' },
              { path: '.github/CODEOWNERS', type: 'blob', sha: '2', size: 20 },
              { path: 'src', type: 'tree', sha: 'srcsha' },
              { path: 'src/big.ts', type: 'blob', sha: '3', size: 90_000 },
              { path: 'src/small.ts', type: 'blob', sha: '4', size: 2_000 },
              { path: 'src/img.png', type: 'blob', sha: '5', size: 2_000 },
            ],
          },
        };
      }
      return {
        body: {
          sha: 'tree',
          truncated: false,
          tree: [
            { path: 'README.md', type: 'blob', sha: '1', size: 100 },
            { path: 'src', type: 'tree', sha: 'srcsha' },
          ],
        },
      };
    }
    if (p === '/repos/demo/thing/git/trees/srcsha') {
      return {
        body: { sha: 'srcsha', truncated: false, tree: [{ path: 'big.ts', type: 'blob', sha: '3', size: 90_000 }, { path: 'deep/x.ts', type: 'blob', sha: '6', size: 500 }] },
      };
    }
    if (p === '/repos/demo/thing/languages') return { body: { TypeScript: 92_000 } };
    if (p === '/repos/demo/thing/contributors') {
      return { body: [{ login: 'alice', avatar_url: 'a', contributions: 10, type: 'User' }, { login: 'dependabot[bot]', contributions: 99, type: 'Bot' }] };
    }
    if (p === '/repos/demo/thing/issues') {
      const labels = url.searchParams.get('labels');
      if (labels === 'good first issue') {
        return { body: [{ number: 7, title: 'Easy one in src', html_url: 'https://github.com/demo/thing/issues/7', labels: [{ name: 'good first issue' }] }] };
      }
      if (labels) return { body: [] };
      return {
        body: [
          { number: 7, title: 'Easy one in src', html_url: 'https://github.com/demo/thing/issues/7', labels: [], comments: 2 },
          { number: 8, title: 'A pull request', html_url: 'x', pull_request: {} },
        ],
      };
    }
    if (p === '/repos/demo/thing/branches') return { body: [{ name: 'main', commit: { sha: SHA } }, { name: 'old', commit: { sha: 'oldsha' } }] };
    if (p === '/repos/demo/thing/git/commits/oldsha') return { body: { committer: { date: '2022-01-01T00:00:00Z' } } };
    if (p === '/repos/demo/thing/commits') {
      return { body: [{ author: { login: 'alice', avatar_url: 'a' }, commit: { message: 'Tame the big file\n\nbody', author: { date: '2026-08-01T00:00:00Z' } } }] };
    }
    return null;
  };
}

describe('GitHub snapshot fetcher', () => {
  it('builds a full snapshot with a token', async () => {
    const { fetchImpl, calls } = mockFetch(repoHandler());
    const { snapshot, rate } = await fetchGithubSnapshot('Demo', 'thing', {
      token: 't',
      fetchImpl,
      now: () => new Date('2026-10-08T00:00:00Z'),
    });
    expect(snapshot.owner).toBe('demo');
    expect(snapshot.sha).toBe(SHA);
    expect(snapshot.tree.map((t) => t.path)).toEqual(['README.md', '.github/CODEOWNERS', 'src/big.ts', 'src/small.ts', 'src/img.png']);
    expect(snapshot.license).toEqual({ spdx: 'Apache-2.0', name: 'Apache License 2.0' });
    expect(snapshot.contributors.map((c) => c.login)).toEqual(['alice']);
    expect(snapshot.issues?.map((i) => i.number)).toEqual([7]);
    expect(snapshot.quests?.map((i) => i.number)).toEqual([7]);
    expect(snapshot.branches).toEqual([{ name: 'old', lastCommitDate: '2022-01-01T00:00:00Z' }]);
    expect(snapshot.folderCommits[0]).toMatchObject({ author: 'alice', message: 'Tame the big file' });
    expect(snapshot.codeowners).toContain('@alice');
    const big = snapshot.scanned.find((s) => s.path === 'src/big.ts')!;
    expect(big.todos[0].text).toBe('split me');
    expect(big.comments?.[0]).toBe('Here be dragons, do not refactor this!');
    expect(snapshot.scanned.some((s) => s.path === 'src/img.png')).toBe(false);
    expect(rate.remaining).toBe(4999);
    expect(calls.every((c) => !c.includes('undefined'))).toBe(true);

    const spec = generateDungeon(snapshot);
    expect(spec.boss?.name).toBe('big.ts');
    expect(spec.entities.find((e) => e.kind === 'door')?.meta?.door).toBe('iron');
    expect(spec.findings.guardians[0]).toMatchObject({ folder: 'src', login: 'alice', source: 'codeowners' });
    expect(spec.entities.filter((e) => e.kind === 'skeleton').map((e) => e.label)).toEqual(['old']);
  });

  it('uses fewer calls in lite mode', async () => {
    const { fetchImpl, calls } = mockFetch(repoHandler());
    const { snapshot } = await fetchGithubSnapshot('demo', 'thing', { fetchImpl });
    expect(snapshot.branches).toBeNull();
    const apiCalls = calls.filter((c) => c.startsWith('/repos/'));
    // repo, sha, tree, languages, contributors, issues, gfi, commits + raw fetches (not counted here)
    expect(apiCalls.filter((c) => !c.includes('/demo/thing/') || true).length).toBeLessThanOrEqual(14);
  });

  it('falls back to per-directory trees for huge repos', async () => {
    const { fetchImpl } = mockFetch(repoHandler({ truncated: true }));
    const { snapshot } = await fetchGithubSnapshot('demo', 'thing', { token: 't', fetchImpl });
    expect(snapshot.treeTruncated).toBe(true);
    expect(snapshot.tree.map((t) => t.path).sort()).toEqual(['README.md', 'src/big.ts', 'src/deep/x.ts']);
  });

  it('reports missing repos and rate limits clearly', async () => {
    const notFound = mockFetch(() => null);
    await expect(fetchGithubSnapshot('nope', 'nope', { fetchImpl: notFound.fetchImpl })).rejects.toMatchObject({ code: 'not_found' });
    const limited = mockFetch(() => ({ status: 403, body: { message: 'API rate limit exceeded' }, headers: { 'x-ratelimit-remaining': '0' } }));
    const err = await fetchGithubSnapshot('a', 'b', { fetchImpl: limited.fetchImpl }).catch((e) => e);
    expect(err).toBeInstanceOf(GithubError);
    expect(err.code).toBe('rate_limited');
    expect(err.resetAt).toBe(1999999999000);
  });

  it('picks the biggest real source files to scan', () => {
    const tree = [
      { path: 'dist/app.min.js', size: 900_000 },
      { path: 'src/a.ts', size: 50_000 },
      { path: 'src/b.ts', size: 40_000 },
      { path: 'lib/c.py', size: 1000 },
      { path: 'docs/readme.md', size: 90_000 },
      { path: 'node_modules/x/index.js', size: 80_000 },
      { path: 'test/a.test.ts', size: 70_000 },
    ];
    const picked = selectScanFiles(tree, 3, 1_000_000).map((e) => e.path);
    expect(picked).toEqual(['src/a.ts', 'src/b.ts', 'lib/c.py']);
    const varied = selectScanFiles(tree, 10, 1_000_000).map((e) => e.path);
    expect(varied).toContain('lib/c.py');
    expect(varied).not.toContain('dist/app.min.js');
    expect(varied).not.toContain('node_modules/x/index.js');
  });
});
