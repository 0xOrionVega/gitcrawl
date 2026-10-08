/** In-run heads-up display: hearts, weapons, room banner, boss bar, counters, minimap, hints, event feed. */
import { formatDuration, formatNumber, getTheme, type DungeonSpec } from '@gitcrawl/shared';
import { h, clear } from '../util/dom';
import { bus, getDungeon } from '../game/host';
import { WEAPONS, type RunStats, type WeaponId } from '../game/types';
import { icons, weaponIcon } from './icons';
import { audio } from '../audio/audio';

export interface HudCallbacks {
  onMenu: () => void;
  onRecord: () => void;
  onInteract: () => void;
}

export class Hud {
  readonly root: HTMLElement;
  private hearts: HTMLElement;
  private shieldEl: HTMLElement;
  private weaponBtns = new Map<WeaponId, HTMLButtonElement>();
  private banner: HTMLElement;
  private bannerTimer = 0;
  private bossbar: HTMLElement;
  private bossFill: HTMLElement;
  private bossName: HTMLElement;
  private bossLoc: HTMLElement;
  private timer: HTMLElement;
  private goblins: HTMLElement;
  private rooms: HTMLElement;
  private muteBtn: HTMLButtonElement;
  private recBtn: HTMLButtonElement;
  private hintEl: HTMLElement;
  private feed: HTMLElement;
  private mmCanvas: HTMLCanvasElement;
  private mmLabel: HTMLElement;
  private mmWrap: HTMLElement;
  private spec: DungeonSpec | null = null;
  private mmTimer = 0;
  private unsub: (() => void)[] = [];
  private bigmap: HTMLElement;

  constructor(parent: HTMLElement, private cb: HudCallbacks) {
    this.hearts = h('div', { class: 'hearts', 'aria-label': 'Health' });
    this.shieldEl = h('span', { class: 'shield-count', hidden: true });
    const weapons = h('div', { class: 'weapons', role: 'group', 'aria-label': 'Weapons' });
    WEAPONS.forEach((w, i) => {
      const b = h(
        'button',
        { class: 'weapon', title: `${w} (${i + 1})`, 'aria-label': w, onclick: () => getDungeon()?.setWeapon(w) },
        h('img', { class: 'px', src: weaponIcon(w), alt: '' }),
        h('kbd', {}, String(i + 1)),
      );
      this.weaponBtns.set(w, b);
      weapons.append(b);
    });
    const vitals = h('div', { class: 'panel vitals' }, h('div', { style: 'display:flex;align-items:center;gap:10px' }, this.hearts, this.shieldEl), weapons);

    this.banner = h('div', { class: 'panel room-banner', role: 'status', 'aria-live': 'polite' });
    this.bossName = h('b');
    this.bossLoc = h('span', { class: 'muted' });
    this.bossFill = h('div', { class: 'fill', style: 'width:100%' });
    this.bossbar = h('div', { class: 'panel bossbar', hidden: true }, h('div', { class: 'name' }, this.bossName, this.bossLoc), h('div', { class: 'bar' }, this.bossFill));
    const center = h('div', { class: 'hud-center' }, this.banner, this.bossbar);

    this.timer = h('span', { class: 'v' }, '0:00');
    this.goblins = h('span', { class: 'v' }, '0');
    this.rooms = h('span', { class: 'v' }, '0');
    const counters = h(
      'div',
      { class: 'panel counters' },
      h('span', { title: 'Time' }, this.timer),
      h('span', { title: 'TODOs resolved' }, 'TODOs ', this.goblins),
      h('span', { title: 'Rooms explored' }, 'Rooms ', this.rooms),
    );
    this.muteBtn = h('button', { class: 'icon-btn', title: 'Sound (M)', 'aria-label': 'Toggle sound', onclick: () => audio.toggleMute() }, '♪');
    this.recBtn = h('button', { class: 'icon-btn', title: 'Record a 10 second clip', 'aria-label': 'Record clip', onclick: () => cb.onRecord() }, 'REC');
    const menuBtn = h('button', { class: 'icon-btn', title: 'Menu (Esc)', 'aria-label': 'Menu', onclick: () => cb.onMenu() }, '≡');
    const right = h('div', { class: 'hud-right' }, counters, h('div', { class: 'hud-buttons' }, this.recBtn, this.muteBtn, menuBtn));

    this.hintEl = h('div', { class: 'panel hint', hidden: true, role: 'button', onclick: () => cb.onInteract() });
    this.feed = h('div', { class: 'feed', 'aria-live': 'polite' });
    this.mmCanvas = h('canvas', { width: 10, height: 10 });
    this.mmWrap = h('div', { class: 'panel minimap', title: 'Map (click to enlarge)', onclick: () => this.openBigMap() }, this.mmCanvas);
    this.mmLabel = h('div', { class: 'minimap-label panel', hidden: true });
    this.mmCanvas.addEventListener('mousemove', (ev) => this.onMinimapHover(ev));
    this.mmCanvas.addEventListener('mouseleave', () => (this.mmLabel.hidden = true));
    const help = h('div', { class: 'panel controls-help' }, 'WASD to move, click to attack, 1–3 to switch weapons, E to use, Esc for the menu');
    this.bigmap = h('div', { class: 'overlay bigmap', hidden: true, onclick: () => (this.bigmap.hidden = true) });

    this.root = h('div', { class: 'hud', hidden: true }, h('div', { class: 'hud-top' }, vitals, center, right), this.hintEl, this.feed, this.mmWrap, this.mmLabel, help, this.bigmap);
    parent.append(this.root);
    audio.onMuteChange((m) => this.renderMute(m));
    this.renderMute(audio.muted);
  }

  private renderMute(muted: boolean) {
    this.muteBtn.classList.toggle('on', !muted);
    this.muteBtn.textContent = muted ? '×' : '♪';
    this.muteBtn.setAttribute('aria-pressed', String(!muted));
  }

  setRecording(on: boolean) {
    this.recBtn.classList.toggle('rec', on);
    this.recBtn.textContent = on ? '● REC' : 'REC';
  }

  show(spec: DungeonSpec) {
    this.spec = spec;
    this.root.hidden = false;
    this.bossbar.hidden = true;
    clear(this.feed);
    this.hintEl.hidden = true;
    this.banner.classList.remove('show');
    this.renderHearts(10, 10, 0);
    this.renderWeapon('sword');
    const theme = getTheme(spec.theme);
    this.mmCanvas.width = spec.map.width;
    this.mmCanvas.height = spec.map.height;
    this.mmCanvas.style.background = theme.palette.void;
    this.root.style.setProperty('--mm-h', `${Math.round((168 * spec.map.height) / spec.map.width) + 14}px`);
    this.unsub.forEach((u) => u());
    this.unsub = [
      bus.on('hp', (p) => this.renderHearts(p.hp, p.max, p.shield)),
      bus.on('weapon', (p) => this.renderWeapon(p.weapon)),
      bus.on('room', (p) => this.renderRoom(p.label, p.kind, p.files)),
      bus.on('boss', (p) => this.renderBoss(p)),
      bus.on('stats', (s) => this.renderStats(s)),
      bus.on('hint', (p) => this.renderHint(p?.text ?? null)),
      bus.on('log', (p) => this.addLog(p.text)),
      bus.on('powerup', (p) => this.renderHearts(-1, -1, p.shield)),
    ];
    window.clearInterval(this.mmTimer);
    this.mmTimer = window.setInterval(() => this.drawMinimap(), 250);
  }

  hide() {
    this.root.hidden = true;
    this.bigmap.hidden = true;
    window.clearInterval(this.mmTimer);
    this.unsub.forEach((u) => u());
    this.unsub = [];
  }

  private lastHp = { hp: 10, max: 10 };

  private renderHearts(hp: number, max: number, shield: number) {
    if (hp < 0) ({ hp, max } = this.lastHp);
    this.lastHp = { hp, max };
    clear(this.hearts);
    const ic = icons();
    for (let i = 0; i < Math.ceil(max / 2); i++) {
      const v = hp - i * 2;
      const src = v >= 2 ? ic.heartFull : v === 1 ? ic.heartHalf : ic.heartEmpty;
      this.hearts.append(h('img', { class: 'px', src, alt: '' }));
    }
    this.hearts.setAttribute('aria-label', `Health ${hp} of ${max}`);
    this.shieldEl.hidden = shield <= 0;
    clear(this.shieldEl);
    if (shield > 0) this.shieldEl.append(h('img', { class: 'px', src: ic.shield, alt: '', width: 20, height: 20 }), `×${shield}`);
  }

  private renderWeapon(w: WeaponId) {
    for (const [id, b] of this.weaponBtns) b.classList.toggle('active', id === w);
  }

  private renderRoom(label: string, kind: string, files: number) {
    clear(this.banner);
    const name = kind === 'folder' ? `/${label}` : label;
    this.banner.append(h('span', { class: 'path' }, name));
    if (kind === 'folder' || kind === 'entrance') this.banner.append(' ', h('span', { class: 'meta' }, `${formatNumber(files)} files`));
    this.banner.classList.add('show');
    window.clearTimeout(this.bannerTimer);
    this.bannerTimer = window.setTimeout(() => this.banner.classList.remove('show'), 3200);
  }

  private renderBoss(p: { state: string; name: string; hp: number; maxHp: number; loc: number; locLeft: number }) {
    if (p.state === 'defeated') {
      this.bossFill.style.width = '0%';
      window.setTimeout(() => (this.bossbar.hidden = true), 1200);
      return;
    }
    this.bossbar.hidden = false;
    this.bossName.textContent = p.name;
    this.bossLoc.textContent = `${formatNumber(p.locLeft)} ${p.locLeft === 1 ? 'line' : 'lines'} left`;
    this.bossFill.style.width = `${Math.max(0, (p.hp / p.maxHp) * 100)}%`;
  }

  private renderStats(s: RunStats) {
    this.timer.textContent = formatDuration(s.timeMs);
    this.goblins.textContent = `${s.goblinsKilled}/${s.goblinsTotal}`;
    this.rooms.textContent = `${s.roomsVisited}/${s.roomsTotal}`;
  }

  private renderHint(text: string | null) {
    if (!text) {
      this.hintEl.hidden = true;
      return;
    }
    clear(this.hintEl);
    this.hintEl.append(h('kbd', {}, 'E'), text);
    this.hintEl.hidden = false;
  }

  addLog(text: string) {
    const row = h('div', {}, text);
    this.feed.prepend(row);
    while (this.feed.childElementCount > 4) this.feed.lastElementChild?.remove();
    window.setTimeout(() => row.remove(), 5200);
  }

  // ---------------------------------------------------------------- minimap
  private drawMinimap(canvas = this.mmCanvas, scale = 1) {
    const scene = getDungeon();
    if (!scene || !this.spec) return;
    const st = scene.getMinimapState();
    const ctx = canvas.getContext('2d')!;
    const theme = getTheme(this.spec.theme).palette;
    const W = st.w;
    const H = st.h;
    const img = ctx.createImageData(W, H);
    const floor = hexRgb(theme.floorAlt);
    const corridor = hexRgb(theme.corridor);
    const wall = hexRgb(theme.wallFace);
    const current = hexRgb('#ffb648');
    const curRoom = st.rooms.find((r) => r.id === st.currentRoom);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        const seen = st.fog ? st.fog[i] > 0 : true;
        if (!seen) continue;
        const t = st.tiles[i];
        let c: number[] | null = null;
        if (t === '.') c = floor;
        else if (t === ',') c = corridor;
        else if (t === '#') c = wall;
        else if (t === 'o') c = [10, 6, 20];
        if (!c) continue;
        if (curRoom && t === '.' && x >= curRoom.rect.x && x < curRoom.rect.x + curRoom.rect.w && y >= curRoom.rect.y && y < curRoom.rect.y + curRoom.rect.h) {
          c = [Math.round((c[0] + current[0]) / 2), Math.round((c[1] + current[1]) / 2), Math.round((c[2] + current[2]) / 2)];
        }
        img.data[i * 4] = c[0];
        img.data[i * 4 + 1] = c[1];
        img.data[i * 4 + 2] = c[2];
        img.data[i * 4 + 3] = 255;
      }
    }
    if (scale === 1) {
      ctx.putImageData(img, 0, 0);
    } else {
      const tmp = document.createElement('canvas');
      tmp.width = W;
      tmp.height = H;
      tmp.getContext('2d')!.putImageData(img, 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = theme.void;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(tmp, 0, 0, W * scale, H * scale);
    }
    // Markers
    const mark = (x: number, y: number, color: string, size: number) => {
      ctx.fillStyle = color;
      ctx.fillRect(Math.round(x * scale - size / 2), Math.round(y * scale - size / 2), size, size);
    };
    const visible = (r: { rect: { x: number; y: number; w: number; h: number } }) =>
      !st.fog || st.fog[(r.rect.y + 1) * W + r.rect.x + 1] > 0;
    for (const r of st.rooms) {
      if (!visible(r)) continue;
      const cx = r.rect.x + r.rect.w / 2;
      const cy = r.rect.y + r.rect.h / 2;
      if (r.kind === 'boss' && st.bossAlive) mark(cx, cy, '#ff4d6d', 3 * scale);
      if (r.kind === 'treasury') mark(cx, cy, '#ffd166', 2 * scale);
      if (st.questRooms.includes(r.id) && !st.visited.has(r.id)) mark(cx, cy, '#8fb7ff', 2 * scale);
    }
    if (st.hero) mark(st.hero.x, st.hero.y - 0.3, '#ffffff', Math.max(2, 2 * scale));
    if (scale > 1) {
      ctx.font = `${Math.max(10, Math.round(scale * 2.6))}px "Pixelify Sans", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const r of st.rooms) {
        if (!visible(r)) continue;
        const label = r.kind === 'folder' ? r.label.split('/').pop()! : r.label;
        const x = (r.rect.x + r.rect.w / 2) * scale;
        const y = (r.rect.y + r.rect.h / 2) * scale;
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(12,9,18,0.9)';
        ctx.strokeText(label, x, y);
        ctx.fillStyle = r.id === st.currentRoom ? '#ffb648' : '#f2e6cb';
        ctx.fillText(label, x, y);
      }
    }
  }

  private onMinimapHover(ev: MouseEvent) {
    const scene = getDungeon();
    if (!scene || !this.spec) return;
    const rect = this.mmCanvas.getBoundingClientRect();
    const x = ((ev.clientX - rect.left) / rect.width) * this.spec.map.width;
    const y = ((ev.clientY - rect.top) / rect.height) * this.spec.map.height;
    const st = scene.getMinimapState();
    const room = st.rooms.find((r) => x >= r.rect.x - 1 && x <= r.rect.x + r.rect.w + 1 && y >= r.rect.y - 1 && y <= r.rect.y + r.rect.h + 1);
    const seen = room && (!st.fog || st.fog[(room.rect.y + 1) * st.w + room.rect.x + 1] > 0);
    if (room && seen) {
      this.mmLabel.textContent = room.kind === 'folder' ? `/${room.label}` : room.label;
      this.mmLabel.hidden = false;
    } else {
      this.mmLabel.hidden = true;
    }
  }

  openBigMap() {
    if (!this.spec) return;
    const scale = Math.max(3, Math.min(8, Math.floor(Math.min((window.innerWidth - 40) / this.spec.map.width, (window.innerHeight - 100) / this.spec.map.height))));
    const canvas = h('canvas', { width: this.spec.map.width * scale, height: this.spec.map.height * scale });
    clear(this.bigmap);
    this.bigmap.append(h('div', { class: 'bigmap-inner' }, canvas, h('div', { class: 'caption' }, 'Explored rooms are labelled with their folder. Click anywhere to close.')));
    this.bigmap.hidden = false;
    this.drawMinimap(canvas, scale);
  }

  closeBigMap(): boolean {
    if (this.bigmap.hidden) return false;
    this.bigmap.hidden = true;
    return true;
  }
}

function hexRgb(hex: string): number[] {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
