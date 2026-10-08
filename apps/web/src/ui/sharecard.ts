/** 1200x630 share card drawn client-side from the run and the dungeon. */
import { formatDuration, formatNumber, getTheme, type DungeonSpec } from '@gitcrawl/shared';
import type { RunStats } from '../game/types';
import { SITE_URL } from '../config';
import { noLigatures } from '../game/DungeonScene';

const W = 1200;
const H = 630;

function loadImage(src: string, timeout = 1500): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const t = window.setTimeout(() => resolve(null), timeout);
    img.onload = () => {
      window.clearTimeout(t);
      resolve(img);
    };
    img.onerror = () => {
      window.clearTimeout(t);
      resolve(null);
    };
    img.src = src;
  });
}

export function verdictLine(spec: DungeonSpec, stats: RunStats | null): string {
  const b = spec.boss;
  if (!b) return 'Conquered a repo with no code. Flawless, technically.';
  if (stats && stats.deaths === 0 && stats.bossDefeated) return `Beat a ${formatNumber(b.loc)}-line ${b.name} without dying.`;
  if (stats && stats.deaths >= 3) return `Died ${stats.deaths} times to a ${formatNumber(b.loc)}-line ${b.name}. Worth it.`;
  if (spec.stats.todos >= 100) return `${formatNumber(spec.stats.todos)} TODOs in this repo. The goblins have unionized.`;
  return `Refactored a ${formatNumber(b.loc)}-line ${b.name} with a sword.`;
}

function drawMapSilhouette(ctx: CanvasRenderingContext2D, spec: DungeonSpec, x: number, y: number, w: number, h: number) {
  const theme = getTheme(spec.theme).palette;
  const scale = Math.min(w / spec.map.width, h / spec.map.height);
  const ox = x + (w - spec.map.width * scale) / 2;
  const oy = y + (h - spec.map.height * scale) / 2;
  const s = Math.max(1, scale);
  for (let ty = 0; ty < spec.map.height; ty++) {
    for (let tx = 0; tx < spec.map.width; tx++) {
      const t = spec.map.tiles[ty * spec.map.width + tx];
      if (t === ' ') continue;
      ctx.fillStyle = t === '#' ? theme.wallFace : t === ',' ? theme.corridor : t === 'o' ? '#05030a' : theme.floorAlt;
      ctx.fillRect(Math.floor(ox + tx * scale), Math.floor(oy + ty * scale), Math.ceil(s), Math.ceil(s));
    }
  }
  const lair = spec.rooms.find((r) => r.kind === 'boss');
  if (lair) {
    ctx.fillStyle = '#ff4d6d';
    const cx = ox + (lair.rect.x + lair.rect.w / 2) * scale;
    const cy = oy + (lair.rect.y + lair.rect.h / 2) * scale;
    ctx.fillRect(cx - 6, cy - 6, 12, 12);
  }
  const ent = spec.rooms.find((r) => r.kind === 'entrance');
  if (ent) {
    ctx.fillStyle = '#ffb648';
    ctx.fillRect(ox + (ent.rect.x + ent.rect.w / 2) * scale - 5, oy + (ent.rect.y + ent.rect.h / 2) * scale - 5, 10, 10);
  }
}

export async function renderShareCard(spec: DungeonSpec, stats: RunStats | null): Promise<HTMLCanvasElement> {
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;
  const theme = getTheme(spec.theme).palette;
  ctx.fillStyle = theme.void;
  ctx.fillRect(0, 0, W, H);
  drawMapSilhouette(ctx, spec, 700, 50, 470, 530);
  const g = ctx.createLinearGradient(0, 0, W, 0);
  g.addColorStop(0, 'rgba(12,9,18,0.98)');
  g.addColorStop(0.55, 'rgba(12,9,18,0.9)');
  g.addColorStop(0.7, 'rgba(12,9,18,0.2)');
  g.addColorStop(1, 'rgba(12,9,18,0.05)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#44385e';
  ctx.lineWidth = 8;
  ctx.strokeRect(4, 4, W - 8, H - 8);

  const left = 60;
  const maxW = 640;
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#ffb648';
  ctx.font = '24px "Press Start 2P", monospace';
  ctx.fillText('gitcrawl', left, 50);

  let avatarW = 0;
  if (spec.repo.avatarUrl && /^https:\/\/avatars\.githubusercontent\.com\//.test(spec.repo.avatarUrl)) {
    const img = await loadImage(spec.repo.avatarUrl);
    if (img) {
      ctx.drawImage(img, left, 104, 80, 80);
      ctx.strokeStyle = '#0c0912';
      ctx.lineWidth = 4;
      ctx.strokeRect(left, 104, 80, 80);
      avatarW = 100;
    }
  }
  let size = 46;
  const name = spec.repo.fullName;
  ctx.fillStyle = '#f2e6cb';
  do {
    ctx.font = `${size}px "Press Start 2P", monospace`;
    if (ctx.measureText(name).width <= maxW - avatarW) break;
    size -= 2;
  } while (size > 16);
  ctx.fillText(name, left + avatarW, 120 + (46 - size) / 2);

  ctx.font = '44px "Pixelify Sans", sans-serif';
  ctx.fillStyle = '#ffd166';
  ctx.fillText(noLigatures(spec.title.name), left, 208);

  const rows: [string, string][] = [];
  if (stats && stats.timeMs > 0) rows.push(['Cleared in', formatDuration(stats.timeMs)]);
  if (spec.boss) rows.push(['Boss', `${spec.boss.name}, ${formatNumber(spec.boss.loc)} lines`]);
  rows.push(['TODOs found', formatNumber(spec.stats.todos)]);
  if (stats) rows.push(['Goblins slain', formatNumber(stats.goblinsKilled)]);
  rows.push(['Health', `${spec.health.score}/100 (${spec.health.grade})`]);
  let y = 290;
  for (const [k, v] of rows.slice(0, 5)) {
    ctx.font = '30px "Pixelify Sans", sans-serif';
    ctx.fillStyle = '#b9aed2';
    ctx.fillText(noLigatures(k), left, y);
    ctx.font = '32px "Pixelify Sans", sans-serif';
    ctx.fillStyle = '#f2e6cb';
    const vx = left + 230;
    let text = v;
    while (ctx.measureText(text).width > maxW - 230 && text.length > 4) text = `${text.slice(0, -2)}…`;
    ctx.fillText(noLigatures(text), vx, y - 2);
    y += 48;
  }
  ctx.font = '16px "Press Start 2P", monospace';
  ctx.fillStyle = '#8bd17c';
  ctx.fillText(`${SITE_URL.replace(/^https?:\/\//, '')}/r/${spec.repo.fullName}`.slice(0, 44), left, H - 66);
  return c;
}

export function canvasToBlob(c: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      c.toBlob((b) => resolve(b), 'image/png');
    } catch {
      resolve(null);
    }
  });
}
