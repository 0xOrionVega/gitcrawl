/**
 * Hilbert curve index -> cell coordinates on an n x n grid (n = power of two).
 * Consecutive indices are always grid-adjacent, so walking the curve gives a
 * compact, winding path — which is exactly what a dungeon corridor chain wants.
 */
export function hilbertD2XY(n: number, d: number): { x: number; y: number } {
  let rx: number;
  let ry: number;
  let t = d;
  let x = 0;
  let y = 0;
  for (let s = 1; s < n; s *= 2) {
    rx = 1 & (t / 2);
    ry = 1 & (t ^ rx);
    if (ry === 0) {
      if (rx === 1) {
        x = s - 1 - x;
        y = s - 1 - y;
      }
      const tmp = x;
      x = y;
      y = tmp;
    }
    x += s * rx;
    y += s * ry;
    t = Math.floor(t / 4);
  }
  return { x, y };
}

/** Smallest power of two n such that n*n >= cells. */
export function hilbertSizeFor(cells: number): number {
  let n = 1;
  while (n * n < cells) n *= 2;
  return Math.max(2, n);
}
