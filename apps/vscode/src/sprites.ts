/**
 * The web game's pixel art as SVG, written to dist/sprites at build time for
 * the editor decorations. One <rect> per run of same-coloured pixels.
 */
import {
  GHOST,
  GOBLIN_A,
  GOBLIN_B,
  SKELETON_A,
  SKELETON_B,
  SLIME,
  type PixelSprite,
} from '../../web/src/art/sprites.js';
import type { MonsterKind } from './game.js';

export type Frame = 0 | 1;

const FRAMES: Record<MonsterKind, [PixelSprite, PixelSprite]> = {
  goblin: [GOBLIN_A, GOBLIN_B],
  skeleton: [SKELETON_A, SKELETON_B],
  slime: [SLIME, SLIME],
  ghost: [GHOST, GHOST],
};

export function spriteSvg(sprite: PixelSprite, size: number): string {
  const h = sprite.rows.length;
  const w = sprite.rows[0].length;
  const rects: string[] = [];
  sprite.rows.forEach((row, y) => {
    let x = 0;
    while (x < w) {
      const c = row[x];
      let run = 1;
      while (x + run < w && row[x + run] === c) run++;
      const fill = sprite.colors[c];
      if (c !== '.' && fill) rects.push(`<rect x="${x}" y="${y}" width="${run}" height="1" fill="${fill}"/>`);
      x += run;
    }
  });
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${w} ${h}" ` +
    `shape-rendering="crispEdges">${rects.join('')}</svg>`
  );
}

export function monsterSvg(kind: MonsterKind, frame: Frame, size: number): string {
  return spriteSvg(FRAMES[kind][frame], size);
}
