/** Open Graph card (PNG via resvg) and README badge (SVG). */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import { getTheme, type DungeonSpec } from '@gitcrawl/shared';

const here = dirname(fileURLToPath(import.meta.url));
const FONT_DIRS = [join(here, '..', 'assets'), join(here, 'assets'), join(process.cwd(), 'assets')];

function fontFiles(): string[] {
  const names = ['PressStart2P_400Regular.ttf', 'PixelifySans_400Regular.ttf'];
  for (const dir of FONT_DIRS) {
    try {
      const files = names.map((n) => join(dir, n));
      files.forEach((f) => readFileSync(f));
      return files;
    } catch {
      /* try next */
    }
  }
  return [];
}

const FONTS = fontFiles();

const x = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function mapRects(spec: DungeonSpec, ox: number, oy: number, w: number, h: number): string {
  const p = getTheme(spec.theme).palette;
  const scale = Math.min(w / spec.map.width, h / spec.map.height);
  const x0 = ox + (w - spec.map.width * scale) / 2;
  const y0 = oy + (h - spec.map.height * scale) / 2;
  const color = (t: string) => (t === '#' ? p.wallFace : t === ',' ? p.corridor : t === 'o' ? '#05030a' : p.floorAlt);
  const out: string[] = [];
  for (let ty = 0; ty < spec.map.height; ty++) {
    let run = '';
    let start = 0;
    const row = spec.map.tiles.slice(ty * spec.map.width, (ty + 1) * spec.map.width);
    for (let tx = 0; tx <= row.length; tx++) {
      const t = tx < row.length ? row[tx] : ' ';
      if (t !== run) {
        if (run && run !== ' ') {
          out.push(
            `<rect x="${(x0 + start * scale).toFixed(1)}" y="${(y0 + ty * scale).toFixed(1)}" width="${((tx - start) * scale + 0.4).toFixed(1)}" height="${(scale + 0.4).toFixed(1)}" fill="${color(run)}"/>`,
          );
        }
        run = t;
        start = tx;
      }
    }
  }
  const lair = spec.rooms.find((r) => r.kind === 'boss');
  if (lair) {
    const cx = x0 + (lair.rect.x + lair.rect.w / 2) * scale;
    const cy = y0 + (lair.rect.y + lair.rect.h / 2) * scale;
    out.push(`<rect x="${cx - 7}" y="${cy - 7}" width="14" height="14" fill="#ff4d6d"/>`);
  }
  return out.join('');
}

export function ogSvg(spec: DungeonSpec | null, siteUrl: string): string {
  const W = 1200;
  const H = 630;
  const host = siteUrl.replace(/^https?:\/\//, '');
  if (!spec) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#120e1a"/>
  <rect x="4" y="4" width="${W - 8}" height="${H - 8}" fill="none" stroke="#44385e" stroke-width="8"/>
  <text x="600" y="260" text-anchor="middle" font-family="Press Start 2P" font-size="88" fill="#f2e6cb">git<tspan fill="#ffb648">crawl</tspan></text>
  <text x="600" y="350" text-anchor="middle" font-family="Pixelify Sans" font-size="44" fill="#f2e6cb">Paste a GitHub repo. Fight its TODOs.</text>
  <text x="600" y="406" text-anchor="middle" font-family="Pixelify Sans" font-size="44" fill="#f2e6cb">Slay its biggest file.</text>
  <text x="600" y="540" text-anchor="middle" font-family="Press Start 2P" font-size="20" fill="#8bd17c">${x(host)}</text>
</svg>`;
  }
  const p = getTheme(spec.theme).palette;
  const name = spec.repo.fullName;
  const nameSize = Math.max(18, Math.min(46, Math.floor(640 / Math.max(1, name.length))));
  const rows: [string, string][] = [];
  if (spec.boss) rows.push(['Boss', `${spec.boss.name}, ${spec.boss.loc.toLocaleString('en-US')} lines`]);
  rows.push(['TODOs found', spec.stats.todos.toLocaleString('en-US')]);
  rows.push(['Files', spec.stats.files.toLocaleString('en-US')]);
  rows.push(['Health', `${spec.health.score}/100 (${spec.health.grade})`]);
  const rowSvg = rows
    .map(([k, v], i) => {
      const y = 320 + i * 50;
      const value = v.length > 30 ? `${v.slice(0, 29)}…` : v;
      return `<text x="60" y="${y}" font-family="Pixelify Sans" font-size="30" fill="#b9aed2">${x(k)}</text><text x="290" y="${y}" font-family="Pixelify Sans" font-size="32" fill="#f2e6cb">${x(value)}</text>`;
    })
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="fade" x1="0" x2="1" y1="0" y2="0">
      <stop offset="0" stop-color="#0c0912" stop-opacity="0.98"/>
      <stop offset="0.55" stop-color="#0c0912" stop-opacity="0.9"/>
      <stop offset="0.7" stop-color="#0c0912" stop-opacity="0.2"/>
      <stop offset="1" stop-color="#0c0912" stop-opacity="0.05"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="${p.void}"/>
  ${mapRects(spec, 700, 50, 470, 530)}
  <rect width="${W}" height="${H}" fill="url(#fade)"/>
  <rect x="4" y="4" width="${W - 8}" height="${H - 8}" fill="none" stroke="#44385e" stroke-width="8"/>
  <text x="60" y="74" font-family="Press Start 2P" font-size="24" fill="#ffb648">gitcrawl</text>
  <text x="60" y="${150 + nameSize / 2}" font-family="Press Start 2P" font-size="${nameSize}" fill="#f2e6cb">${x(name)}</text>
  <text x="60" y="250" font-family="Pixelify Sans" font-size="44" fill="#ffd166">${x(spec.title.name)}</text>
  ${rowSvg}
  <text x="60" y="${H - 52}" font-family="Press Start 2P" font-size="16" fill="#8bd17c">${x(`${host}/r/${name}`.slice(0, 48))}</text>
</svg>`;
}

export function renderPng(svg: string): Buffer {
  const r = new Resvg(svg, {
    font: { fontFiles: FONTS, loadSystemFonts: FONTS.length === 0, defaultFontFamily: 'Pixelify Sans' },
    fitTo: { mode: 'original' },
  });
  return r.render().asPng();
}

const GRADE_COLOR: Record<string, string> = { S: '#3fb950', A: '#3fb950', B: '#d29922', C: '#d29922', D: '#e5534b', F: '#e5534b' };

/** shields.io-style badge. */
export function badgeSvg(spec: DungeonSpec | null): string {
  const left = 'gitcrawl';
  const right = spec ? `health ${spec.health.score} (${spec.health.grade})` : 'play this repo';
  const color = spec ? GRADE_COLOR[spec.health.grade] ?? '#8b5cf6' : '#e07b24';
  const cw = (s: string) => Math.round(s.length * 6.6 + 12);
  const lw = cw(left);
  const rw = cw(right);
  const w = lw + rw;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="20" role="img" aria-label="${x(`${left}: ${right}`)}">
  <title>${x(`${left}: ${right}`)}</title>
  <linearGradient id="s" x2="0" y2="100%"><stop offset="0" stop-color="#bbb" stop-opacity=".1"/><stop offset="1" stop-opacity=".1"/></linearGradient>
  <clipPath id="r"><rect width="${w}" height="20" rx="3" fill="#fff"/></clipPath>
  <g clip-path="url(#r)">
    <rect width="${lw}" height="20" fill="#1b1528"/>
    <rect x="${lw}" width="${rw}" height="20" fill="${color}"/>
    <rect width="${w}" height="20" fill="url(#s)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11">
    <text x="${lw / 2}" y="15" fill="#010101" fill-opacity=".3">${left}</text>
    <text x="${lw / 2}" y="14" fill="#ffb648">${left}</text>
    <text x="${lw + rw / 2}" y="15" fill="#010101" fill-opacity=".3">${x(right)}</text>
    <text x="${lw + rw / 2}" y="14">${x(right)}</text>
  </g>
</svg>`;
}
