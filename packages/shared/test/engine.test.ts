import { describe, expect, it } from 'vitest';
import {
  extractTaunts,
  extractTodos,
  generateDungeon,
  hilbertD2XY,
  parseRepoInput,
  reportMarkdown,
  summarizeReadme,
  type DungeonSpec,
} from '../src/index.js';
import { sampleSnapshot, makeTree } from './fixtures.js';

const WALKABLE = new Set(['.', ',']);

function tileAt(spec: DungeonSpec, x: number, y: number): string {
  if (x < 0 || y < 0 || x >= spec.map.width || y >= spec.map.height) return ' ';
  return spec.map.tiles[y * spec.map.width + x];
}

/** BFS over walkable tiles; optional blocked tiles (closed doors). */
function reachable(spec: DungeonSpec, blocked: Set<number> = new Set()): Set<number> {
  const W = spec.map.width;
  const seen = new Set<number>();
  const start = spec.spawn.y * W + spec.spawn.x;
  const queue = [start];
  seen.add(start);
  while (queue.length) {
    const cur = queue.pop()!;
    const x = cur % W;
    const y = Math.floor(cur / W);
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nx = x + dx;
      const ny = y + dy;
      const idx = ny * W + nx;
      if (seen.has(idx) || blocked.has(idx)) continue;
      if (!WALKABLE.has(tileAt(spec, nx, ny))) continue;
      seen.add(idx);
      queue.push(idx);
    }
  }
  return seen;
}

describe('hilbert curve', () => {
  it('visits grid-adjacent cells consecutively', () => {
    for (const n of [2, 4, 8, 16]) {
      for (let d = 0; d + 1 < n * n; d++) {
        const a = hilbertD2XY(n, d);
        const b = hilbertD2XY(n, d + 1);
        expect(Math.abs(a.x - b.x) + Math.abs(a.y - b.y)).toBe(1);
      }
    }
  });
});

describe('TODO extraction', () => {
  it('finds TODOs in many comment styles', () => {
    const src = [
      '// TODO: fix the thing',
      '# FIXME broken on windows',
      '/* HACK: temporary */',
      ' * TODO(bob): refactor',
      '-- TODO: sql comment',
      'x = 1  # todo: lowercase with colon',
      '<!-- TODO: html comment -->',
      'const TODO = 1;',
      'status = "TODO"',
      'BUG_ON(x);',
      '// XXX maybe',
      '// XXX: real one',
      '// TODOs are fun',
    ].join('\n');
    const todos = extractTodos('a.ts', src);
    expect(todos.map((t) => [t.line, t.kind, t.text])).toEqual([
      [1, 'TODO', 'fix the thing'],
      [2, 'FIXME', 'broken on windows'],
      [3, 'HACK', 'temporary'],
      [4, 'TODO', 'refactor'],
      [5, 'TODO', 'sql comment'],
      [6, 'TODO', 'lowercase with colon'],
      [7, 'TODO', 'html comment'],
      [12, 'XXX', 'real one'],
    ]);
    expect(todos[3].owner).toBe('bob');
  });

  it('mines spicy comments for boss taunts', () => {
    const src = [
      '// Copyright 2020 Someone',
      '// eslint-disable-next-line',
      '// Here be dragons: do not change the order of these calls!',
      '// increments the counter',
      '// return x + 1;',
      '/**',
      ' * @param x the value',
      ' * Unfortunately this has to stay synchronous for now.',
      ' */',
    ].join('\n');
    const taunts = extractTaunts(src);
    expect(taunts[0]).toBe('Here be dragons: do not change the order of these calls!');
    expect(taunts).toContain('Unfortunately this has to stay synchronous for now.');
    expect(taunts.some((t) => /copyright|eslint|@param|return x/i.test(t))).toBe(false);
  });
});

describe('repo input parsing', () => {
  it.each([
    ['facebook/react', 'facebook', 'react'],
    ['https://github.com/facebook/react', 'facebook', 'react'],
    ['github.com/torvalds/linux/tree/master/kernel', 'torvalds', 'linux'],
    ['git@github.com:vuejs/core.git', 'vuejs', 'core'],
    ['https://github.com/owner/repo.name.git?x=1', 'owner', 'repo.name'],
  ])('%s', (input, owner, name) => {
    expect(parseRepoInput(input)).toEqual({ owner, name });
  });

  it('rejects junk', () => {
    expect(parseRepoInput('')).toBeNull();
    expect(parseRepoInput('justone')).toBeNull();
    expect(parseRepoInput('bad owner/x')).toBeNull();
    expect(parseRepoInput('a/..')).toBeNull();
  });
});

describe('dungeon generation', () => {
  const snap = sampleSnapshot();
  const spec = generateDungeon(snap);

  it('is deterministic for the same repo state', () => {
    expect(JSON.stringify(generateDungeon(sampleSnapshot()))).toBe(JSON.stringify(spec));
  });

  it('changes when the commit changes', () => {
    const other = generateDungeon(sampleSnapshot({ sha: 'ffffffffffffffffffffffffffffffffffffffff' }));
    expect(other.map.tiles).not.toBe(spec.map.tiles);
  });

  it('produces a well-formed map', () => {
    expect(spec.map.tiles.length).toBe(spec.map.width * spec.map.height);
    expect(tileAt(spec, spec.spawn.x, spec.spawn.y)).toBe('.');
    // Walls fully enclose walkable tiles: no walkable tile touches void.
    for (let y = 0; y < spec.map.height; y++) {
      for (let x = 0; x < spec.map.width; x++) {
        const t = tileAt(spec, x, y);
        if (t === '.' || t === ',' || t === 'o') {
          for (const [dx, dy] of [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ]) {
            expect(tileAt(spec, x + dx, y + dy)).not.toBe(' ');
          }
        }
      }
    }
  });

  it('connects every room to the entrance', () => {
    const seen = reachable(spec);
    for (const room of spec.rooms) {
      const cx = room.rect.x + Math.floor(room.rect.w / 2);
      const cy = room.rect.y + 1;
      expect(seen.has(cy * spec.map.width + cx), `room ${room.label}`).toBe(true);
    }
  });

  it('puts the treasury behind the license door', () => {
    const treasury = spec.rooms.find((r) => r.kind === 'treasury')!;
    const door = spec.entities.find((e) => e.kind === 'door')!;
    expect(door).toBeTruthy();
    expect(door.meta?.door).toBe('wooden');
    const W = spec.map.width;
    const blocked = new Set<number>();
    const vertical = door.meta?.orientation === 'v';
    for (let i = -1; i <= 1; i++) {
      blocked.add(vertical ? (door.y + i) * W + door.x : door.y * W + door.x + i);
    }
    const seen = reachable(spec, blocked);
    const inside = (treasury.rect.y + 1) * W + treasury.rect.x + 1;
    expect(seen.has(inside)).toBe(false);
  });

  it('places entities on walkable tiles inside their room', () => {
    for (const e of spec.entities) {
      if (['torch', 'banner'].includes(e.kind)) {
        expect(tileAt(spec, e.x, e.y)).toBe('#');
        continue;
      }
      if (e.kind === 'door') {
        expect(tileAt(spec, e.x, e.y)).toBe(',');
        continue;
      }
      if (e.kind === 'pit') continue;
      expect(['.', ','], `${e.kind} at ${e.x},${e.y}`).toContain(tileAt(spec, e.x, e.y));
      const room = spec.rooms.find((r) => r.id === e.room)!;
      expect(e.x >= room.rect.x && e.x < room.rect.x + room.rect.w && e.y >= room.rect.y && e.y < room.rect.y + room.rect.h).toBe(true);
    }
  });

  it('maps real repo facts to monsters', () => {
    expect(spec.boss?.name).toBe('core.ts');
    expect(spec.boss?.loc).toBeGreaterThan(5000);
    expect(spec.boss?.taunts[0]).toMatch(/Do not touch|nobody knows/);
    const goblins = spec.entities.filter((e) => e.kind === 'goblin');
    expect(goblins.length).toBe(spec.stats.todosInDungeon);
    expect(goblins.some((g) => g.text === 'race condition when two ticks overlap')).toBe(true);
    expect(goblins.every((g) => g.url?.startsWith('https://github.com/acme/rocket/blob/0123456789abcdef'))).toBe(true);
    expect(spec.entities.filter((e) => e.kind === 'ghost').length).toBe(2);
    expect(spec.entities.filter((e) => e.kind === 'skeleton').map((e) => e.label).sort()).toEqual(['old-experiment', 'wip/abandoned']);
    expect(spec.entities.some((e) => e.kind === 'shrine')).toBe(true);
    expect(spec.entities.some((e) => e.kind === 'pit')).toBe(true);
    expect(spec.entities.some((e) => e.kind === 'questboard')).toBe(true);
    expect(spec.findings.quests?.[0].number).toBe(21);
    expect(spec.rooms.some((r) => r.folder === 'dist')).toBe(false);
    expect(spec.findings.bigFiles.some((f) => f.path.startsWith('dist/'))).toBe(false);
    const npcs = spec.entities.filter((e) => e.kind === 'npc').map((e) => e.label);
    expect(npcs).toContain('@alice');
  });

  it('scores repo health', () => {
    expect(spec.health.score).toBeGreaterThan(70);
    const cursed = generateDungeon(
      sampleSnapshot({
        license: null,
        tree: makeTree({ 'main.py': 50_000, 'lib/util.py': 9000, 'lib/more.py': 4000 }),
        scanned: [],
        pushedAt: '2021-01-01T00:00:00Z',
      }),
    );
    const ids = cursed.health.deductions.map((d) => d.id);
    expect(ids).toEqual(expect.arrayContaining(['no_license', 'no_tests', 'no_readme', 'no_ci', 'abandoned']));
    expect(cursed.health.grade).toBe('F');
    expect(cursed.title.id).toBe('abandoned');
    const door = cursed.entities.find((e) => e.kind === 'door');
    expect(door?.meta?.door).toBe('cursed');
    expect(door?.meta?.opens).toBe(false);
  });

  it('handles a repo with no code at all', () => {
    const empty = generateDungeon(sampleSnapshot({ tree: makeTree({ 'README.md': 300 }), scanned: [], languages: {} }));
    expect(empty.boss).toBeNull();
    expect(empty.entities.some((e) => e.kind === 'throne')).toBe(true);
    expect(empty.title.id).toBe('empty');
    expect(reachable(empty).size).toBeGreaterThan(10);
  });

  it('handles big repos within the room budget', () => {
    const tree: Record<string, number> = {};
    for (let i = 0; i < 60; i++) for (let j = 0; j < 12; j++) for (let k = 0; k < 6; k++) tree[`mod${i}/sub${j}/f${k}.c`] = 2000 + i * 10 + k;
    const big = generateDungeon(sampleSnapshot({ tree: makeTree(tree), scanned: [], languages: { C: 1 }, primaryLanguage: 'C' }));
    expect(big.rooms.filter((r) => r.kind === 'folder').length).toBeLessThanOrEqual(28);
    const seen = reachable(big);
    for (const room of big.rooms) {
      expect(seen.has((room.rect.y + 1) * big.map.width + room.rect.x + Math.floor(room.rect.w / 2))).toBe(true);
    }
    expect(big.theme).toBe('iron');
  });

  it('writes a markdown loot report', () => {
    const md = reportMarkdown(spec);
    expect(md).toContain('## gitcrawl loot report: acme/rocket');
    expect(md).toContain('Goblin log');
    expect(md).toContain('core.ts');
    expect(md).toContain('old-experiment');
  });

  it('summarizes READMEs without badges', () => {
    expect(summarizeReadme(sampleSnapshot().readmeExcerpt, null)).toBe('Rocket — Rocket is a tiny engine that makes toys go fast.');
  });
});
