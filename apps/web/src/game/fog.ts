import Phaser from 'phaser';

/**
 * Fog of war as a 1-pixel-per-tile canvas, scaled up with linear filtering so
 * the edges come out soft. States: 0 unexplored, 1 explored, 2 visible.
 */
export class Fog {
  readonly state: Uint8Array;
  private tex: Phaser.Textures.CanvasTexture;
  private img: Phaser.GameObjects.Image;
  private data: ImageData;
  private visible: number[] = [];
  private dirty = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  enabled = true;

  constructor(
    scene: Phaser.Scene,
    private w: number,
    private h: number,
    tile: number,
    private color = [6, 4, 10],
  ) {
    this.state = new Uint8Array(w * h);
    const key = `fog-${Math.random().toString(36).slice(2)}`;
    this.tex = scene.textures.createCanvas(key, w, h)!;
    this.tex.setFilter(Phaser.Textures.FilterMode.LINEAR);
    const ctx = this.tex.getContext();
    this.data = ctx.createImageData(w, h);
    for (let i = 0; i < w * h; i++) {
      this.data.data[i * 4] = color[0];
      this.data.data[i * 4 + 1] = color[1];
      this.data.data[i * 4 + 2] = color[2];
      this.data.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(this.data, 0, 0);
    this.tex.refresh();
    this.img = scene.add.image(0, 0, key).setOrigin(0).setScale(tile).setDepth(9000);
  }

  setEnabled(on: boolean) {
    this.enabled = on;
    this.img.setVisible(on);
  }

  private mark(x: number, y: number) {
    if (x < this.dirty.x0) this.dirty.x0 = x;
    if (y < this.dirty.y0) this.dirty.y0 = y;
    if (x > this.dirty.x1) this.dirty.x1 = x;
    if (y > this.dirty.y1) this.dirty.y1 = y;
  }

  /** Recompute visibility around (cx, cy) plus an optional rect (current room). */
  update(cx: number, cy: number, radius: number, rect: { x: number; y: number; w: number; h: number } | null) {
    for (const idx of this.visible) {
      this.state[idx] = 1;
      this.mark(idx % this.w, Math.floor(idx / this.w));
    }
    const next: number[] = [];
    const r2 = radius * radius;
    for (let y = Math.max(0, cy - radius); y <= Math.min(this.h - 1, cy + radius); y++) {
      for (let x = Math.max(0, cx - radius); x <= Math.min(this.w - 1, cx + radius); x++) {
        const d = (x - cx) * (x - cx) + (y - cy) * (y - cy);
        if (d > r2) continue;
        next.push(y * this.w + x);
      }
    }
    if (rect) {
      for (let y = Math.max(0, rect.y - 1); y <= Math.min(this.h - 1, rect.y + rect.h); y++) {
        for (let x = Math.max(0, rect.x - 1); x <= Math.min(this.w - 1, rect.x + rect.w); x++) next.push(y * this.w + x);
      }
    }
    for (const idx of next) {
      this.state[idx] = 2;
      this.mark(idx % this.w, Math.floor(idx / this.w));
    }
    this.visible = next;
    this.flush();
  }

  revealAll() {
    this.state.fill(2);
    this.dirty = { x0: 0, y0: 0, x1: this.w - 1, y1: this.h - 1 };
    this.flush();
  }

  private flush() {
    const { x0, y0, x1, y1 } = this.dirty;
    if (x1 < x0) return;
    const d = this.data.data;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const i = y * this.w + x;
        const s = this.state[i];
        d[i * 4 + 3] = s === 2 ? 0 : s === 1 ? 140 : 255;
      }
    }
    const ctx = this.tex.getContext();
    ctx.putImageData(this.data, 0, 0, x0, y0, x1 - x0 + 1, y1 - y0 + 1);
    this.tex.refresh();
    this.dirty = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  }

  destroy() {
    this.img.destroy();
    this.tex.destroy();
  }
}
