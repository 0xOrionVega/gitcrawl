import { describe, expect, it } from 'vitest';
import { extractTodos } from '@gitcrawl/shared';
import { alive, createRaid, cursorMoved, shiftLines, STATS, step, swing, syncTodos, tick, todoColumn, WAKE_RANGE, WINDUP, type Board } from '../src/game.js';

const board = (lines: string[]): Board => ({ lineCount: lines.length, lineLength: (l) => lines[l]?.length ?? 0 });

function file(n: number, todos: Record<number, string>): string[] {
  return Array.from({ length: n }, (_, i) => todos[i] ?? `const line${i} = ${i}; // plain code here`);
}

function raidOf(lines: string[], hearts = 5) {
  return createRaid(extractTodos('a.ts', lines.join('\n')), lines, hearts);
}

describe('createRaid', () => {
  it('turns each TODO-style comment into the matching monster on the keyword', () => {
    const lines = file(10, { 2: '  // TODO: split this', 5: '// FIXME broken on windows', 7: '# HACK: sleep(1)' });
    const raid = raidOf(lines);
    expect(raid.monsters.map((m) => [m.kind, m.pos.line, m.pos.col])).toEqual([
      ['goblin', 2, 5],
      ['skeleton', 5, 3],
      ['slime', 7, 2],
    ]);
    expect(raid.monsters[1].hp).toBe(STATS.skeleton.hp);
  });

  it('finds the keyword column regardless of case', () => {
    expect(todoColumn('x(); // todo: later', 'TODO')).toBe(8);
  });
});

describe('tick', () => {
  it('wakes monsters near the cursor and leaves far ones asleep', () => {
    const lines = file(60, { 5: '// TODO near', 50: '// TODO far' });
    const raid = raidOf(lines);
    const events = tick(raid, board(lines), { line: 0, col: 0 }, 0);
    expect(events.map((e) => e.type)).toEqual(['spotted']);
    expect(raid.monsters[0].awake).toBe(true);
    expect(raid.monsters[1].awake).toBe(false);
    expect(Math.abs(raid.monsters[1].pos.line - 0)).toBeGreaterThan(WAKE_RANGE);
  });

  it('walks an awake monster toward the cursor one line per step', () => {
    const lines = file(20, { 10: '// TODO: chase' });
    const raid = raidOf(lines);
    const b = board(lines);
    const cursor = { line: 2, col: 4 };
    tick(raid, b, cursor, 0);
    let now = 0;
    for (let i = 0; i < 3; i++) {
      now += STATS.goblin.step;
      tick(raid, b, cursor, now);
    }
    expect(raid.monsters[0].pos.line).toBe(7);
  });

  it('winds up when it reaches the cursor, then bites if you stay', () => {
    const lines = file(20, { 4: '// TODO: bite' });
    const raid = raidOf(lines);
    const b = board(lines);
    const m = raid.monsters[0];
    const cursor = { line: 4, col: 3 };
    m.awake = true;
    m.pos = { line: 4, col: 4 };
    expect(tick(raid, b, cursor, 1000).map((e) => e.type)).toEqual(['windup']);
    expect(raid.hearts).toBe(5);
    expect(tick(raid, b, cursor, 1000 + WINDUP - 1)).toEqual([]);
    expect(tick(raid, b, cursor, 1000 + WINDUP).map((e) => e.type)).toEqual(['hurt']);
    expect(raid.hearts).toBe(4);
    expect(m.pos.line).not.toBe(4);
  });

  it('misses the bite when the cursor moves away during the wind-up', () => {
    const lines = file(20, { 4: '// TODO: bite' });
    const raid = raidOf(lines);
    const b = board(lines);
    const m = raid.monsters[0];
    m.awake = true;
    m.pos = { line: 4, col: 4 };
    tick(raid, b, { line: 4, col: 3 }, 0);
    expect(tick(raid, b, { line: 6, col: 3 }, WINDUP)).toEqual([]);
    expect(raid.hearts).toBe(5);
  });

  it('ends the raid when the hearts run out', () => {
    const lines = file(20, { 4: '// TODO: bite' });
    const raid = raidOf(lines, 1);
    const m = raid.monsters[0];
    m.awake = true;
    m.pos = { line: 4, col: 0 };
    const cursor = { line: 4, col: 1 };
    tick(raid, board(lines), cursor, 0);
    const events = tick(raid, board(lines), cursor, WINDUP);
    expect(events.map((e) => e.type)).toEqual(['hurt', 'lost']);
    expect(raid.over).toBe('lost');
  });
});

describe('swing', () => {
  it('hits everything within a line and a few columns, and nothing further', () => {
    const lines = file(20, { 5: '// TODO: above', 6: '// FIXME: same line', 9: '// TODO: far' });
    const raid = raidOf(lines);
    const [above, same, far] = raid.monsters;
    const events = swing(raid, board(lines), { line: 6, col: 8 }, 0);
    expect(events.map((e) => e.type)).toEqual(['swing', 'hit', 'hit']);
    expect([above.hp, same.hp, far.hp]).toEqual([1, 2, 2]);
  });

  it('cancels a wind-up and needs a moment between swings', () => {
    const lines = file(20, { 6: '// FIXME: winding' });
    const raid = raidOf(lines);
    const b = board(lines);
    const m = raid.monsters[0];
    m.awake = true;
    tick(raid, b, { line: 6, col: 4 }, 0);
    expect(m.windupUntil).toBeGreaterThan(0);
    swing(raid, b, { line: 6, col: 4 }, 10);
    expect(m.windupUntil).toBe(0);
    m.stunUntil = 0;
    expect(swing(raid, b, { line: 6, col: 4 }, 100)).toEqual([]);
  });

  it('can miss', () => {
    const lines = file(20, { 2: '// TODO: over here' });
    const raid = raidOf(lines);
    expect(swing(raid, board(lines), { line: 12, col: 0 }, 0)).toEqual([{ type: 'swing', hits: 0 }]);
  });
});

describe('cursorMoved', () => {
  it('hits a monster the cursor lands on, and slays it after enough hits', () => {
    const lines = file(20, { 8: '// TODO: hit me' });
    const raid = raidOf(lines);
    const b = board(lines);
    const m = raid.monsters[0];
    expect(cursorMoved(raid, b, { line: 8, col: 4 }, 0).map((e) => e.type)).toEqual(['hit']);
    expect(m.hp).toBe(1);
    // Stunned: hitting again too soon does nothing.
    m.pos = { line: 8, col: 3 };
    expect(cursorMoved(raid, b, { line: 8, col: 4 }, 100)).toEqual([]);
    expect(cursorMoved(raid, b, { line: 8, col: 4 }, 5000).map((e) => e.type)).toEqual(['slain', 'won']);
    expect(raid.slain).toBe(1);
  });

  it('ignores monsters on other lines', () => {
    const lines = file(20, { 8: '// TODO: not here' });
    const raid = raidOf(lines);
    expect(cursorMoved(raid, board(lines), { line: 9, col: 3 }, 0)).toEqual([]);
  });
});

describe('step', () => {
  it('closes the line gap first and stays inside short lines', () => {
    const lines = ['a', 'abcdefghij', 'abcdefghij'];
    expect(step(board(lines), { line: 1, col: 9 }, { line: 0, col: 0 })).toEqual({ line: 0, col: 1 });
    expect(step(board(lines), { line: 2, col: 2 }, { line: 2, col: 8 })).toEqual({ line: 2, col: 3 });
  });
});

describe('edits', () => {
  it('shifts monsters below an inserted line', () => {
    const lines = file(20, { 3: '// TODO: a', 10: '// TODO: b' });
    const raid = raidOf(lines);
    shiftLines(raid, 5, 2);
    expect(raid.monsters.map((m) => m.pos.line)).toEqual([3, 12]);
    expect(raid.monsters[1].home).toBe(12);
  });

  it('banishes the monster whose TODO was deleted and spawns one for a new TODO', () => {
    const before = file(20, { 3: '// TODO: keep', 10: '// FIXME: fixed now' });
    const raid = raidOf(before);
    const after = file(20, { 3: '// TODO: keep', 15: '// HACK: new one' });
    const events = syncTodos(raid, extractTodos('a.ts', after.join('\n')), after);
    expect(events.map((e) => [e.type, 'monster' in e ? e.monster.kind : null])).toEqual([
      ['banished', 'skeleton'],
      ['spawned', 'slime'],
    ]);
    expect(raid.banished).toBe(1);
    expect(alive(raid).map((m) => m.kind)).toEqual(['goblin', 'slime']);
  });

  it('does not respawn a slain monster while its comment is still there', () => {
    const lines = file(20, { 3: '// BUG: once', 15: '// TODO: still alive' });
    const raid = raidOf(lines);
    const m = raid.monsters[0];
    cursorMoved(raid, board(lines), { line: 3, col: 3 }, 0);
    expect(m.dead).toBe(true);
    expect(syncTodos(raid, extractTodos('a.ts', lines.join('\n')), lines)).toEqual([]);
  });
});
