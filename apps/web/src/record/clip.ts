/**
 * Gameplay clips. The game canvas is composited with a small watermark into a
 * recording canvas, so every shared clip carries the repo name and the site.
 *
 * Boss fights use two overlapping recorders (offset by half a period) so that
 * when the boss dies there is always one recording holding the last 8-16 s.
 */
import { getCanvas } from '../game/host';

const PERIOD_MS = 16_000;

function pickMime(): string | null {
  if (typeof MediaRecorder === 'undefined') return null;
  for (const m of ['video/mp4;codecs=avc1', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4']) {
    try {
      if (MediaRecorder.isTypeSupported(m)) return m;
    } catch {
      /* ignore */
    }
  }
  return null;
}

export function clipsSupported(): boolean {
  return pickMime() !== null && typeof HTMLCanvasElement.prototype.captureStream === 'function';
}

class Compositor {
  canvas = document.createElement('canvas');
  private ctx = this.canvas.getContext('2d')!;
  private raf = 0;
  private users = 0;
  label = '';

  start() {
    this.users++;
    if (this.users > 1) return;
    const loop = () => {
      this.draw();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() {
    this.users = Math.max(0, this.users - 1);
    if (this.users === 0) cancelAnimationFrame(this.raf);
  }

  private draw() {
    const src = getCanvas();
    if (!src) return;
    const maxW = 1280;
    const scale = Math.min(1, maxW / src.width);
    const w = Math.round((src.width * scale) / 2) * 2;
    const h = Math.round((src.height * scale) / 2) * 2;
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    const ctx = this.ctx;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(src, 0, 0, w, h);
    const pad = Math.round(h * 0.025);
    const size = Math.max(12, Math.round(h * 0.03));
    ctx.font = `${size}px "Press Start 2P", monospace`;
    ctx.textBaseline = 'bottom';
    const text = `gitcrawl  ${this.label}`;
    const tw = ctx.measureText(text).width;
    ctx.fillStyle = 'rgba(12,9,18,0.7)';
    ctx.fillRect(pad - 8, h - pad - size - 10, tw + 16, size + 16);
    ctx.fillStyle = '#ffb648';
    ctx.fillText(text, pad, h - pad);
  }
}

const compositor = new Compositor();

class Recorder {
  private rec: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  startedAt = 0;
  constructor(private mime: string) {}

  start(stream: MediaStream) {
    this.chunks = [];
    this.rec = new MediaRecorder(stream, { mimeType: this.mime, videoBitsPerSecond: 4_000_000 });
    this.rec.ondataavailable = (e) => e.data.size > 0 && this.chunks.push(e.data);
    this.rec.start(500);
    this.startedAt = performance.now();
  }

  get running() {
    return this.rec?.state === 'recording';
  }

  stop(): Promise<Blob | null> {
    return new Promise((resolve) => {
      const rec = this.rec;
      if (!rec || rec.state === 'inactive') {
        resolve(null);
        return;
      }
      rec.onstop = () => resolve(this.chunks.length ? new Blob(this.chunks, { type: this.mime.split(';')[0] }) : null);
      rec.stop();
    });
  }
}

export interface Clip {
  blob: Blob;
  url: string;
  ext: string;
}

function toClip(blob: Blob, mime: string): Clip {
  return { blob, url: URL.createObjectURL(blob), ext: mime.includes('mp4') ? 'mp4' : 'webm' };
}

export class ClipManager {
  private mime = pickMime();
  private stream: MediaStream | null = null;
  private pair: [Recorder, Recorder] | null = null;
  private timers: number[] = [];
  private manual: Recorder | null = null;
  last: Clip | null = null;

  setLabel(label: string) {
    compositor.label = label;
  }

  private ensureStream(): MediaStream | null {
    if (!this.mime) return null;
    if (!this.stream) {
      compositor.start();
      this.stream = compositor.canvas.captureStream(30);
    } else {
      compositor.start();
    }
    return this.stream;
  }

  /** Start rolling capture (boss fight). */
  startRolling() {
    if (this.pair || !this.mime) return;
    const stream = this.ensureStream();
    if (!stream) return;
    const a = new Recorder(this.mime);
    const b = new Recorder(this.mime);
    this.pair = [a, b];
    const cycle = (r: Recorder) => {
      void r.stop().then(() => this.pair && r.start(stream));
    };
    a.start(stream);
    this.timers.push(window.setInterval(() => cycle(a), PERIOD_MS));
    this.timers.push(
      window.setTimeout(() => {
        if (!this.pair) return;
        b.start(stream);
        this.timers.push(window.setInterval(() => cycle(b), PERIOD_MS));
      }, PERIOD_MS / 2),
    );
  }

  /** Stop rolling capture and keep the longest recent recording. */
  async finishRolling(): Promise<Clip | null> {
    if (!this.pair || !this.mime) return null;
    const [a, b] = this.pair;
    this.pair = null;
    this.timers.forEach((t) => {
      window.clearInterval(t);
      window.clearTimeout(t);
    });
    this.timers = [];
    const now = performance.now();
    const candidates = [a, b].filter((r) => r.running).sort((x, y) => now - y.startedAt - (now - x.startedAt));
    const keep = candidates[0] ?? null;
    const other = candidates[1] ?? null;
    const blob = keep ? await keep.stop() : null;
    if (other) await other.stop();
    compositor.stop();
    if (!blob) return null;
    this.last = toClip(blob, this.mime);
    return this.last;
  }

  /** Record the next `ms` milliseconds. */
  async recordFor(ms: number, onStart?: () => void): Promise<Clip | null> {
    if (!this.mime || this.manual) return null;
    const stream = this.ensureStream();
    if (!stream) return null;
    const r = new Recorder(this.mime);
    this.manual = r;
    r.start(stream);
    onStart?.();
    await new Promise((res) => window.setTimeout(res, ms));
    const blob = await r.stop();
    this.manual = null;
    compositor.stop();
    if (!blob) return null;
    this.last = toClip(blob, this.mime);
    return this.last;
  }

  get recording() {
    return !!this.manual;
  }

  reset() {
    void this.finishRolling();
  }
}

export const clips = new ClipManager();
