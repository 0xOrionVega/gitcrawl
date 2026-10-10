/**
 * TODO raid rules: every TODO-style comment in a file becomes a monster that
 * wakes when the cursor comes near and walks toward it. Moving the cursor onto
 * a monster hits it; a monster reaching the cursor costs a heart. Deleting the
 * TODO banishes its monster for good.
 *
 * Pure: no editor APIs, all times passed in, so it runs under vitest.
 */
import type { TodoItem, TodoKind } from '@gitcrawl/shared';

export type MonsterKind = 'goblin' | 'skeleton' | 'slime' | 'ghost';

/** Zero-based editor position. */
export interface Pos {
  line: number;
  col: number;
}

export interface Monster {
  id: number;
  kind: MonsterKind;
  todo: TodoItem;
  /** The comment line it came from (0-based), kept in sync with edits. */
  home: number;
  pos: Pos;
  hp: number;
  maxHp: number;
  awake: boolean;
  /** No moving or biting until this time (after being hit or biting). */
  stunUntil: number;
  nextMoveAt: number;
  dead: boolean;
}

export type RaidEvent =
  | { type: 'spotted'; monster: Monster }
  | { type: 'hit'; monster: Monster }
  | { type: 'slain'; monster: Monster }
  | { type: 'banished'; monster: Monster }
  | { type: 'spawned'; monster: Monster }
  | { type: 'hurt'; monster: Monster; hearts: number }
  | { type: 'won' }
  | { type: 'lost' };

export interface Raid {
  monsters: Monster[];
  hearts: number;
  maxHearts: number;
  slain: number;
  banished: number;
  invulnerableUntil: number;
  over: 'won' | 'lost' | null;
  nextId: number;
}

/** What the rules need to know about the document. */
export interface Board {
  lineCount: number;
  lineLength(line: number): number;
}

interface KindStats {
  hp: number;
  /** Milliseconds between steps. */
  step: number;
}

export const KIND_OF: Record<TodoKind, MonsterKind> = {
  TODO: 'goblin',
  FIXME: 'skeleton',
  HACK: 'slime',
  XXX: 'ghost',
  BUG: 'ghost',
};

export const STATS: Record<MonsterKind, KindStats> = {
  goblin: { hp: 2, step: 420 },
  skeleton: { hp: 3, step: 560 },
  slime: { hp: 4, step: 900 },
  ghost: { hp: 1, step: 320 },
};

export const MONSTER_NAME: Record<MonsterKind, string> = {
  goblin: 'TODO goblin',
  skeleton: 'FIXME skeleton',
  slime: 'HACK slime',
  ghost: 'BUG ghost',
};

/** Lines between monster and cursor at which a monster wakes up. */
export const WAKE_RANGE = 12;
/** Columns either side of the cursor that count as touching. */
export const REACH = 2;
const HURT_GRACE = 1200;
const HIT_STUN = 900;
const BITE_STUN = 1500;
const HIT_KNOCKBACK = 2;
const BITE_KNOCKBACK = 3;

/** Column of the keyword in the comment, so the monster stands on the word itself. */
export function todoColumn(lineText: string, kind: TodoKind): number {
  const i = lineText.search(new RegExp(`\\b${kind}\\b`, 'i'));
  return i >= 0 ? i : lineText.search(/\S/) >>> 0;
}

export function createRaid(todos: TodoItem[], lines: string[], hearts = 5): Raid {
  const raid: Raid = { monsters: [], hearts, maxHearts: hearts, slain: 0, banished: 0, invulnerableUntil: 0, over: null, nextId: 1 };
  for (const todo of todos) raid.monsters.push(spawn(raid, todo, lines[todo.line - 1] ?? ''));
  return raid;
}

function spawn(raid: Raid, todo: TodoItem, lineText: string): Monster {
  const kind = KIND_OF[todo.kind];
  const { hp } = STATS[kind];
  const line = todo.line - 1;
  return {
    id: raid.nextId++,
    kind,
    todo,
    home: line,
    pos: { line, col: todoColumn(lineText, todo.kind) },
    hp,
    maxHp: hp,
    awake: false,
    stunUntil: 0,
    nextMoveAt: 0,
    dead: false,
  };
}

export function alive(raid: Raid): Monster[] {
  return raid.monsters.filter((m) => !m.dead);
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function clampTo(board: Board, p: Pos): Pos {
  const line = clamp(p.line, 0, Math.max(0, board.lineCount - 1));
  return { line, col: clamp(p.col, 0, board.lineLength(line)) };
}

export function touching(a: Pos, b: Pos): boolean {
  return a.line === b.line && Math.abs(a.col - b.col) <= REACH;
}

function knockBack(board: Board, m: Monster, from: Pos, lines: number) {
  const dir = m.pos.line < from.line ? -1 : m.pos.line > from.line ? 1 : m.home <= from.line ? -1 : 1;
  m.pos = clampTo(board, { line: m.pos.line + dir * lines, col: m.pos.col });
  // Knocked against the top or bottom of the file: go the other way.
  if (m.pos.line === from.line) m.pos = clampTo(board, { line: m.pos.line - dir * lines, col: m.pos.col });
}

function finish(raid: Raid, events: RaidEvent[]) {
  if (raid.over) return;
  if (raid.hearts <= 0) {
    raid.over = 'lost';
    events.push({ type: 'lost' });
  } else if (alive(raid).length === 0) {
    raid.over = 'won';
    events.push({ type: 'won' });
  }
}

/** The cursor moved: anything it lands next to takes a hit. */
export function cursorMoved(raid: Raid, board: Board, cursor: Pos, now: number): RaidEvent[] {
  const events: RaidEvent[] = [];
  if (raid.over) return events;
  for (const m of alive(raid)) {
    if (!touching(m.pos, cursor) || now < m.stunUntil) continue;
    m.awake = true;
    m.hp -= 1;
    if (m.hp <= 0) {
      m.dead = true;
      raid.slain += 1;
      events.push({ type: 'slain', monster: m });
    } else {
      m.stunUntil = now + HIT_STUN;
      m.nextMoveAt = m.stunUntil;
      knockBack(board, m, cursor, HIT_KNOCKBACK);
      events.push({ type: 'hit', monster: m });
    }
  }
  finish(raid, events);
  return events;
}

/** Advance the monsters to `now`: wake, step toward the cursor, bite. */
export function tick(raid: Raid, board: Board, cursor: Pos, now: number, speed = 1): RaidEvent[] {
  const events: RaidEvent[] = [];
  if (raid.over) return events;
  const taken = new Set(alive(raid).map((m) => `${m.pos.line}:${m.pos.col}`));
  for (const m of alive(raid)) {
    if (!m.awake) {
      if (Math.abs(m.pos.line - cursor.line) > WAKE_RANGE) continue;
      m.awake = true;
      m.nextMoveAt = now + STATS[m.kind].step / speed;
      events.push({ type: 'spotted', monster: m });
      continue;
    }
    if (now < m.stunUntil || now < m.nextMoveAt) continue;
    m.nextMoveAt = now + STATS[m.kind].step / speed;

    if (touching(m.pos, cursor)) {
      if (now >= raid.invulnerableUntil) {
        raid.hearts -= 1;
        raid.invulnerableUntil = now + HURT_GRACE;
        events.push({ type: 'hurt', monster: m, hearts: raid.hearts });
      }
      m.stunUntil = now + BITE_STUN;
      knockBack(board, m, cursor, BITE_KNOCKBACK);
      continue;
    }

    const next = step(board, m.pos, cursor);
    const key = `${next.line}:${next.col}`;
    if (taken.has(key)) continue;
    taken.delete(`${m.pos.line}:${m.pos.col}`);
    taken.add(key);
    m.pos = next;
  }
  finish(raid, events);
  return events;
}

/** One step toward the target: close the line gap first, then walk along the line. */
export function step(board: Board, from: Pos, to: Pos): Pos {
  if (from.line !== to.line) {
    const line = from.line + Math.sign(to.line - from.line);
    // Drift toward the cursor's column on the way, so the last stretch is short.
    const col = from.col + clamp(to.col - from.col, -2, 2);
    return clampTo(board, { line, col });
  }
  return clampTo(board, { line: from.line, col: from.col + Math.sign(to.col - from.col) });
}

/** Lines were inserted (delta > 0) or removed (delta < 0) after `fromLine`. */
export function shiftLines(raid: Raid, fromLine: number, delta: number) {
  for (const m of raid.monsters) {
    if (m.home > fromLine) m.home = Math.max(fromLine, m.home + delta);
    if (m.pos.line > fromLine) m.pos.line = Math.max(fromLine, m.pos.line + delta);
  }
}

const todoKey = (t: TodoItem) => `${t.kind}\u0000${t.text}`;

/**
 * The document changed: match the fresh TODO list against the living monsters.
 * A monster whose TODO is gone is banished; a new TODO spawns a new monster.
 */
export function syncTodos(raid: Raid, todos: TodoItem[], lines: string[]): RaidEvent[] {
  const events: RaidEvent[] = [];
  if (raid.over) return events;
  const fresh = new Map<string, TodoItem[]>();
  for (const t of todos) {
    const list = fresh.get(todoKey(t)) ?? [];
    list.push(t);
    fresh.set(todoKey(t), list);
  }
  const claim = (m: Monster): TodoItem | null => {
    const list = fresh.get(todoKey(m.todo));
    if (!list?.length) return null;
    // Same text can appear twice: take the occurrence nearest the monster's home.
    let best = 0;
    for (let i = 1; i < list.length; i++) {
      if (Math.abs(list[i].line - 1 - m.home) < Math.abs(list[best].line - 1 - m.home)) best = i;
    }
    return list.splice(best, 1)[0];
  };
  for (const m of raid.monsters) {
    // Slain monsters still hold their TODO, so it does not respawn while the comment stays.
    const match = claim(m);
    if (match) {
      m.todo = match;
      m.home = match.line - 1;
    } else if (!m.dead) {
      m.dead = true;
      raid.banished += 1;
      events.push({ type: 'banished', monster: m });
    }
  }
  for (const list of fresh.values()) {
    for (const t of list) {
      const m = spawn(raid, t, lines[t.line - 1] ?? '');
      raid.monsters.push(m);
      events.push({ type: 'spawned', monster: m });
    }
  }
  finish(raid, events);
  return events;
}
