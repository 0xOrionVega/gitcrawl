/**
 * File-backed storage: generated dungeons, a summary index (for the Hall of
 * Shame) and leaderboards. Plain JSON on disk is plenty for an MVP and works
 * on a single Fly.io volume; swap for R2/SQLite when traffic demands it.
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync, readdirSync, statSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { DungeonSpec } from '@gitcrawl/shared';

export function safeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9._-]+/g, '__');
}

function writeJsonAtomic(path: string, data: unknown) {
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, JSON.stringify(data));
  renameSync(tmp, path);
}

export interface DungeonSummary {
  fullName: string;
  title: string;
  files: number;
  todos: number;
  boss: { name: string; loc: number } | null;
  health: number;
  grade: string;
  language: string | null;
  storedAt: number;
  plays: number;
}

interface Entry {
  spec: DungeonSpec;
  storedAt: number;
}

export class DungeonStore {
  private mem = new Map<string, Entry>();
  private index = new Map<string, DungeonSummary>();
  private readonly dir: string;
  private readonly indexPath: string;
  private flushTimer: NodeJS.Timeout | null = null;

  constructor(root: string, private maxMemory = 300) {
    this.dir = join(root, 'dungeons');
    mkdirSync(this.dir, { recursive: true });
    this.indexPath = join(root, 'index.json');
    if (existsSync(this.indexPath)) {
      try {
        const list = JSON.parse(readFileSync(this.indexPath, 'utf8')) as DungeonSummary[];
        for (const s of list) this.index.set(s.fullName.toLowerCase(), s);
      } catch {
        /* rebuilt lazily */
      }
    }
  }

  get(key: string): Entry | null {
    const k = key.toLowerCase();
    const hit = this.mem.get(k);
    if (hit) return hit;
    const path = join(this.dir, `${safeKey(k)}.json`);
    if (!existsSync(path)) return null;
    try {
      const spec = JSON.parse(readFileSync(path, 'utf8')) as DungeonSpec;
      const entry = { spec, storedAt: statSync(path).mtimeMs };
      this.remember(k, entry);
      return entry;
    } catch {
      return null;
    }
  }

  set(key: string, spec: DungeonSpec) {
    const k = key.toLowerCase();
    const entry = { spec, storedAt: Date.now() };
    this.remember(k, entry);
    writeJsonAtomic(join(this.dir, `${safeKey(k)}.json`), spec);
    const prev = this.index.get(k);
    this.index.set(k, {
      fullName: spec.repo.fullName,
      title: spec.title.name,
      files: spec.stats.files,
      todos: spec.stats.todos,
      boss: spec.boss ? { name: spec.boss.name, loc: spec.boss.loc } : null,
      health: spec.health.score,
      grade: spec.health.grade,
      language: spec.repo.primaryLanguage,
      storedAt: entry.storedAt,
      plays: prev?.plays ?? 0,
    });
    this.scheduleFlush();
  }

  countPlay(key: string) {
    const s = this.index.get(key.toLowerCase());
    if (s) {
      s.plays++;
      this.scheduleFlush();
    }
  }

  summaries(): DungeonSummary[] {
    return [...this.index.values()];
  }

  size() {
    return this.index.size;
  }

  private remember(k: string, entry: Entry) {
    this.mem.delete(k);
    this.mem.set(k, entry);
    while (this.mem.size > this.maxMemory) {
      const oldest = this.mem.keys().next().value as string;
      this.mem.delete(oldest);
    }
  }

  private scheduleFlush() {
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.flush();
    }, 500);
    this.flushTimer.unref?.();
  }

  flush() {
    writeJsonAtomic(this.indexPath, [...this.index.values()]);
  }
}

export interface LeaderEntry {
  nickname: string;
  timeMs: number;
  goblins: number;
  deaths: number;
  at: string;
}

interface Boards {
  repos: Record<string, LeaderEntry[]>;
  daily: Record<string, { repo: string; entries: LeaderEntry[] }>;
}

export class LeaderboardStore {
  private data: Boards = { repos: {}, daily: {} };
  private readonly path: string;
  private timer: NodeJS.Timeout | null = null;

  constructor(root: string, private keep = 20) {
    mkdirSync(root, { recursive: true });
    this.path = join(root, 'leaderboards.json');
    if (existsSync(this.path)) {
      try {
        this.data = JSON.parse(readFileSync(this.path, 'utf8')) as Boards;
      } catch {
        this.data = { repos: {}, daily: {} };
      }
    }
  }

  get(key: string): LeaderEntry[] {
    return this.data.repos[key.toLowerCase()] ?? [];
  }

  getDaily(date: string): { repo: string; entries: LeaderEntry[] } | null {
    return this.data.daily[date] ?? null;
  }

  /** Insert, keep the best `keep`, return the 1-based rank (or keep+1 if it didn't make it). */
  add(key: string, entry: LeaderEntry, daily: { date: string; repo: string } | null): { rank: number; entries: LeaderEntry[] } {
    const k = key.toLowerCase();
    const list = [...(this.data.repos[k] ?? []), entry].sort((a, b) => a.timeMs - b.timeMs || a.deaths - b.deaths);
    const rank = list.indexOf(entry) + 1;
    this.data.repos[k] = list.slice(0, this.keep);
    let entries = this.data.repos[k];
    if (daily) {
      const d = this.data.daily[daily.date] ?? { repo: daily.repo, entries: [] };
      d.entries = [...d.entries, entry].sort((a, b) => a.timeMs - b.timeMs).slice(0, 50);
      this.data.daily[daily.date] = d;
      entries = d.entries;
      // Keep two weeks of dailies.
      const dates = Object.keys(this.data.daily).sort();
      for (const old of dates.slice(0, Math.max(0, dates.length - 14))) delete this.data.daily[old];
    }
    this.schedule();
    return { rank, entries };
  }

  private schedule() {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      writeJsonAtomic(this.path, this.data);
    }, 300);
    this.timer.unref?.();
  }
}

/** Small file cache for rendered images. */
export class FileCache {
  constructor(private dir: string) {
    mkdirSync(dir, { recursive: true });
  }

  path(name: string) {
    return join(this.dir, name);
  }

  read(name: string): Buffer | null {
    const p = this.path(name);
    return existsSync(p) ? readFileSync(p) : null;
  }

  write(name: string, data: Buffer) {
    writeFileSync(this.path(name), data);
  }

  prune(prefix: string, keepName: string) {
    for (const f of readdirSync(this.dir)) if (f.startsWith(prefix) && f !== keepName) rmSync(this.path(f), { force: true });
  }
}
