// Writes the monster sprites as SVG files into dist/sprites, where the extension
// points its decorations. With --icon it also renders media/icon.png (128x128).
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32, deflateSync } from 'node:zlib';
import { BONES, GOBLIN_A, type PixelSprite } from '../../web/src/art/sprites.js';
import { monsterSvg, spriteSvg } from '../src/sprites.js';
import type { MonsterKind } from '../src/game.js';

const SPRITE_PX = 18;
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const out = join(root, 'dist', 'sprites');
mkdirSync(out, { recursive: true });
const kinds: MonsterKind[] = ['goblin', 'skeleton', 'slime', 'ghost'];
for (const kind of kinds) {
  for (const frame of [0, 1] as const) writeFileSync(join(out, `${kind}-${frame}.svg`), monsterSvg(kind, frame, SPRITE_PX));
}
writeFileSync(join(out, 'bones.svg'), spriteSvg(BONES, SPRITE_PX));
console.log(`[gitcrawl-vscode] wrote ${kinds.length * 2 + 1} sprites to dist/sprites`);

if (process.argv.includes('--icon')) {
  writeFileSync(join(root, 'media', 'icon.png'), iconPng(GOBLIN_A, 128, '#1a1222'));
  console.log('[gitcrawl-vscode] wrote media/icon.png');
}

/** The sprite scaled up with nearest-neighbour on a solid background, as a PNG. */
function iconPng(sprite: PixelSprite, size: number, background: string): Buffer {
  const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const bg = rgb(background);
  // Crop the empty rows above the goblin and centre it with a small margin.
  const rows = sprite.rows.filter((r, i) => r.replace(/\./g, '') !== '' || i > 8);
  const w = sprite.rows[0].length;
  const cell = Math.floor((size * 0.8) / Math.max(w, rows.length));
  const ox = Math.floor((size - w * cell) / 2);
  const oy = Math.floor((size - rows.length * cell) / 2);
  const raw = Buffer.alloc(size * (size * 3 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const sx = Math.floor((x - ox) / cell);
      const sy = Math.floor((y - oy) / cell);
      const c = x >= ox && y >= oy ? rows[sy]?.[sx] : undefined;
      const hex = c && c !== '.' ? sprite.colors[c] : undefined;
      const [r, g, b] = hex ? rgb(hex) : bg;
      raw.set([r, g, b], y * (size * 3 + 1) + 1 + x * 3);
    }
  }
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 2, 0, 0, 0], 8); // 8-bit RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
