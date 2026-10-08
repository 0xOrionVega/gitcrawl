/**
 * Procedural textures: every sprite, tile and effect is drawn into canvases at
 * boot. No image assets, so the game is tiny and every theme gets its own
 * stonework.
 */
import Phaser from 'phaser';
import { createRng, getTheme, type DoorKind, type Theme, type ThemeId } from '@gitcrawl/shared';
import * as S from './sprites';
import type { PixelSprite } from './sprites';

export const TILE = {
  FLOOR: [1, 2, 3, 4],
  CORRIDOR: [5, 6],
  FLOOR_SHADOW: 7,
  CORRIDOR_SHADOW: 8,
  WALL_TOP: 9,
  WALL_FACE: [10, 11, 12],
  PIT: 13,
  PIT_EDGE: 14,
  RUG: 15,
} as const;

export function paint(ctx: CanvasRenderingContext2D, sprite: PixelSprite, ox = 0, oy = 0, recolor: Record<string, string> = {}) {
  sprite.rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === '.' || ch === ' ') continue;
      const color = recolor[ch] ?? sprite.colors[ch];
      if (!color) continue;
      ctx.fillStyle = color;
      ctx.fillRect(ox + x, oy + y, 1, 1);
    }
  });
}

function canvas(w: number, h: number): { c: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  return { c, ctx };
}

function addCanvas(scene: Phaser.Scene, key: string, c: HTMLCanvasElement) {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  scene.textures.addCanvas(key, c);
}

/** One texture holding N frames laid out horizontally; frames are named 0..N-1. */
function sheet(scene: Phaser.Scene, key: string, frames: PixelSprite[], fw = 16, fh = 16, recolor: Record<string, string> = {}) {
  const { c, ctx } = canvas(fw * frames.length, fh);
  frames.forEach((f, i) => paint(ctx, f, i * fw, 0, recolor));
  addCanvas(scene, key, c);
  const tex = scene.textures.get(key);
  frames.forEach((_, i) => tex.add(i, 0, i * fw, 0, fw, fh));
}

export function spriteDataUrl(sprite: PixelSprite, scale = 4, recolor: Record<string, string> = {}): string {
  const w = Math.max(...sprite.rows.map((r) => r.length));
  const h = sprite.rows.length;
  const { c, ctx } = canvas(w * scale, h * scale);
  ctx.scale(scale, scale);
  paint(ctx, sprite, 0, 0, recolor);
  return c.toDataURL();
}

function mix(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (n: number, sh: number) => (n >> sh) & 255;
  const r = Math.round(ch(pa, 16) * (1 - t) + ch(pb, 16) * t);
  const g = Math.round(ch(pa, 8) * (1 - t) + ch(pb, 8) * t);
  const bl = Math.round(ch(pa, 0) * (1 - t) + ch(pb, 0) * t);
  return `#${((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1)}`;
}

function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255;
  let g = (n >> 8) & 255;
  let b = n & 255;
  r = Math.max(0, Math.min(255, Math.round(r + amt)));
  g = Math.max(0, Math.min(255, Math.round(g + amt)));
  b = Math.max(0, Math.min(255, Math.round(b + amt)));
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

/** Generates all theme-independent textures once. */
export function makeCommonTextures(scene: Phaser.Scene) {
  sheet(scene, 'hero', [S.HERO_IDLE, S.HERO_WALK_A, S.HERO_WALK_B]);
  sheet(scene, 'goblin', [S.GOBLIN_A, S.GOBLIN_B]);
  sheet(scene, 'skeleton', [S.SKELETON_A, S.SKELETON_B]);
  sheet(scene, 'ghost', [S.GHOST]);
  sheet(scene, 'slime', [S.SLIME]);
  sheet(scene, 'chest', [S.CHEST_CLOSED, S.CHEST_OPEN]);
  sheet(scene, 'crate', [S.CRATE]);
  sheet(scene, 'barrel', [S.BARREL]);
  sheet(scene, 'torch', [S.TORCH_A, S.TORCH_B]);
  sheet(scene, 'questboard', [S.QUESTBOARD]);
  sheet(scene, 'tablet', [S.TABLET]);
  sheet(scene, 'shrine', [S.SHRINE]);
  sheet(scene, 'gold', [S.GOLD]);
  sheet(scene, 'throne', [S.THRONE]);
  sheet(scene, 'cobweb', [S.COBWEB]);
  sheet(scene, 'bones', [S.BONES]);
  sheet(scene, 'potion', [S.ICON_POTION], 12, 12);
  sheet(scene, 'boots', [S.ICON_BOOTS], 12, 12);
  sheet(scene, 'shieldicon', [S.ICON_SHIELD], 12, 12);
  sheet(scene, 'blade', [S.ICON_BLADE], 12, 12);
  sheet(scene, 'heart', [S.HEART_FULL], 9, 8);
  sheet(scene, 'arrow', [S.ARROW], 12, 3);
  sheet(scene, 'brace', [S.BRACE], 6, 9);
  sheet(scene, 'exclaim', [S.EXCLAIM], 5, 7);

  // 2x2 particle
  {
    const { c, ctx } = canvas(2, 2);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, 2, 2);
    addCanvas(scene, 'px', c);
  }
  // soft glow
  {
    const { c, ctx } = canvas(64, 64);
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,0.9)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.35)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    addCanvas(scene, 'glow', c);
    scene.textures.get('glow').setFilter(Phaser.Textures.FilterMode.LINEAR);
  }
  // blob shadow
  {
    const { c, ctx } = canvas(14, 6);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(7, 3, 6, 2.5, 0, 0, Math.PI * 2);
    ctx.fill();
    addCanvas(scene, 'shadow', c);
  }
  // slash arc (drawn white, tinted at runtime)
  {
    const { c, ctx } = canvas(48, 48);
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(24, 24, 18, -Math.PI / 3, Math.PI / 3);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(24, 24, 13, -Math.PI / 4, Math.PI / 4);
    ctx.stroke();
    addCanvas(scene, 'slash', c);
  }
  // shockwave ring
  {
    const { c, ctx } = canvas(64, 64);
    ctx.strokeStyle = 'rgba(255,240,200,0.9)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(32, 32, 28, 0, Math.PI * 2);
    ctx.stroke();
    addCanvas(scene, 'ring', c);
  }
  makeDocGolem(scene, 'boss', 44, 52, { paper: '#f1e7cf', paperDark: '#cbbd98', eye: '#ff3355' });
  makeDocGolem(scene, 'miniboss', 30, 36, { paper: '#e2d6f2', paperDark: '#ae9fc9', eye: '#ffb000' });
  for (const kind of ['wooden', 'iron', 'enchanted', 'rune', 'cursed'] as DoorKind[]) {
    makeDoor(scene, kind, 'v');
    makeDoor(scene, kind, 'h');
  }
}

/** NPC texture with a custom robe colour. */
export function makeNpcTexture(scene: Phaser.Scene, key: string, robe: string) {
  if (scene.textures.exists(key)) return;
  sheet(scene, key, [S.NPC], 16, 16, { r: robe, R: shade(robe, -45) });
}

export function makeBannerTexture(scene: Phaser.Scene, key: string, color: string) {
  if (scene.textures.exists(key)) return;
  sheet(scene, key, [S.BANNER], 16, 16, { b: color, B: shade(color, -50) });
}

/** "Document golem": a page of code that got angry. Two frames: calm, roaring. */
function makeDocGolem(scene: Phaser.Scene, key: string, w: number, h: number, colors: { paper: string; paperDark: string; eye: string }) {
  const { c, ctx } = canvas(w * 2, h);
  const rng = createRng(w * 31 + h);
  for (let f = 0; f < 2; f++) {
    const ox = f * w;
    const bw = Math.round(w * 0.7);
    const bh = Math.round(h * 0.72);
    const bx = ox + Math.round((w - bw) / 2);
    const by = Math.round(h * 0.08);
    const k = '#1a1222';
    // legs
    ctx.fillStyle = k;
    ctx.fillRect(bx + 3, by + bh, 5, h - by - bh - 1);
    ctx.fillRect(bx + bw - 8, by + bh, 5, h - by - bh - 1);
    ctx.fillStyle = '#3b3550';
    ctx.fillRect(bx + 4, by + bh, 3, h - by - bh - 2);
    ctx.fillRect(bx + bw - 7, by + bh, 3, h - by - bh - 2);
    // arms
    const armY = by + Math.round(bh * 0.45) + (f === 1 ? -4 : 0);
    ctx.fillStyle = k;
    ctx.fillRect(bx - 5, armY, 6, 4);
    ctx.fillRect(bx + bw - 1, armY, 6, 4);
    ctx.fillStyle = colors.paperDark;
    ctx.fillRect(bx - 4, armY + 1, 4, 2);
    ctx.fillRect(bx + bw, armY + 1, 4, 2);
    // body outline + paper
    ctx.fillStyle = k;
    ctx.fillRect(bx - 1, by - 1, bw + 2, bh + 2);
    ctx.fillStyle = colors.paper;
    ctx.fillRect(bx, by, bw, bh);
    ctx.fillStyle = colors.paperDark;
    ctx.fillRect(bx + bw - 2, by, 2, bh);
    ctx.fillRect(bx, by + bh - 2, bw, 2);
    // folded corner
    const fc = Math.max(4, Math.round(bw * 0.22));
    ctx.fillStyle = k;
    for (let i = 0; i < fc; i++) ctx.fillRect(bx + bw - fc + i, by + i, fc - i, 1);
    ctx.fillStyle = colors.paperDark;
    for (let i = 0; i < fc - 1; i++) ctx.fillRect(bx + bw - fc, by + i + 1, i + 1, 1);
    // eyes
    const ey = by + Math.round(bh * 0.18);
    const ex1 = bx + Math.round(bw * 0.25);
    const ex2 = bx + Math.round(bw * 0.62);
    ctx.fillStyle = k;
    ctx.fillRect(ex1 - 1, ey - 2, 5, 1);
    ctx.fillRect(ex2, ey - 2, 5, 1);
    ctx.fillStyle = colors.eye;
    ctx.fillRect(ex1, ey, 3, 2);
    ctx.fillRect(ex2 + 1, ey, 3, 2);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(ex1, ey, 1, 1);
    ctx.fillRect(ex2 + 1, ey, 1, 1);
    // mouth
    const my = ey + 5;
    ctx.fillStyle = k;
    if (f === 0) {
      ctx.fillRect(ex1 + 1, my, ex2 - ex1 + 2, 1);
    } else {
      ctx.fillRect(ex1, my - 1, ex2 - ex1 + 4, 4);
      ctx.fillStyle = '#ffffff';
      for (let x = ex1 + 1; x < ex2 + 3; x += 2) ctx.fillRect(x, my - 1, 1, 1);
    }
    // code lines
    const palette = ['#3f7fe0', '#c94a6a', '#2e9e6b', '#8a57d1', '#6a6f88', '#d0892c'];
    for (let ly = my + 5; ly < by + bh - 4; ly += 3) {
      let x = bx + 3 + rng.int(0, 3) * 2;
      const end = bx + bw - 4;
      while (x < end - 2) {
        const len = Math.min(end - x, rng.int(2, 7));
        ctx.fillStyle = palette[rng.int(0, palette.length - 1)];
        ctx.fillRect(x, ly, len, 1);
        x += len + rng.int(1, 3);
        if (rng.chance(0.25)) break;
      }
    }
  }
  addCanvas(scene, key, c);
  const tex = scene.textures.get(key);
  tex.add(0, 0, 0, 0, w, h);
  tex.add(1, 0, w, 0, w, h);
}

const DOOR_COLORS: Record<DoorKind, { base: string; dark: string; band: string; glow?: string }> = {
  wooden: { base: '#9a6234', dark: '#6a3f1f', band: '#3b3346' },
  iron: { base: '#7c8496', dark: '#4e5566', band: '#c9cfdb' },
  enchanted: { base: '#6b3fa8', dark: '#43246f', band: '#d7a8ff', glow: '#e9ccff' },
  rune: { base: '#5c6b70', dark: '#3a4549', band: '#7ff0e0', glow: '#c8fff6' },
  cursed: { base: '#3a1520', dark: '#1f0a10', band: '#9a1f35', glow: '#ff4d6d' },
};

function makeDoor(scene: Phaser.Scene, kind: DoorKind, orientation: 'v' | 'h') {
  const key = `door-${kind}-${orientation}`;
  const long = 48;
  const short = 16;
  const w = orientation === 'v' ? short : long;
  const h = orientation === 'v' ? long : short;
  const { c, ctx } = canvas(w, h);
  const col = DOOR_COLORS[kind];
  ctx.fillStyle = '#1a1222';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = col.base;
  ctx.fillRect(1, 1, w - 2, h - 2);
  // planks along the long axis
  ctx.fillStyle = col.dark;
  for (let i = 4; i < short - 2; i += 4) {
    if (orientation === 'v') ctx.fillRect(i, 1, 1, h - 2);
    else ctx.fillRect(1, i, w - 2, 1);
  }
  // bands across
  ctx.fillStyle = col.band;
  for (const t of [6, 22, 38]) {
    if (orientation === 'v') ctx.fillRect(1, t, w - 2, 2);
    else ctx.fillRect(t, 1, 2, h - 2);
  }
  if (col.glow) {
    ctx.fillStyle = col.glow;
    const rng = createRng(kind.length * 97);
    for (let i = 0; i < 10; i++) {
      const x = rng.int(2, w - 3);
      const y = rng.int(2, h - 3);
      ctx.fillRect(x, y, 1, 1);
    }
  }
  if (kind === 'cursed') {
    // skull
    const cx = Math.floor(w / 2) - 3;
    const cy = Math.floor(h / 2) - 3;
    paint(ctx, { colors: { w: '#e8e2cf', k: '#1a1222' }, rows: ['.wwwww.', 'wwwwwww', 'wkwwwkw', 'wwwkwww', '.wwwww.', '.wkwkw.'] }, cx, cy);
  }
  addCanvas(scene, key, c);
}

/** Per-theme tileset: 16 tiles of 16x16. */
export function makeTileset(scene: Phaser.Scene, themeId: ThemeId): string {
  const key = `tiles-${themeId}`;
  if (scene.textures.exists(key)) return key;
  const theme: Theme = getTheme(themeId);
  const p = theme.palette;
  const { c, ctx } = canvas(16 * 16, 16);
  const rng = createRng(themeId.length * 1013 + themeId.charCodeAt(0));
  const px = (x: number, y: number, color: string) => {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, 1, 1);
  };
  const floor = (i: number, base: string, alt: string, dark: string, slab: number, seedShift: number) => {
    const ox = i * 16;
    ctx.fillStyle = base;
    ctx.fillRect(ox, 0, 16, 16);
    // slabs
    for (let row = 0; row < 16; row += slab) {
      const off = ((row / slab + seedShift) % 2) * (slab === 8 ? 5 : 3);
      ctx.fillStyle = dark;
      ctx.fillRect(ox, row + slab - 1, 16, 1);
      for (let x = off; x < 16; x += slab === 8 ? 10 : 6) ctx.fillRect(ox + x, row, 1, slab - 1);
      // top-left highlight on each slab
      ctx.fillStyle = alt;
      for (let x = off + 1; x < 16; x += slab === 8 ? 10 : 6) ctx.fillRect(ox + x, row, Math.min(3, 15 - x), 1);
    }
    for (let n = 0; n < 9; n++) px(ox + rng.int(0, 15), rng.int(0, 15), rng.chance(0.5) ? alt : dark);
  };
  floor(1, p.floor, p.floorAlt, p.floorDark, 8, 0);
  floor(2, p.floor, p.floorAlt, p.floorDark, 8, 1);
  floor(3, p.floorAlt, shade(p.floorAlt, 10), p.floorDark, 8, 0);
  floor(4, p.floor, p.floorAlt, p.floorDark, 8, 1);
  // cracked variant on 4
  ctx.fillStyle = p.floorDark;
  for (const [x, y] of [[6, 3], [7, 4], [7, 5], [8, 6], [9, 6], [10, 7]]) ctx.fillRect(4 * 16 + x, y, 1, 1);
  floor(5, p.corridor, p.floor, shade(p.corridor, -14), 4, 0);
  floor(6, p.corridor, p.floor, shade(p.corridor, -14), 4, 1);
  // shadows under wall faces
  for (const [i, src] of [
    [7, 1],
    [8, 5],
  ]) {
    ctx.drawImage(c, src * 16, 0, 16, 16, i * 16, 0, 16, 16);
    const g = ctx.createLinearGradient(0, 0, 0, 7);
    g.addColorStop(0, 'rgba(0,0,0,0.45)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(i * 16, 0, 16, 7);
  }
  // wall top
  {
    const ox = 9 * 16;
    ctx.fillStyle = p.wallTop;
    ctx.fillRect(ox, 0, 16, 16);
    for (let n = 0; n < 14; n++) px(ox + rng.int(0, 15), rng.int(0, 15), p.wallTopEdge);
    ctx.fillStyle = p.wallTopEdge;
    ctx.fillRect(ox, 15, 16, 1);
  }
  // wall faces (bricks)
  for (let v = 0; v < 3; v++) {
    const ox = (10 + v) * 16;
    ctx.fillStyle = p.wallFaceDark;
    ctx.fillRect(ox, 0, 16, 16);
    for (let r = 0; r < 4; r++) {
      const off = (r % 2) * 4;
      for (let bx = -off; bx < 16; bx += 8) {
        const x0 = Math.max(0, bx + 1);
        const x1 = Math.min(16, bx + 8);
        if (x1 <= x0) continue;
        ctx.fillStyle = p.wallFace;
        ctx.fillRect(ox + x0, r * 4 + 1, x1 - x0, 3);
        ctx.fillStyle = p.wallFaceLight;
        ctx.fillRect(ox + x0, r * 4 + 1, x1 - x0, 1);
      }
    }
    ctx.fillStyle = p.wallTop;
    ctx.fillRect(ox, 0, 16, 1);
    const g = ctx.createLinearGradient(0, 11, 0, 16);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.35)');
    ctx.fillStyle = g;
    ctx.fillRect(ox, 11, 16, 5);
    if (v === 1) {
      ctx.fillStyle = p.wallFaceDark;
      for (const [x, y] of [[9, 2], [9, 3], [10, 4], [10, 5], [11, 6], [10, 7], [10, 8], [11, 9]]) ctx.fillRect(ox + x, y, 1, 1);
    }
    if (v === 2) {
      ctx.fillStyle = p.accent;
      ctx.globalAlpha = 0.35;
      for (let n = 0; n < 6; n++) ctx.fillRect(ox + rng.int(1, 14), rng.int(9, 14), 1, 1);
      ctx.globalAlpha = 1;
    }
  }
  // pit
  {
    const ox = 13 * 16;
    ctx.fillStyle = '#04020a';
    ctx.fillRect(ox, 0, 16, 16);
    ctx.fillStyle = shade(p.void, 12);
    for (let n = 0; n < 5; n++) ctx.fillRect(ox + rng.int(0, 15), rng.int(0, 15), 1, 1);
    ctx.fillStyle = p.light;
    ctx.globalAlpha = 0.25;
    ctx.fillRect(ox + rng.int(2, 13), rng.int(2, 13), 1, 1);
    ctx.globalAlpha = 1;
  }
  // pit edge (lip)
  {
    const ox = 14 * 16;
    ctx.drawImage(c, 13 * 16, 0, 16, 16, ox, 0, 16, 16);
    ctx.fillStyle = p.floorDark;
    ctx.fillRect(ox, 0, 16, 3);
    ctx.fillStyle = shade(p.floorDark, -20);
    ctx.fillRect(ox, 3, 16, 2);
  }
  // rug: a woven runner in a muted mix of the accent and the floor
  {
    const ox = 15 * 16;
    ctx.fillStyle = mix(p.accent, p.floorDark, 0.72);
    ctx.fillRect(ox, 0, 16, 16);
    ctx.fillStyle = mix(p.accent, p.floorDark, 0.5);
    for (let y = 1; y < 16; y += 5) ctx.fillRect(ox, y, 16, 1);
    ctx.fillStyle = mix(p.accent, p.floorDark, 0.85);
    for (let y = 3; y < 16; y += 5) for (let x = (y % 2) * 2; x < 16; x += 4) ctx.fillRect(ox + x, y, 2, 1);
  }
  addCanvas(scene, key, c);
  return key;
}
