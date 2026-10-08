/**
 * Repo snapshot -> playable dungeon.
 *
 * Layout: the entrance, every selected folder (depth-first) and the boss lair
 * form a main path laid along a Hilbert curve, so consecutive rooms are always
 * neighbours and folders that belong together end up near each other. Side
 * rooms (treasury, crypt, pit) hang off the path. A few extra loops keep it
 * from feeling like a straight line.
 */
import type {
  BossInfo,
  Corridor,
  DoorKind,
  DungeonSpec,
  DungeonStats,
  Entity,
  EntityKind,
  Findings,
  PowerUp,
  QuestFinding,
  Rect,
  RepoSnapshot,
  Room,
  RoomKind,
} from './types.js';
import { analyzeSnapshot, summarizeReadme, type Analysis, type FileInfo, type FolderInfo } from './analyze.js';
import { createRng, hashString } from './rng.js';
import { hilbertD2XY, hilbertSizeFor } from './hilbert.js';
import { TUNING } from './tuning.js';
import { doorForLicense, doorDescription } from './license.js';
import { basename, blobUrl, dirname, formatAge, formatBytes } from './format.js';

export const GENERATOR_VERSION = 'gitcrawl-gen/1.0';

/** Tile codes used while carving. */
const VOID = 0;
const FLOOR = 1;
const CORRIDOR = 2;
const WALL = 3;
const PIT = 4;
const TILE_CHARS = [' ', '.', ',', '#', 'o'];

interface Plan {
  id: number;
  kind: RoomKind;
  label: string;
  folder: string | null;
  depth: number;
  files: number;
  bytes: number;
  testFiles: number;
  w: number;
  h: number;
  order: number;
  children: Plan[];
  cell: { cx: number; cy: number };
  rect: Rect;
}

const EXCLUDED_SEGMENTS = new Set([
  'node_modules', 'vendor', 'bower_components', '.yarn', 'Pods', '.pnpm-store',
  'dist', 'build', 'out', 'target', 'coverage', '.next', '.nuxt', '.svelte-kit', '.git',
]);

function excludedFolder(path: string): boolean {
  for (const seg of path.split('/')) {
    if (EXCLUDED_SEGMENTS.has(seg)) return true;
    if (seg.startsWith('.') && seg !== '.github') return true;
  }
  return false;
}

export interface GenerateOptions {
  /** Override "now" (ISO) for deterministic tests. Defaults to snapshot.fetchedAt. */
  now?: string;
}

export function generateDungeon(snapshot: RepoSnapshot, _opts: GenerateOptions = {}): DungeonSpec {
  const a = analyzeSnapshot(snapshot);
  const fullName = `${snapshot.owner}/${snapshot.name}`;
  const seed = hashString(`${fullName}@${snapshot.sha}`);
  const rng = createRng(seed);
  const G = TUNING.generator;

  // ------------------------------------------------------------------
  // 1. Pick folders that become rooms.
  // ------------------------------------------------------------------
  const selected = selectFolders(a);
  const selectedSet = new Set(selected.map((f) => f.path));
  const roomOfFolderCache = new Map<string, string>();
  /** Nearest selected ancestor folder ('' = entrance). */
  const roomFolderFor = (dir: string): string => {
    const cached = roomOfFolderCache.get(dir);
    if (cached !== undefined) return cached;
    let cur = dir;
    while (cur !== '' && !selectedSet.has(cur)) cur = dirname(cur);
    roomOfFolderCache.set(dir, cur);
    return cur;
  };

  let nextId = 0;
  const makePlan = (kind: RoomKind, label: string, folder: string | null, depth: number): Plan => ({
    id: nextId++,
    kind,
    label,
    folder,
    depth,
    files: 0,
    bytes: 0,
    testFiles: 0,
    w: 0,
    h: 0,
    order: -1,
    children: [],
    cell: { cx: 0, cy: 0 },
    rect: { x: 0, y: 0, w: 0, h: 0 },
  });

  const entrance = makePlan('entrance', 'Entrance Hall', '', 0);
  const planByFolder = new Map<string, Plan>([['', entrance]]);
  for (const f of [...selected].sort((x, y) => x.depth - y.depth || x.path.localeCompare(y.path))) {
    const plan = makePlan('folder', f.path, f.path, f.depth);
    planByFolder.set(f.path, plan);
    const parent = planByFolder.get(roomFolderFor(dirname(f.path))) ?? entrance;
    parent.children.push(plan);
  }
  for (const file of a.files) {
    if (file.pit) continue;
    const plan = planByFolder.get(roomFolderFor(file.dir))!;
    plan.files++;
    plan.bytes += file.size;
    if (file.test) plan.testFiles++;
  }
  const totalOf = (p: Plan): number => p.files + p.children.reduce((s, c) => s + totalOf(c), 0);
  const sortTree = (p: Plan) => {
    p.children.sort((x, y) => totalOf(y) - totalOf(x) || x.label.localeCompare(y.label));
    p.children.forEach(sortTree);
  };
  sortTree(entrance);

  const R = G.room;
  for (const plan of planByFolder.values()) {
    if (plan.kind === 'entrance') {
      plan.w = G.entrance.w;
      plan.h = G.entrance.h;
    } else {
      plan.w = clamp(Math.round(8 + Math.sqrt(plan.files) * 1.1), R.minW, R.maxW);
      plan.h = clamp(Math.round(7 + Math.sqrt(plan.files) * 0.75), R.minH, R.maxH);
    }
  }

  // Main path: entrance, folders depth-first, boss lair.
  const chain: Plan[] = [];
  const walk = (p: Plan) => {
    chain.push(p);
    p.children.forEach(walk);
  };
  walk(entrance);
  const bossName = a.bossFile ? a.bossFile.name : 'The Empty Throne';
  const lair = makePlan('boss', a.bossFile ? `Lair of ${bossName}` : 'The Empty Throne', null, 0);
  lair.w = G.boss.w;
  lair.h = G.boss.h;
  chain.push(lair);
  chain.forEach((p, i) => (p.order = i));

  const sides: { plan: Plan; frac: number }[] = [];
  if (a.lockfiles.length > 0 || a.pitFiles > 0) {
    const pit = makePlan('pit', 'Pit of Dependencies', null, 0);
    pit.w = G.pit.w;
    pit.h = G.pit.h;
    sides.push({ plan: pit, frac: 0.2 });
  }
  if (a.staleBranches && a.staleBranches.length > 0) {
    const crypt = makePlan('crypt', 'Crypt of Stale Branches', null, 0);
    crypt.w = G.crypt.w;
    crypt.h = G.crypt.h;
    sides.push({ plan: crypt, frac: 0.5 });
  }
  const treasury = makePlan('treasury', 'Treasury', null, 0);
  treasury.w = G.treasury.w;
  treasury.h = G.treasury.h;
  sides.push({ plan: treasury, frac: 0.72 });

  // ------------------------------------------------------------------
  // 2. Place cells.
  // ------------------------------------------------------------------
  const layoutRng = rng.fork('layout');
  const n = hilbertSizeFor(Math.ceil((chain.length + sides.length) * 1.35));
  const transform = layoutRng.int(0, 7);
  const tx = (x: number, y: number) => dihedral(transform, x, y, n);
  const occupied = new Map<string, Plan>();
  const key = (cx: number, cy: number) => `${cx},${cy}`;
  chain.forEach((p, i) => {
    const raw = hilbertD2XY(n, i);
    p.cell = tx(raw.x, raw.y);
    occupied.set(key(p.cell.cx, p.cell.cy), p);
  });
  const sideLinks: { side: Plan; anchor: Plan }[] = [];
  for (const { plan, frac } of sides) {
    const target = Math.round(frac * (chain.length - 1));
    const order: number[] = [];
    for (let d = 0; d < chain.length; d++) {
      if (target - d >= 0) order.push(target - d);
      if (d > 0 && target + d < chain.length) order.push(target + d);
    }
    let placed = false;
    for (const idx of order) {
      const anchor = chain[idx];
      if (anchor.kind === 'boss') continue;
      const dirs = layoutRng.shuffle([
        [1, 0],
        [0, 1],
        [-1, 0],
        [0, -1],
      ]);
      for (const [dx, dy] of dirs) {
        const cx = anchor.cell.cx + dx;
        const cy = anchor.cell.cy + dy;
        if (occupied.has(key(cx, cy))) continue;
        plan.cell = { cx, cy };
        occupied.set(key(cx, cy), plan);
        sideLinks.push({ side: plan, anchor });
        placed = true;
        break;
      }
      if (placed) break;
    }
  }
  const placedSides = sideLinks.map((l) => l.side);
  const allPlans = [...chain, ...placedSides];

  // ------------------------------------------------------------------
  // 3. Rooms inside cells, normalised to map coordinates.
  // ------------------------------------------------------------------
  // Columns and rows are only as wide/tall as their biggest room needs, so
  // small rooms don't end up at the far ends of very long corridors.
  const minCx = Math.min(...allPlans.map((p) => p.cell.cx));
  const minCy = Math.min(...allPlans.map((p) => p.cell.cy));
  const maxCx = Math.max(...allPlans.map((p) => p.cell.cx));
  const maxCy = Math.max(...allPlans.map((p) => p.cell.cy));
  const colW = new Array<number>(maxCx - minCx + 1).fill(G.cellMinW);
  const rowH = new Array<number>(maxCy - minCy + 1).fill(G.cellMinH);
  for (const p of allPlans) {
    p.cell = { cx: p.cell.cx - minCx, cy: p.cell.cy - minCy };
    colW[p.cell.cx] = Math.max(colW[p.cell.cx], p.w + G.cellPad);
    rowH[p.cell.cy] = Math.max(rowH[p.cell.cy], p.h + G.cellPad);
  }
  const colX = colW.map((_, i) => colW.slice(0, i).reduce((a, b) => a + b, 0));
  const rowY = rowH.map((_, i) => rowH.slice(0, i).reduce((a, b) => a + b, 0));
  for (const p of allPlans) {
    const cw = colW[p.cell.cx];
    const ch = rowH[p.cell.cy];
    p.rect = {
      x: colX[p.cell.cx] + layoutRng.int(2, cw - p.w - 2),
      y: rowY[p.cell.cy] + layoutRng.int(2, ch - p.h - 2),
      w: p.w,
      h: p.h,
    };
  }
  const W = colW.reduce((a, b) => a + b, 0);
  const H = rowH.reduce((a, b) => a + b, 0);
  const grid = new Uint8Array(W * H);
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= W || y >= H ? VOID : grid[y * W + x]);
  const set = (x: number, y: number, v: number) => {
    if (x >= 0 && y >= 0 && x < W && y < H) grid[y * W + x] = v;
  };
  for (const p of allPlans) {
    for (let y = p.rect.y; y < p.rect.y + p.rect.h; y++) for (let x = p.rect.x; x < p.rect.x + p.rect.w; x++) set(x, y, FLOOR);
  }

  // ------------------------------------------------------------------
  // 4. Corridors.
  // ------------------------------------------------------------------
  const carve = (x0: number, y0: number, x1: number, y1: number) => {
    for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) {
      for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) {
        const t = at(x, y);
        if (t === VOID || t === WALL) set(x, y, CORRIDOR);
      }
    }
  };
  interface DoorSpot {
    x: number;
    y: number;
    orientation: 'v' | 'h';
  }
  const connect = (A: Plan, B: Plan, doorAt: Plan | null): DoorSpot | null => {
    const dx = B.cell.cx - A.cell.cx;
    const dy = B.cell.cy - A.cell.cy;
    if (Math.abs(dx) + Math.abs(dy) !== 1) return null;
    if (dx !== 0) {
      const [Lp, Rp] = dx > 0 ? [A, B] : [B, A];
      const x0 = Lp.rect.x + Lp.rect.w;
      const x1 = Rp.rect.x - 1;
      const lo = Math.max(Lp.rect.y, Rp.rect.y) + 1;
      const hi = Math.min(Lp.rect.y + Lp.rect.h, Rp.rect.y + Rp.rect.h) - 2;
      let yl: number;
      let yr: number;
      if (lo <= hi) {
        yl = yr = layoutRng.int(lo, hi);
        carve(x0, yl - 1, x1, yl + 1);
      } else {
        yl = Lp.rect.y + Math.floor(Lp.rect.h / 2);
        yr = Rp.rect.y + Math.floor(Rp.rect.h / 2);
        const mid = Math.floor((x0 + x1) / 2);
        carve(x0, yl - 1, mid + 1, yl + 1);
        carve(mid - 1, Math.min(yl, yr) - 1, mid + 1, Math.max(yl, yr) + 1);
        carve(mid - 1, yr - 1, x1, yr + 1);
      }
      if (doorAt === Rp) return { x: x1, y: yr, orientation: 'v' };
      if (doorAt === Lp) return { x: x0, y: yl, orientation: 'v' };
      return null;
    }
    const [Tp, Bp] = dy > 0 ? [A, B] : [B, A];
    const y0 = Tp.rect.y + Tp.rect.h;
    const y1 = Bp.rect.y - 1;
    const lo = Math.max(Tp.rect.x, Bp.rect.x) + 1;
    const hi = Math.min(Tp.rect.x + Tp.rect.w, Bp.rect.x + Bp.rect.w) - 2;
    let xt: number;
    let xb: number;
    if (lo <= hi) {
      xt = xb = layoutRng.int(lo, hi);
      carve(xt - 1, y0, xt + 1, y1);
    } else {
      xt = Tp.rect.x + Math.floor(Tp.rect.w / 2);
      xb = Bp.rect.x + Math.floor(Bp.rect.w / 2);
      const mid = Math.floor((y0 + y1) / 2);
      carve(xt - 1, y0, xt + 1, mid + 1);
      carve(Math.min(xt, xb) - 1, mid - 1, Math.max(xt, xb) + 1, mid + 1);
      carve(xb - 1, mid - 1, xb + 1, y1);
    }
    if (doorAt === Bp) return { x: xb, y: y1, orientation: 'h' };
    if (doorAt === Tp) return { x: xt, y: y0, orientation: 'h' };
    return null;
  };

  const corridors: Corridor[] = [];
  for (let i = 0; i + 1 < chain.length; i++) {
    connect(chain[i], chain[i + 1], null);
    corridors.push({ a: chain[i].id, b: chain[i + 1].id, door: null });
  }
  // Loops between neighbouring rooms that aren't consecutive (never into the lair).
  for (let i = 0; i < chain.length; i++) {
    for (let j = i + 2; j < chain.length; j++) {
      const A = chain[i];
      const B = chain[j];
      if (A.kind === 'boss' || B.kind === 'boss') continue;
      if (Math.abs(A.cell.cx - B.cell.cx) + Math.abs(A.cell.cy - B.cell.cy) !== 1) continue;
      if (!layoutRng.chance(G.loopChance)) continue;
      connect(A, B, null);
      corridors.push({ a: A.id, b: B.id, door: null });
    }
  }
  const doorKind: DoorKind = doorForLicense(snapshot.license);
  let treasuryDoor: DoorSpot | null = null;
  for (const { side, anchor } of sideLinks) {
    const door = side.kind === 'treasury' ? doorKind : null;
    const spot = connect(anchor, side, side.kind === 'treasury' ? side : null);
    if (side.kind === 'treasury') treasuryDoor = spot;
    corridors.push({ a: anchor.id, b: side.id, door });
  }

  // Pit hole in the pit room.
  const pitPlan = placedSides.find((p) => p.kind === 'pit');
  if (pitPlan) {
    const r = pitPlan.rect;
    for (let y = r.y + 3; y <= r.y + r.h - 3; y++) for (let x = r.x + 3; x <= r.x + r.w - 4; x++) set(x, y, PIT);
  }

  // Walls around everything walkable.
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (at(x, y) !== VOID) continue;
      let near = false;
      for (let oy = -1; oy <= 1 && !near; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          const t = at(x + ox, y + oy);
          if (t === FLOOR || t === CORRIDOR || t === PIT) {
            near = true;
            break;
          }
        }
      }
      if (near) set(x, y, WALL);
    }
  }

  // ------------------------------------------------------------------
  // 5. Entities.
  // ------------------------------------------------------------------
  const ent = rng.fork('entities');
  const entities: Entity[] = [];
  const occupiedTiles = new Set<number>();
  let entityId = 0;
  const add = (e: Omit<Entity, 'id'>, block = true): Entity => {
    const full: Entity = { id: entityId++, ...e };
    entities.push(full);
    if (block) occupiedTiles.add(e.y * W + e.x);
    return full;
  };
  const spawn = {
    x: entrance.rect.x + Math.floor(entrance.rect.w / 2),
    y: entrance.rect.y + entrance.rect.h - 2,
  };
  const nearCorridor = (x: number, y: number) =>
    at(x + 1, y) === CORRIDOR || at(x - 1, y) === CORRIDOR || at(x, y + 1) === CORRIDOR || at(x, y - 1) === CORRIDOR;
  const free = (x: number, y: number) => at(x, y) === FLOOR && !occupiedTiles.has(y * W + x) && !nearCorridor(x, y);
  const spot = (
    p: Plan,
    opts: { margin?: number; edge?: boolean; awayFromSpawn?: number; top?: boolean } = {},
  ): { x: number; y: number } | null => {
    const r = p.rect;
    const m = opts.margin ?? 1;
    for (let tries = 0; tries < 80; tries++) {
      let x: number;
      let y: number;
      if (opts.edge) {
        const side = ent.int(0, 3);
        if (side === 0) [x, y] = [ent.int(r.x, r.x + r.w - 1), r.y];
        else if (side === 1) [x, y] = [ent.int(r.x, r.x + r.w - 1), r.y + r.h - 1];
        else if (side === 2) [x, y] = [r.x, ent.int(r.y, r.y + r.h - 1)];
        else [x, y] = [r.x + r.w - 1, ent.int(r.y, r.y + r.h - 1)];
      } else if (opts.top) {
        x = ent.int(r.x + m, r.x + r.w - 1 - m);
        y = ent.int(r.y + 1, r.y + Math.max(1, Math.floor(r.h / 3)));
      } else {
        x = ent.int(r.x + m, r.x + r.w - 1 - m);
        y = ent.int(r.y + m, r.y + r.h - 1 - m);
      }
      if (!free(x, y)) continue;
      if (opts.awayFromSpawn && Math.hypot(x - spawn.x, y - spawn.y) < opts.awayFromSpawn) continue;
      return { x, y };
    }
    return null;
  };
  /** Closest free tile to a preferred position inside a room (spiral search). */
  const spotNear = (p: Plan, px: number, py: number): { x: number; y: number } | null => {
    const r = p.rect;
    for (let d = 0; d < Math.max(r.w, r.h); d++) {
      for (let oy = -d; oy <= d; oy++) {
        for (let ox = -d; ox <= d; ox++) {
          if (Math.max(Math.abs(ox), Math.abs(oy)) !== d) continue;
          const x = px + ox;
          const y = py + oy;
          if (x < r.x || y < r.y || x >= r.x + r.w || y >= r.y + r.h) continue;
          if (free(x, y)) return { x, y };
        }
      }
    }
    return null;
  };
  const planForFile = (path: string): Plan => planByFolder.get(roomFolderFor(dirname(path))) ?? entrance;
  const htmlUrl = snapshot.htmlUrl;
  const sha = snapshot.sha;
  // Keep the spawn point and the entrance doorway clear.
  occupiedTiles.add(spawn.y * W + spawn.x);

  // Entrance furniture.
  const readme = summarizeReadme(snapshot.readmeExcerpt, snapshot.description);
  const tabletSpot = spotNear(entrance, spawn.x, entrance.rect.y) ?? { x: spawn.x, y: entrance.rect.y + 1 };
  add({
    kind: 'tablet',
    ...tabletSpot,
    room: entrance.id,
    label: `${fullName}`,
    text: readme ?? 'No README. The tablet is blank, except for a sad face someone scratched into it.',
  });

  // Quests (good first issues / help wanted).
  let quests: QuestFinding[] | null = null;
  const folderRooms = chain.filter((p) => p.kind === 'folder');
  if (snapshot.quests) {
    quests = [];
    const pool = folderRooms.length > 0 ? folderRooms : [entrance];
    snapshot.quests.slice(0, 6).forEach((q, i) => {
      const lower = q.title.toLowerCase();
      const match = pool.find((p) => {
        const b = basename(p.folder ?? '').toLowerCase();
        return b.length >= 3 && lower.includes(b);
      });
      const target = match ?? pool[Math.floor(((i + 0.5) * pool.length) / Math.min(6, snapshot.quests!.length))] ?? pool[0];
      quests!.push({ number: q.number, title: q.title, url: q.url, labels: q.labels, room: target.id });
    });
    if (quests.length > 0) {
      const qbSpot = spotNear(entrance, entrance.rect.x + 2, entrance.rect.y) ?? { x: entrance.rect.x + 1, y: entrance.rect.y + 1 };
      add({
        kind: 'questboard',
        ...qbSpot,
        room: entrance.id,
        label: 'Quest Board',
        meta: { count: quests.length },
      });
    }
  }

  // Boss / throne.
  let boss: BossInfo | null = null;
  const lairCenter = { x: lair.rect.x + Math.floor(lair.rect.w / 2), y: lair.rect.y + 4 };
  if (a.bossFile) {
    const bf = a.bossFile;
    boss = {
      path: bf.path,
      name: bf.name,
      loc: bf.loc,
      exactLoc: bf.exact,
      hp: TUNING.enemies.boss.hp,
      url: blobUrl(htmlUrl, sha, bf.path),
      taunts: a.taunts.length > 0 ? a.taunts : genericTaunts(bf),
      language: bf.lang,
    };
    add({
      kind: 'boss',
      x: lairCenter.x,
      y: lairCenter.y,
      room: lair.id,
      label: bf.name,
      path: bf.path,
      loc: bf.loc,
      url: boss.url,
      hp: boss.hp,
      meta: { language: bf.lang },
    });
  } else {
    add({
      kind: 'throne',
      x: lairCenter.x,
      y: lairCenter.y,
      room: lair.id,
      label: 'The Empty Throne',
      text: 'There is no code here to fight. Zero lines, zero bugs. Sit on the throne to claim victory.',
    });
  }

  // Minibosses in their folder rooms.
  a.minibossFiles.forEach((f, i) => {
    const plan = planForFile(f.path);
    const s = spot(plan, { margin: 2, awayFromSpawn: 6 }) ?? spot(plan, { margin: 1, awayFromSpawn: 4 });
    if (!s) return;
    add({
      kind: 'miniboss',
      ...s,
      room: plan.id,
      label: f.name,
      path: f.path,
      loc: f.loc,
      url: blobUrl(htmlUrl, sha, f.path),
      hp: TUNING.enemies.miniboss.hp + Math.min(10, Math.floor(f.loc / 800)),
      meta: { rank: i + 1, language: f.lang },
    });
  });

  // Goblins = TODOs, distributed round-robin so every room gets some.
  const todosByPlan = new Map<number, typeof a.todos>();
  for (const t of a.todos) {
    const plan = planForFile(t.path);
    let list = todosByPlan.get(plan.id);
    if (!list) todosByPlan.set(plan.id, (list = []));
    list.push(t);
  }
  const goblinCap = (p: Plan) => Math.min(G.maxGoblinsPerRoom, Math.max(1, Math.floor((p.w * p.h) / 14)));
  let goblins = 0;
  const goblinCount = new Map<number, number>();
  let progress = true;
  while (goblins < G.maxGoblins && progress) {
    progress = false;
    for (const plan of chain) {
      if (goblins >= G.maxGoblins) break;
      const list = todosByPlan.get(plan.id);
      if (!list || list.length === 0) continue;
      const count = goblinCount.get(plan.id) ?? 0;
      if (count >= goblinCap(plan)) continue;
      const todo = list.shift()!;
      const s = spot(plan, { awayFromSpawn: 5 });
      if (!s) continue;
      add({
        kind: 'goblin',
        ...s,
        room: plan.id,
        label: todo.kind,
        text: todo.text || `(no description — just ${todo.kind}.)`,
        path: todo.path,
        line: todo.line,
        url: blobUrl(htmlUrl, sha, todo.path, todo.line),
        hp: TUNING.enemies.goblin.hp,
        meta: { owner: todo.owner ?? null },
      });
      goblinCount.set(plan.id, count + 1);
      goblins++;
      progress = true;
    }
  }

  // Slimes = other bloated files.
  const slimeCount = new Map<number, number>();
  for (const f of a.slimeFiles) {
    const plan = planForFile(f.path);
    const count = slimeCount.get(plan.id) ?? 0;
    if (count >= G.maxSlimesPerRoom) continue;
    const s = spot(plan, { awayFromSpawn: 5 });
    if (!s) continue;
    add({
      kind: 'slime',
      ...s,
      room: plan.id,
      label: f.name,
      path: f.path,
      loc: f.loc,
      url: blobUrl(htmlUrl, sha, f.path),
      hp: TUNING.enemies.slime.hp + Math.min(3, Math.floor(f.loc / 1500)),
      meta: { language: f.lang },
    });
    slimeCount.set(plan.id, count + 1);
  }

  // Ghosts = open issues haunting the halls.
  if (snapshot.issues) {
    const pool = folderRooms.length > 0 ? folderRooms : [entrance];
    snapshot.issues.slice(0, G.maxGhosts).forEach((issue, i) => {
      const lower = issue.title.toLowerCase();
      const match = pool.find((p) => {
        const b = basename(p.folder ?? '').toLowerCase();
        return b.length >= 3 && lower.includes(b);
      });
      const plan = match ?? pool[(i * 7 + ent.int(0, pool.length - 1)) % pool.length];
      const s = spot(plan, { awayFromSpawn: 6 });
      if (!s) return;
      add({
        kind: 'ghost',
        ...s,
        room: plan.id,
        label: `#${issue.number}`,
        text: issue.title,
        url: issue.url,
        hp: TUNING.enemies.ghost.hp,
        meta: { comments: issue.comments },
      });
    });
  }

  // Crypt: skeletons = stale branches.
  const cryptPlan = placedSides.find((p) => p.kind === 'crypt');
  if (cryptPlan && a.staleBranches) {
    for (const b of a.staleBranches.slice(0, G.maxSkeletons)) {
      const s = spot(cryptPlan);
      if (!s) break;
      add({
        kind: 'skeleton',
        ...s,
        room: cryptPlan.id,
        label: b.name,
        text: `Last commit ${formatAge(b.daysStale)} ago.`,
        url: b.url,
        hp: TUNING.enemies.skeleton.hp,
        meta: { days: b.daysStale },
      });
    }
    for (let i = 0; i < 5; i++) {
      const s = spot(cryptPlan);
      if (s) add({ kind: 'bones', ...s, room: cryptPlan.id }, false);
    }
  }

  // Pit of dependencies.
  if (pitPlan) {
    const lockLoc = a.lockfiles.reduce((s, f) => s + f.loc, 0);
    add(
      {
        kind: 'pit',
        x: pitPlan.rect.x + Math.floor(pitPlan.rect.w / 2),
        y: pitPlan.rect.y + Math.floor(pitPlan.rect.h / 2),
        room: pitPlan.id,
        label: a.lockfiles[0]?.name ?? 'node_modules',
        text:
          a.lockfiles.length > 0
            ? `${a.lockfiles.map((f) => f.name).slice(0, 3).join(', ')} — ${lockLoc.toLocaleString('en-US')} lines of dependencies. Nobody has ever reached the bottom.`
            : `${a.pitFiles.toLocaleString('en-US')} vendored files. Nobody has ever reached the bottom.`,
        loc: lockLoc,
        meta: { lockfiles: a.lockfiles.length, vendored: a.pitFiles },
      },
      false,
    );
  }

  // Treasury: stars as gold, guarded by the license door.
  const treasuryPlan = placedSides.find((p) => p.kind === 'treasury');
  if (treasuryPlan) {
    const c = { x: treasuryPlan.rect.x + Math.floor(treasuryPlan.rect.w / 2), y: treasuryPlan.rect.y + Math.floor(treasuryPlan.rect.h / 2) };
    add({
      kind: 'gold',
      ...c,
      room: treasuryPlan.id,
      label: snapshot.stars === null ? '??? stars' : `${snapshot.stars.toLocaleString('en-US')} stars`,
      meta: { stars: snapshot.stars },
    });
    const cs = spot(treasuryPlan, { top: true });
    if (cs) add({ kind: 'chest', ...cs, room: treasuryPlan.id, label: 'Treasure chest', meta: { powerup: 'blade' } });
    if (treasuryDoor) {
      const d = doorDescription(doorKind, snapshot.license);
      add({
        kind: 'door',
        x: treasuryDoor.x,
        y: treasuryDoor.y,
        room: treasuryPlan.id,
        label: d.title,
        text: d.text,
        meta: {
          door: doorKind,
          orientation: treasuryDoor.orientation,
          opens: d.opens,
          spdx: snapshot.license?.spdx ?? null,
        },
      });
    }
  }

  // Healing shrine in the room with the most tests.
  if (a.hasTests) {
    const testRoom = [...chain].filter((p) => p.kind !== 'boss').sort((x, y) => y.testFiles - x.testFiles)[0];
    if (testRoom) {
      const s = spot(testRoom, { top: true, awayFromSpawn: 3 }) ?? spot(testRoom);
      if (s) {
        add({
          kind: 'shrine',
          ...s,
          room: testRoom.id,
          label: 'Test Shrine',
          text: `${a.testFiles.length.toLocaleString('en-US')} test files keep this shrine glowing. It heals you.`,
          meta: { tests: a.testFiles.length },
        });
      }
    }
  }

  // Guardians (NPCs).
  const npcPerRoom = new Map<number, number>();
  for (const g of a.guardians.slice(0, G.maxNpcs)) {
    let plan = g.folder === '' ? entrance : planByFolder.get(roomFolderFor(g.folder)) ?? entrance;
    if ((npcPerRoom.get(plan.id) ?? 0) >= 2) plan = entrance;
    if ((npcPerRoom.get(plan.id) ?? 0) >= 4) continue;
    const s = plan === entrance ? spot(plan, { margin: 2 }) : spot(plan, { margin: 1, awayFromSpawn: 3 });
    if (!s) continue;
    npcPerRoom.set(plan.id, (npcPerRoom.get(plan.id) ?? 0) + 1);
    add({
      kind: 'npc',
      ...s,
      room: plan.id,
      label: `@${g.login}`,
      text: g.lastMessage ?? undefined,
      url: `https://github.com/${encodeURIComponent(g.login)}`,
      meta: {
        login: g.login,
        avatar: g.avatarUrl,
        folder: g.folder,
        commits: g.commits,
        source: g.source,
      },
    });
  }

  // Chests spread along the main path.
  const chestRooms = chain.filter((p) => p.kind === 'folder');
  const chestCount = Math.min(G.maxChests - 1, chestRooms.length);
  const loot: PowerUp[] = ent.shuffle(['potion', 'blade', 'boots', 'shield', 'potion', 'shield', 'potion']);
  for (let i = 0; i < chestCount; i++) {
    const plan = chestRooms[Math.floor(((i + 0.5) * chestRooms.length) / chestCount)];
    const s = spot(plan, { top: true }) ?? spot(plan);
    if (!s) continue;
    add({ kind: 'chest', ...s, room: plan.id, label: 'Chest', meta: { powerup: loot[i % loot.length] } });
  }

  // Crates = files lying around their folder room.
  const filesByPlan = new Map<number, FileInfo[]>();
  for (const f of a.files) {
    if (f.pit || f.binary) continue;
    const plan = planForFile(f.path);
    let list = filesByPlan.get(plan.id);
    if (!list) filesByPlan.set(plan.id, (list = []));
    list.push(f);
  }
  for (const plan of [...chain, ...placedSides]) {
    const list = filesByPlan.get(plan.id);
    if (!list || plan.kind === 'boss') continue;
    list.sort((x, y) => y.size - x.size || x.path.localeCompare(y.path));
    const cap = Math.min(G.maxCratesPerRoom, Math.floor((plan.w * plan.h) / 22));
    for (const f of list.slice(0, cap)) {
      const s = spot(plan, { edge: true });
      if (!s) continue;
      add({
        kind: 'crate',
        ...s,
        room: plan.id,
        label: f.name,
        text: `${f.path} · ${formatBytes(f.size)}${f.lang ? ` · ${f.lang}` : ''}`,
        path: f.path,
        loc: f.loc,
        url: blobUrl(htmlUrl, sha, f.path),
        meta: { size: f.size, language: f.lang, barrel: f.code ? false : true },
      });
    }
  }

  // Decorations: torches on top walls, banners, cobwebs.
  const deco = rng.fork('deco');
  for (const p of allPlans) {
    const r = p.rect;
    const y = r.y - 1;
    let placed = 0;
    for (let x = r.x + 1 + deco.int(0, 2); x < r.x + r.w - 1 && placed < 4; x += deco.int(4, 6)) {
      if (at(x, y) !== WALL || at(x - 1, y) !== WALL || at(x + 1, y) !== WALL) continue;
      add({ kind: 'torch', x, y, room: p.id }, false);
      placed++;
    }
    if (a.abandoned && p.kind !== 'treasury') {
      add({ kind: 'cobweb', x: r.x, y: r.y, room: p.id, meta: { flip: false } }, false);
      add({ kind: 'cobweb', x: r.x + r.w - 1, y: r.y, room: p.id, meta: { flip: true } }, false);
    }
  }
  a.languages.slice(0, 3).forEach((lang, i) => {
    const x = entrance.rect.x + 2 + i * 4 + 1;
    const y = entrance.rect.y - 1;
    if (at(x, y) === WALL && !entities.some((e) => e.kind === 'torch' && e.x === x && e.y === y)) {
      add({ kind: 'banner', x, y, room: entrance.id, label: lang.name, meta: { color: lang.color } }, false);
    }
  });

  // ------------------------------------------------------------------
  // 6. Assemble.
  // ------------------------------------------------------------------
  const rooms: Room[] = allPlans
    .sort((x, y) => x.id - y.id)
    .map((p) => ({
      id: p.id,
      kind: p.kind,
      label: p.label,
      folder: p.folder,
      rect: p.rect,
      files: p.files,
      bytes: p.bytes,
      depth: p.depth,
      order: p.order,
    }));

  let tiles = '';
  for (let i = 0; i < grid.length; i++) tiles += TILE_CHARS[grid[i]];

  const enemyKinds: EntityKind[] = ['goblin', 'slime', 'ghost', 'skeleton', 'miniboss', 'boss'];
  const stats: DungeonStats = {
    files: a.files.filter((f) => !f.pit).length,
    folders: Math.max(0, a.folders.size - 1),
    codeFiles: a.codeFiles.length,
    totalLoc: a.totalLoc,
    scannedFiles: a.todoScannedFiles,
    scannedLoc: a.scannedLoc,
    todos: a.todos.length,
    todosInDungeon: goblins,
    openIssues: snapshot.openIssuesCount,
    staleBranches: a.staleBranches ? a.staleBranches.length : null,
    contributors: snapshot.contributors.length,
    maxDepth: a.maxDepth,
    deepestPath: a.deepestPath,
    rooms: rooms.length,
    enemies: entities.filter((e) => enemyKinds.includes(e.kind)).length,
    testFiles: a.testFiles.length,
    lockfileLoc: a.lockfiles.reduce((s, f) => s + f.loc, 0),
  };

  const findings: Findings = {
    bigFiles: a.bigFiles.map((f) => ({ path: f.path, loc: f.loc, exact: f.exact, url: blobUrl(htmlUrl, sha, f.path) })),
    todos: a.todos.slice(0, 500).map((t) => ({ ...t, url: blobUrl(htmlUrl, sha, t.path, t.line) })),
    todoTotal: a.todos.length,
    todoScannedFiles: a.todoScannedFiles,
    staleBranches: a.staleBranches,
    curses: a.curses,
    quests,
    guardians: a.guardians,
    lockfiles: a.lockfiles.map((f) => ({ path: f.path, loc: f.loc })),
  };

  return {
    version: 1,
    generator: GENERATOR_VERSION,
    repo: {
      owner: snapshot.owner,
      name: snapshot.name,
      fullName,
      description: snapshot.description,
      htmlUrl: snapshot.htmlUrl,
      avatarUrl: snapshot.avatarUrl,
      stars: snapshot.stars,
      forks: snapshot.forks,
      license: snapshot.license,
      primaryLanguage: a.primaryLanguage,
      languages: a.languages,
      sha: snapshot.sha,
      defaultBranch: snapshot.defaultBranch,
      createdAt: snapshot.createdAt,
      pushedAt: snapshot.pushedAt,
      source: snapshot.source,
      private: snapshot.private,
    },
    seed,
    theme: a.theme,
    title: a.title,
    abandoned: a.abandoned,
    map: { width: W, height: H, tiles },
    rooms,
    corridors,
    entities,
    spawn,
    boss,
    stats,
    findings,
    health: a.health,
    readme,
    notes: a.notes,
    generatedAt: snapshot.fetchedAt,
  };
}

function selectFolders(a: Analysis): FolderInfo[] {
  const max = TUNING.generator.maxFolderRooms;
  const candidates = [...a.folders.values()].filter((f) => f.path !== '' && f.totalFiles > 0 && !excludedFolder(f.path));
  const score = (f: FolderInfo) =>
    Math.pow(f.totalFiles, 0.6) / (1 + 0.45 * (f.depth - 1)) + (f.directFiles >= 3 ? 0.8 : 0) + (f.codeFiles > 0 ? 0.5 : 0);
  const chosen = new Set<string>();
  const topLevel = candidates
    .filter((f) => f.depth === 1 && f.totalFiles >= 2)
    .sort((x, y) => y.totalFiles - x.totalFiles || x.path.localeCompare(y.path))
    .slice(0, Math.min(12, max));
  for (const f of topLevel) chosen.add(f.path);
  const rest = candidates
    .filter((f) => !chosen.has(f.path) && f.totalFiles >= 2)
    .sort((x, y) => score(y) - score(x) || x.path.localeCompare(y.path));
  for (const f of rest) {
    if (chosen.size >= max) break;
    chosen.add(f.path);
  }
  if (chosen.size < 2) {
    for (const f of candidates.sort((x, y) => y.totalFiles - x.totalFiles)) {
      if (chosen.size >= max) break;
      chosen.add(f.path);
    }
  }
  return [...chosen].map((p) => a.folders.get(p)!).filter(Boolean);
}

function genericTaunts(file: FileInfo): string[] {
  const loc = file.loc.toLocaleString('en-US');
  return [
    `I am ${loc} lines of pure legacy.`,
    'Refactor me? Many have tried.',
    'Every line here was "temporary".',
    'I have no tests. I fear nothing.',
    `${file.name} does not do "small functions".`,
    'You will need more than a linter.',
  ];
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** Apply one of the 8 square symmetries to a cell on an n x n grid. */
function dihedral(t: number, x: number, y: number, n: number): { cx: number; cy: number } {
  const m = n - 1;
  switch (t) {
    case 1:
      return { cx: m - x, cy: y };
    case 2:
      return { cx: x, cy: m - y };
    case 3:
      return { cx: m - x, cy: m - y };
    case 4:
      return { cx: y, cy: x };
    case 5:
      return { cx: m - y, cy: x };
    case 6:
      return { cx: y, cy: m - x };
    case 7:
      return { cx: m - y, cy: m - x };
    default:
      return { cx: x, cy: y };
  }
}

