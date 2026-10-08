import type { RepoSnapshot, ScannedFile, TreeEntry } from '../src/types.js';
import { scanContent } from '../src/scan.js';

export function makeTree(spec: Record<string, number>): TreeEntry[] {
  return Object.entries(spec).map(([path, size]) => ({ path, size }));
}

export function sampleSnapshot(overrides: Partial<RepoSnapshot> = {}): RepoSnapshot {
  const tree = makeTree({
    'README.md': 4000,
    'LICENSE': 1000,
    'CONTRIBUTING.md': 2000,
    'package.json': 900,
    'package-lock.json': 600_000,
    '.github/workflows/ci.yml': 800,
    'src/index.ts': 3000,
    'src/engine/core.ts': 180_000,
    'src/engine/physics.ts': 60_000,
    'src/engine/render.ts': 45_000,
    'src/engine/audio.ts': 12_000,
    'src/ui/button.tsx': 4000,
    'src/ui/modal.tsx': 9000,
    'src/ui/menu.tsx': 7000,
    'src/ui/theme.ts': 2500,
    'src/utils/strings.ts': 26_000,
    'src/utils/math.ts': 9000,
    'src/utils/legacy.js': 40_000,
    'tests/core.test.ts': 15_000,
    'tests/physics.test.ts': 9000,
    'docs/guide.md': 20_000,
    'docs/api.md': 30_000,
    'docs/img/logo.png': 50_000,
    'packages/cli/src/main.ts': 8000,
    'packages/cli/src/args.ts': 3000,
    'packages/cli/README.md': 1000,
    'packages/web/src/app.tsx': 22_000,
    'packages/web/src/store.ts': 7000,
    'dist/bundle.min.js': 900_000,
  });
  const scanned: ScannedFile[] = [
    scanContent(
      'src/engine/core.ts',
      [
        '// The core loop. Do not touch unless you know what you are doing!',
        'export function tick() {',
        '  // TODO: split this function, it is way too long',
        '  // FIXME(alice): race condition when two ticks overlap',
        '  const x = 1; // HACK: magic number until physics settles',
        '}',
        '// why does this work? nobody knows anymore',
        ...Array.from({ length: 5000 }, (_, i) => `const v${i} = ${i};`),
      ].join('\n'),
      { taunts: true },
    ),
    scanContent('src/utils/legacy.js', ['// TODO remove this file', 'var a = 1;', '// XXX: temporary workaround'].join('\n')),
    scanContent('src/ui/modal.tsx', ['/* TODO: focus trap */', 'export const Modal = () => null;'].join('\n')),
    scanContent('packages/web/src/app.tsx', ['// todo: wire up routing', 'export default 1;'].join('\n')),
  ];
  return {
    version: 1,
    source: 'github',
    owner: 'acme',
    name: 'rocket',
    description: 'A rocket-powered toy engine.',
    homepage: null,
    htmlUrl: 'https://github.com/acme/rocket',
    avatarUrl: 'https://avatars.githubusercontent.com/u/1?v=4',
    defaultBranch: 'main',
    sha: '0123456789abcdef0123456789abcdef01234567',
    stars: 12345,
    forks: 678,
    license: { spdx: 'MIT', name: 'MIT License' },
    createdAt: '2019-01-01T00:00:00Z',
    pushedAt: '2026-09-30T12:00:00Z',
    primaryLanguage: 'TypeScript',
    languages: { TypeScript: 400_000, JavaScript: 40_000, CSS: 5000 },
    tree,
    treeTruncated: false,
    scanned,
    contributors: [
      { login: 'alice', avatarUrl: null, contributions: 420, url: null },
      { login: 'bob', avatarUrl: null, contributions: 120, url: null },
      { login: 'carol', avatarUrl: null, contributions: 50, url: null },
    ],
    folderCommits: [
      { folder: 'src', author: 'alice', avatarUrl: null, message: 'Speed up the tick loop', date: '2026-09-01T00:00:00Z' },
      { folder: 'src', author: 'alice', avatarUrl: null, message: 'Fix physics', date: '2026-08-01T00:00:00Z' },
      { folder: 'docs', author: 'bob', avatarUrl: null, message: 'Docs: add API page', date: '2026-07-01T00:00:00Z' },
    ],
    branches: [
      { name: 'main', lastCommitDate: '2026-09-30T12:00:00Z' },
      { name: 'old-experiment', lastCommitDate: '2023-03-01T00:00:00Z' },
      { name: 'feature/fresh', lastCommitDate: '2026-09-20T00:00:00Z' },
      { name: 'wip/abandoned', lastCommitDate: '2024-01-01T00:00:00Z' },
    ],
    issues: [
      { number: 12, title: 'Engine crashes on resize', url: 'https://github.com/acme/rocket/issues/12', labels: ['bug'], comments: 9, createdAt: null },
      { number: 15, title: 'Docs typo in guide', url: 'https://github.com/acme/rocket/issues/15', labels: [], comments: 1, createdAt: null },
    ],
    openIssuesCount: 2,
    quests: [
      { number: 21, title: 'Add a dark theme to the ui', url: 'https://github.com/acme/rocket/issues/21', labels: ['good first issue'], comments: 0, createdAt: null },
    ],
    readmeExcerpt: '# Rocket\n\n![badge](x.svg)\n\nRocket is a tiny engine that makes toys go fast.\n',
    codeowners: null,
    fetchedAt: '2026-10-08T00:00:00Z',
    private: false,
    notes: [],
    ...overrides,
  };
}
