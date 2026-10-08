/**
 * The dungeon: builds the tilemap and actors from a DungeonSpec and runs the
 * light-action loop (move, slash, shoot, smash, talk, loot, beat the boss).
 * Everything the DOM layer needs is sent over the event bus.
 */
import Phaser from 'phaser';
import {
  TUNING,
  formatNumber,
  getTheme,
  hashString,
  type DungeonSpec,
  type Entity,
  type PowerUp,
  type Room,
} from '@gitcrawl/shared';
import { TILE, makeBannerTexture, makeNpcTexture, makeTileset } from '../art/textures';
import { Fog } from './fog';
import { audio, type Sfx } from '../audio/audio';
import type { Emitter } from '../util/emitter';
import { WEAPONS, type DialogPayload, type GameEvents, type GameMode, type RunStats, type WeaponId } from './types';
import { touchInput } from './input';

const T = 16;
const WALKABLE = new Set(['.', ',', 'o']);
const FONT = '"Pixelify Sans", "Press Start 2P", monospace';

type EnemyKind = 'goblin' | 'slime' | 'ghost' | 'skeleton' | 'miniboss' | 'boss';
type ArcadeSprite = Phaser.Physics.Arcade.Sprite;

interface Enemy {
  kind: EnemyKind;
  entity: Entity;
  sprite: ArcadeSprite;
  shadow: Phaser.GameObjects.Image;
  hp: number;
  maxHp: number;
  speed: number;
  aggro: number;
  damage: number;
  home: { x: number; y: number };
  room: number;
  state: 'idle' | 'chase' | 'stun' | 'telegraph' | 'dash' | 'dead' | 'asleep';
  stunUntil: number;
  nextContactAt: number;
  nextThinkAt: number;
  nextSpecialAt: number;
  dashUntil: number;
  revealed: boolean;
  label: Phaser.GameObjects.Text | null;
  bob: number;
}

interface Interactable {
  id: string;
  x: number;
  y: number;
  range: number;
  hint: () => string | null;
  run: () => void;
}

interface Bubble {
  target: Phaser.GameObjects.Components.Transform & { active: boolean };
  container: Phaser.GameObjects.Container;
  until: number;
  offsetY: number;
}

export interface SceneData {
  spec: DungeonSpec;
  mode: GameMode;
  bus: Emitter<GameEvents>;
}

const POWERUP_INFO: Record<PowerUp, { name: string; text: string; tex: string }> = {
  blade: { name: "Linter's Edge", text: '+1 damage on every weapon', tex: 'blade' },
  boots: { name: 'Turbo Boots', text: '+22% move speed', tex: 'boots' },
  shield: { name: 'Type Shield', text: 'Blocks the next 3 hits', tex: 'shieldicon' },
  potion: { name: 'Potion of Coffee', text: 'Restores 3 hearts', tex: 'potion' },
};

const ENEMY_COLORS: Record<EnemyKind, number> = {
  goblin: 0x79d36a,
  slime: 0xb07cf0,
  ghost: 0xeef2ff,
  skeleton: 0xece5cf,
  miniboss: 0xe2d6f2,
  boss: 0xf1e7cf,
};

export class DungeonScene extends Phaser.Scene {
  private spec!: DungeonSpec;
  private mode: GameMode = 'play';
  private bus!: Emitter<GameEvents>;
  private W = 0;
  private H = 0;
  private tiles = '';
  private roomAt!: Int16Array;
  private roomsById = new Map<number, Room>();

  private walls!: Phaser.Tilemaps.TilemapLayer;
  private pitCol!: Phaser.Tilemaps.TilemapLayer;
  private fog!: Fog;
  private vignette!: Phaser.GameObjects.Image;

  private hero!: ArcadeSprite;
  private heroShadow!: Phaser.GameObjects.Image;
  private hp: number = TUNING.hero.hp;
  private maxHp: number = TUNING.hero.hp;
  private shield = 0;
  private blade = 0;
  private speedMult = 1;
  private invulnUntil = 0;
  private knockUntil = 0;
  private weapon: WeaponId = 'sword';
  private nextAttackAt: Record<WeaponId, number> = { sword: 0, bow: 0, hammer: 0 };
  private aim = 0;
  private busy = false; // dying / falling
  private lastSafe = { x: 0, y: 0 };
  private currentRoom = -1;
  private lastTile = -1;
  private visited = new Set<number>();

  private solids!: Phaser.Physics.Arcade.StaticGroup;
  private doors!: Phaser.Physics.Arcade.StaticGroup;
  private enemyGroup!: Phaser.Physics.Arcade.Group;
  private ghostGroup!: Phaser.Physics.Arcade.Group;
  private arrows!: Phaser.Physics.Arcade.Group;
  private shots!: Phaser.Physics.Arcade.Group;
  private pickups!: Phaser.Physics.Arcade.Group;
  private enemies: Enemy[] = [];
  private enemyBySprite = new Map<Phaser.GameObjects.GameObject, Enemy>();
  private boss: Enemy | null = null;
  private bossActive = false;
  private bossPhase = 1;
  private bossTauntIdx = 0;
  private nextTauntAt = 0;
  private nextBossShotAt = 0;
  private nextSummonAt = 0;
  private interactables: Interactable[] = [];
  private currentHint: Interactable | null = null;
  private nextInteractScan = 0;
  private bubbles: Bubble[] = [];
  private proximityLabels: { text: Phaser.GameObjects.Text; x: number; y: number }[] = [];
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private pointerDown = false;
  private usingPointerAim = false;
  private stats!: RunStats;
  private nextStatsAt = 0;
  private ended = false;
  private questRooms = new Map<number, { number: number; title: string; url: string }[]>();
  private attractTargets: { x: number; y: number }[] = [];
  private attractIdx = 0;
  private nextAttractAt = 0;
  private dialogOpen = false;
  private dialogAnchor: { x: number; y: number } | null = null;
  private particles!: Phaser.GameObjects.Particles.ParticleEmitter;

  constructor() {
    super('dungeon');
  }

  init(data: SceneData) {
    this.spec = data.spec;
    this.mode = data.mode;
    this.bus = data.bus;
    this.W = data.spec.map.width;
    this.H = data.spec.map.height;
    this.tiles = data.spec.map.tiles;
    this.enemies = [];
    this.enemyBySprite.clear();
    this.interactables = [];
    this.bubbles = [];
    this.proximityLabels = [];
    this.visited = new Set();
    this.boss = null;
    this.bossActive = false;
    this.bossPhase = 1;
    this.bossTauntIdx = 0;
    this.hp = TUNING.hero.hp;
    this.maxHp = TUNING.hero.hp;
    this.shield = 0;
    this.blade = 0;
    this.speedMult = 1;
    this.weapon = 'sword';
    this.nextAttackAt = { sword: 0, bow: 0, hammer: 0 };
    this.busy = false;
    this.ended = false;
    this.currentRoom = -1;
    this.lastTile = -1;
    this.currentHint = null;
    this.dialogOpen = false;
    this.questRooms.clear();
  }

  // ------------------------------------------------------------------ helpers
  private tileAt(x: number, y: number): string {
    if (x < 0 || y < 0 || x >= this.W || y >= this.H) return ' ';
    return this.tiles[y * this.W + x];
  }

  private walkable(x: number, y: number) {
    return WALKABLE.has(this.tileAt(x, y));
  }

  private emit<K extends keyof GameEvents>(event: K, payload: GameEvents[K]) {
    this.bus.emit(event, payload);
  }

  private sfx(name: Sfx) {
    if (this.mode !== 'attract') audio.play(name);
  }

  private worldText(text: string, size = 7, color = '#f2e6cb', opts: Partial<Phaser.Types.GameObjects.Text.TextStyle> = {}) {
    const t = this.add.text(0, 0, noLigatures(text), {
      fontFamily: FONT,
      fontSize: `${size}px`,
      color,
      resolution: Math.max(2, Math.ceil(this.cameras.main.zoom * (window.devicePixelRatio || 1))),
      ...opts,
    });
    return t;
  }

  // ------------------------------------------------------------------ create
  create() {
    const theme = getTheme(this.spec.theme);
    this.cameras.main.setBackgroundColor(theme.palette.void);
    const tilesetKey = makeTileset(this, this.spec.theme);

    this.buildRoomIndex();
    this.buildTilemap(tilesetKey);

    this.solids = this.physics.add.staticGroup();
    this.doors = this.physics.add.staticGroup();
    this.enemyGroup = this.physics.add.group();
    this.ghostGroup = this.physics.add.group();
    this.arrows = this.physics.add.group();
    this.shots = this.physics.add.group();
    this.pickups = this.physics.add.group();

    this.particles = this.add.particles(0, 0, 'px', {
      lifespan: { min: 300, max: 700 },
      speed: { min: 30, max: 110 },
      scale: { start: 1, end: 0 },
      gravityY: 120,
      emitting: false,
    });
    this.particles.setDepth(8000);

    const spawn = { x: this.spec.spawn.x * T + T / 2, y: this.spec.spawn.y * T + T - 2 };
    this.hero = this.physics.add.sprite(spawn.x, spawn.y, 'hero', 0).setOrigin(0.5, 1);
    (this.hero.body as Phaser.Physics.Arcade.Body).setSize(10, 7).setOffset(3, 9);
    this.heroShadow = this.add.image(spawn.x, spawn.y, 'shadow').setDepth(5);
    this.lastSafe = { ...spawn };
    if (!this.anims.exists('hero-walk')) {
      this.anims.create({ key: 'hero-walk', frames: this.anims.generateFrameNumbers('hero', { frames: [1, 0, 2, 0] }), frameRate: 10, repeat: -1 });
      this.anims.create({ key: 'goblin-walk', frames: this.anims.generateFrameNumbers('goblin', { frames: [0, 1] }), frameRate: 6, repeat: -1 });
      this.anims.create({ key: 'skeleton-walk', frames: this.anims.generateFrameNumbers('skeleton', { frames: [0, 1] }), frameRate: 5, repeat: -1 });
      this.anims.create({ key: 'torch-burn', frames: this.anims.generateFrameNumbers('torch', { frames: [0, 1] }), frameRate: 5, repeat: -1 });
    }

    this.buildEntities();

    // Physics wiring.
    this.physics.add.collider(this.hero, this.walls);
    this.physics.add.collider(this.hero, this.solids);
    this.physics.add.collider(this.hero, this.doors);
    this.physics.add.collider(this.enemyGroup, this.walls);
    this.physics.add.collider(this.enemyGroup, this.pitCol);
    this.physics.add.collider(this.enemyGroup, this.solids);
    this.physics.add.collider(this.enemyGroup, this.doors);
    this.physics.add.collider(this.enemyGroup, this.enemyGroup);
    this.physics.add.overlap(this.hero, this.enemyGroup, (_h, e) => this.onEnemyTouch(e as ArcadeSprite));
    this.physics.add.overlap(this.hero, this.ghostGroup, (_h, e) => this.onEnemyTouch(e as ArcadeSprite));
    this.physics.add.collider(this.arrows, this.walls, (a) => this.killArrow(a as ArcadeSprite));
    this.physics.add.collider(this.arrows, this.doors, (a) => this.killArrow(a as ArcadeSprite));
    this.physics.add.overlap(this.arrows, this.enemyGroup, (a, e) => this.onArrowHit(a as ArcadeSprite, e as ArcadeSprite));
    this.physics.add.overlap(this.arrows, this.ghostGroup, (a, e) => this.onArrowHit(a as ArcadeSprite, e as ArcadeSprite));
    this.physics.add.overlap(this.arrows, this.solids, (a, s) => this.onArrowSolid(a as ArcadeSprite, s as Phaser.GameObjects.Sprite));
    this.physics.add.collider(this.shots, this.walls, (s) => (s as ArcadeSprite).destroy());
    this.physics.add.overlap(this.hero, this.shots, (_h, s) => this.onShotHit(s as ArcadeSprite));
    this.physics.add.overlap(this.hero, this.pickups, (_h, p) => this.onPickup(p as ArcadeSprite));

    // Camera, fog, vignette.
    const cam = this.cameras.main;
    cam.setBounds(0, 0, this.W * T, this.H * T);
    cam.setRoundPixels(true);
    this.applyZoom();
    const fogColor = Phaser.Display.Color.HexStringToColor(theme.palette.void);
    this.fog = new Fog(this, this.W, this.H, T, [fogColor.red, fogColor.green, fogColor.blue]);
    this.vignette = this.add.image(0, 0, '__WHITE').setScrollFactor(0).setDepth(9500);
    this.buildVignette();
    this.scale.on('resize', this.onResize, this);
    this.events.once('shutdown', () => this.cleanup());

    this.stats = {
      repo: this.spec.repo.fullName,
      mode: this.mode,
      startedAt: null,
      timeMs: 0,
      goblinsKilled: 0,
      goblinsTotal: this.enemies.filter((e) => e.kind === 'goblin').length,
      enemiesKilled: 0,
      enemiesTotal: this.enemies.length,
      bossDefeated: false,
      bossName: this.spec.boss?.name ?? null,
      deaths: 0,
      cratesBroken: 0,
      chestsOpened: 0,
      roomsVisited: 0,
      roomsTotal: this.spec.rooms.length,
      questsFound: 0,
      questsTotal: this.spec.findings.quests?.length ?? 0,
      treasure: null,
      pitFalls: 0,
      weaponUse: { sword: 0, bow: 0, hammer: 0 },
      resolved: [],
      hitsTaken: 0,
    };

    if (this.mode === 'attract') {
      this.fog.setEnabled(false);
      this.hero.setVisible(false);
      this.heroShadow.setVisible(false);
      (this.hero.body as Phaser.Physics.Arcade.Body).enable = false;
      this.attractTargets = [...this.spec.rooms]
        .filter((r) => r.order >= 0)
        .sort((a, b) => a.order - b.order)
        .map((r) => ({ x: (r.rect.x + r.rect.w / 2) * T, y: (r.rect.y + r.rect.h / 2) * T }));
      const first = this.attractTargets[0] ?? spawn;
      cam.centerOn(first.x, first.y);
      this.nextAttractAt = 0;
    } else {
      cam.startFollow(this.hero, true, 0.14, 0.14);
      cam.fadeIn(350, 0, 0, 0);
      this.setupInput();
      this.updateRoomAndFog(true);
      this.emit('hp', { hp: this.hp, max: this.maxHp, shield: this.shield });
      this.emit('weapon', { weapon: this.weapon });
      audio.playMusic(theme.music, false);
    }
    this.emit('ready', { spec: this.spec, mode: this.mode });
    this.installDebug();
  }

  private cleanup() {
    this.scale.off('resize', this.onResize, this);
    this.fog?.destroy();
    for (const b of this.bubbles) b.container.destroy();
    this.bubbles = [];
    window.removeEventListener('keydown', this.onWindowKey, true);
  }

  private applyZoom() {
    const w = this.scale.width;
    const h = this.scale.height;
    const zoom = Phaser.Math.Clamp(Math.round(Math.min(h / 320, w / 380)), 2, 5);
    this.cameras.main.setZoom(zoom);
  }

  private onResize() {
    this.applyZoom();
    this.buildVignette();
  }

  private buildVignette() {
    const cam = this.cameras.main;
    const w = Math.ceil(cam.width / cam.zoom);
    const h = Math.ceil(cam.height / cam.zoom);
    const key = 'vignette';
    if (this.textures.exists(key)) this.textures.remove(key);
    const c = document.createElement('canvas');
    c.width = Math.max(8, Math.round(w / 2));
    c.height = Math.max(8, Math.round(h / 2));
    const ctx = c.getContext('2d')!;
    const g = ctx.createRadialGradient(c.width / 2, c.height / 2, Math.min(c.width, c.height) * 0.25, c.width / 2, c.height / 2, Math.max(c.width, c.height) * 0.62);
    const edge = this.spec.abandoned ? 0.72 : 0.55;
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, `rgba(0,0,0,${edge})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, c.width, c.height);
    this.textures.addCanvas(key, c);
    this.textures.get(key).setFilter(Phaser.Textures.FilterMode.LINEAR);
    this.vignette.setTexture(key).setOrigin(0.5).setPosition(cam.width / 2, cam.height / 2).setDisplaySize(w + 2, h + 2);
  }

  private buildRoomIndex() {
    this.roomAt = new Int16Array(this.W * this.H).fill(-1);
    this.roomsById.clear();
    for (const r of this.spec.rooms) {
      this.roomsById.set(r.id, r);
      for (let y = r.rect.y; y < r.rect.y + r.rect.h; y++) for (let x = r.rect.x; x < r.rect.x + r.rect.w; x++) this.roomAt[y * this.W + x] = r.id;
    }
    for (const q of this.spec.findings.quests ?? []) {
      const list = this.questRooms.get(q.room) ?? [];
      list.push({ number: q.number, title: q.title, url: q.url });
      this.questRooms.set(q.room, list);
    }
  }

  private buildTilemap(tilesetKey: string) {
    const map = this.make.tilemap({ tileWidth: T, tileHeight: T, width: this.W, height: this.H });
    const ts = map.addTilesetImage('tiles', tilesetKey, T, T, 0, 0, 0)!;
    const ground = map.createBlankLayer('ground', ts)!;
    this.walls = map.createBlankLayer('walls', ts)!;
    this.pitCol = map.createBlankLayer('pitcol', ts)!;
    ground.setDepth(0);
    this.walls.setDepth(1);
    this.pitCol.setVisible(false);
    const entrance = this.spec.rooms.find((r) => r.kind === 'entrance');
    for (let y = 0; y < this.H; y++) {
      for (let x = 0; x < this.W; x++) {
        const t = this.tileAt(x, y);
        if (t === ' ') continue;
        const h = hashString(`${x},${y}`, this.spec.seed);
        const above = this.tileAt(x, y - 1);
        if (t === '.') {
          let idx: number = above === '#' ? TILE.FLOOR_SHADOW : TILE.FLOOR[h % 4];
          if (entrance && above !== '#') {
            const r = entrance.rect;
            const cx = r.x + Math.floor(r.w / 2);
            if (Math.abs(x - cx) <= 2 && y >= r.y + 2 && y <= r.y + r.h - 3) idx = TILE.RUG;
          }
          ground.putTileAt(idx, x, y);
        } else if (t === ',') {
          ground.putTileAt(above === '#' ? TILE.CORRIDOR_SHADOW : TILE.CORRIDOR[h % 2], x, y);
        } else if (t === 'o') {
          ground.putTileAt(above === 'o' ? TILE.PIT : TILE.PIT_EDGE, x, y);
          this.pitCol.putTileAt(TILE.PIT, x, y);
        } else if (t === '#') {
          const below = this.tileAt(x, y + 1);
          if (WALKABLE.has(below)) {
            const v = h % 10;
            this.walls.putTileAt(v < 7 ? TILE.WALL_FACE[0] : v < 9 ? TILE.WALL_FACE[1] : TILE.WALL_FACE[2], x, y);
          } else {
            this.walls.putTileAt(TILE.WALL_TOP, x, y);
          }
        }
      }
    }
    this.walls.setCollisionByExclusion([-1]);
    this.pitCol.setCollisionByExclusion([-1]);
  }

  // ------------------------------------------------------------------ entities
  private buildEntities() {
    const theme = getTheme(this.spec.theme);
    const lightColor = Phaser.Display.Color.HexStringToColor(theme.palette.light).color;
    for (const e of this.spec.entities) {
      const x = e.x * T + T / 2;
      const y = e.y * T + T;
      switch (e.kind) {
        case 'goblin':
        case 'slime':
        case 'ghost':
        case 'skeleton':
        case 'miniboss':
        case 'boss':
          this.spawnEnemy(e, x, y);
          break;
        case 'npc': {
          const robe = `hsl(${hashString(e.label ?? 'npc') % 360} 55% 52%)`;
          const key = `npc-${e.id}`;
          makeNpcTexture(this, key, hslToHex(robe));
          const s = this.solids.create(x, y - 1, key, 0) as Phaser.Physics.Arcade.Sprite;
          s.setOrigin(0.5, 1).setDepth(y);
          this.fixStaticBody(s, 10, 6);
          this.tweens.add({ targets: s, y: y - 2, duration: 900 + (e.id % 5) * 90, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
          const short = (e.label ?? '').length > 18 ? `${(e.label ?? '').slice(0, 17)}…` : e.label ?? '';
          const name = this.worldText(short, 6, '#ffe7a3', { stroke: '#1a1222', strokeThickness: 2 }).setOrigin(0.5, 1).setDepth(8500);
          name.setPosition(x, y - 18);
          this.addInteract(`npc-${e.id}`, x, y - 6, 24, () => `Talk to ${e.label}`, () => this.openNpc(e));
          break;
        }
        case 'chest': {
          const s = this.solids.create(x, y, 'chest', 0) as Phaser.Physics.Arcade.Sprite;
          s.setOrigin(0.5, 1).setDepth(y);
          this.fixStaticBody(s, 12, 8);
          s.setData('entity', e);
          s.setData('kind', 'chest');
          this.addInteract(`chest-${e.id}`, x, y - 6, 22, () => (s.getData('opened') ? null : 'Open chest'), () => this.openChest(s));
          break;
        }
        case 'crate': {
          const tex = e.meta?.barrel ? 'barrel' : 'crate';
          const s = this.solids.create(x, y, tex, 0) as Phaser.Physics.Arcade.Sprite;
          s.setOrigin(0.5, 1).setDepth(y);
          this.fixStaticBody(s, 12, 9);
          s.setData('entity', e);
          s.setData('kind', 'crate');
          this.addInteract(`crate-${e.id}`, x, y - 6, 20, () => (s.active ? `Inspect ${e.label}` : null), () => this.inspectCrate(e));
          break;
        }
        case 'questboard': {
          const s = this.solids.create(x, y, 'questboard', 0) as Phaser.Physics.Arcade.Sprite;
          s.setOrigin(0.5, 1).setDepth(y);
          this.fixStaticBody(s, 14, 6);
          this.addExclaim(x, y - 18);
          this.addInteract('questboard', x, y - 6, 24, () => 'Read the quest board', () => this.openQuests());
          break;
        }
        case 'tablet': {
          const s = this.solids.create(x, y, 'tablet', 0) as Phaser.Physics.Arcade.Sprite;
          s.setOrigin(0.5, 1).setDepth(y);
          this.fixStaticBody(s, 12, 6);
          this.addInteract('tablet', x, y - 6, 24, () => 'Read the tablet', () => this.openTablet(e));
          break;
        }
        case 'shrine': {
          const s = this.solids.create(x, y, 'shrine', 0) as Phaser.Physics.Arcade.Sprite;
          s.setOrigin(0.5, 1).setDepth(y);
          this.fixStaticBody(s, 10, 6);
          const glow = this.add.image(x, y - 12, 'glow').setTint(0x7ff7ff).setAlpha(0.5).setBlendMode(Phaser.BlendModes.ADD).setDepth(y + 1).setScale(0.9);
          this.tweens.add({ targets: glow, alpha: 0.25, duration: 1200, yoyo: true, repeat: -1 });
          let readyAt = 0;
          this.addInteract('shrine', x, y - 6, 24, () => 'Pray at the test shrine', () => {
            if (this.time.now < readyAt) {
              this.emit('toast', { text: 'The shrine is recharging. Write more tests.', tone: 'info' });
              return;
            }
            readyAt = this.time.now + 20_000;
            this.heal(this.maxHp);
            this.sfx('heal');
            this.burst(x, y - 10, 0x7ff7ff, 24);
            this.emit('dialog', { kind: 'shrine', title: 'Test Shrine', text: e.text, sprite: 'shrine' });
          });
          break;
        }
        case 'gold': {
          const s = this.solids.create(x, y, 'gold', 0) as Phaser.Physics.Arcade.Sprite;
          s.setOrigin(0.5, 1).setDepth(y);
          this.fixStaticBody(s, 12, 6);
          const shine = this.add.image(x, y - 8, 'glow').setTint(0xffd166).setAlpha(0.35).setBlendMode(Phaser.BlendModes.ADD).setDepth(y + 1);
          this.tweens.add({ targets: shine, alpha: 0.15, duration: 900, yoyo: true, repeat: -1 });
          const label = this.worldText(e.label ?? '', 6, '#ffd166').setOrigin(0.5, 1).setDepth(8500).setPosition(x, y - 18);
          let looted = false;
          this.addInteract('gold', x, y - 6, 26, () => (looted ? null : 'Loot the treasure'), () => {
            looted = true;
            const stars = (e.meta?.stars as number | null) ?? null;
            this.stats.treasure = stars;
            this.sfx('chest');
            this.burst(x, y - 8, 0xffd166, 40);
            label.setText('Looted!');
            this.emit('toast', {
              text: stars === null ? 'You looted a mysterious amount of stars.' : `You looted ${formatNumber(stars)} stars.`,
              tone: 'gold',
            });
            this.emit('log', { text: `Treasury looted: ${e.label}` });
          });
          break;
        }
        case 'door':
          this.spawnDoor(e, x, y);
          break;
        case 'pit': {
          const glow = this.add.image(x, y - 8, 'glow').setTint(0x6a3cff).setAlpha(0.25).setScale(2.4).setBlendMode(Phaser.BlendModes.ADD).setDepth(2);
          this.tweens.add({ targets: glow, alpha: 0.1, scale: 2.8, duration: 2200, yoyo: true, repeat: -1 });
          const label = this.worldText(e.label ?? 'node_modules', 7, '#c9b8ff').setOrigin(0.5, 0.5).setDepth(3).setAlpha(0.8).setPosition(x, y - 8);
          this.tweens.add({ targets: label, angle: 360, duration: 12_000, repeat: -1 });
          const room = this.roomsById.get(e.room)!;
          const edgeX = (room.rect.x + room.rect.w / 2) * T;
          const edgeY = (room.rect.y + 1.5) * T;
          this.addInteract('pit', edgeX, edgeY, 40, () => 'Peer into the pit', () =>
            this.emit('dialog', { kind: 'pit', title: 'Pit of Dependencies', text: e.text }),
          );
          break;
        }
        case 'throne': {
          const s = this.solids.create(x, y, 'throne', 0) as Phaser.Physics.Arcade.Sprite;
          s.setOrigin(0.5, 1).setDepth(y).setScale(1.5);
          this.fixStaticBody(s, 14, 8);
          this.addInteract('throne', x, y - 6, 30, () => 'Sit on the throne', () => {
            this.emit('dialog', { kind: 'throne', title: 'The Empty Throne', text: e.text });
            this.time.delayedCall(1200, () => this.win());
          });
          break;
        }
        case 'torch': {
          const s = this.add.sprite(x, y - 2, 'torch', 0).setOrigin(0.5, 1).setDepth(3);
          s.play({ key: 'torch-burn', startFrame: e.id % 2 });
          const glow = this.add.image(x, y - 10, 'glow').setTint(lightColor).setAlpha(0.32).setScale(1.6).setBlendMode(Phaser.BlendModes.ADD).setDepth(4);
          this.tweens.add({ targets: glow, alpha: 0.2, scale: 1.45, duration: 380 + (e.id % 7) * 60, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
          break;
        }
        case 'banner': {
          const key = `banner-${String(e.meta?.color ?? '#888').replace('#', '')}`;
          makeBannerTexture(this, key, String(e.meta?.color ?? '#888888'));
          this.add.image(x, y - 1, key).setOrigin(0.5, 1).setDepth(3);
          break;
        }
        case 'cobweb':
          this.add.image(x, y, 'cobweb').setOrigin(0.5, 1).setDepth(6).setFlipX(!!e.meta?.flip);
          break;
        case 'bones':
          this.add.image(x, y, 'bones').setOrigin(0.5, 1).setDepth(6);
          break;
      }
    }
  }

  private fixStaticBody(s: Phaser.Physics.Arcade.Sprite, w: number, h: number) {
    const body = s.body as Phaser.Physics.Arcade.StaticBody;
    body.setSize(w, h);
    // Static bodies are centred on the sprite; move them to the feet.
    body.position.set(s.x - w / 2, s.y - h);
    body.updateCenter();
  }

  private addExclaim(x: number, y: number) {
    const ex = this.add.image(x, y, 'exclaim').setDepth(8500);
    this.tweens.add({ targets: ex, y: y - 3, duration: 500, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
  }

  private addInteract(id: string, x: number, y: number, range: number, hint: () => string | null, run: () => void) {
    this.interactables.push({ id, x, y, range, hint, run });
  }

  private spawnEnemy(e: Entity, x: number, y: number) {
    const kind = e.kind as EnemyKind;
    const E = TUNING.enemies;
    const base = kind === 'boss' ? E.boss : kind === 'miniboss' ? E.miniboss : E[kind];
    const tex = kind === 'boss' ? 'boss' : kind === 'miniboss' ? 'miniboss' : kind;
    const group = kind === 'ghost' ? this.ghostGroup : this.enemyGroup;
    const sprite = group.create(x, y, tex, 0) as ArcadeSprite;
    sprite.setOrigin(0.5, 1).setDepth(y);
    const body = sprite.body as Phaser.Physics.Arcade.Body;
    if (kind === 'boss') {
      body.setSize(30, 14).setOffset(7, 36);
    } else if (kind === 'miniboss') {
      body.setSize(20, 10).setOffset(5, 25);
    } else {
      body.setSize(10, 7).setOffset(3, 9);
    }
    body.setDrag(400, 400);
    if (kind === 'boss' || kind === 'miniboss') body.setMass(5);
    if (kind === 'ghost') sprite.setAlpha(0.82);
    const shadow = this.add.image(x, y, 'shadow').setDepth(5).setScale(kind === 'boss' ? 2.6 : kind === 'miniboss' ? 1.8 : 1);
    const enemy: Enemy = {
      kind,
      entity: e,
      sprite,
      shadow,
      hp: e.hp ?? ('hp' in base ? base.hp : 3),
      maxHp: e.hp ?? ('hp' in base ? base.hp : 3),
      speed: base.speed,
      aggro: 'aggro' in base ? base.aggro : 999,
      damage: base.damage,
      home: { x, y },
      room: e.room,
      state: kind === 'boss' ? 'asleep' : 'idle',
      stunUntil: 0,
      nextContactAt: 0,
      nextThinkAt: Math.random() * 1500,
      nextSpecialAt: 0,
      dashUntil: 0,
      revealed: false,
      label: null,
      bob: Math.random() * Math.PI * 2,
    };
    if (kind === 'goblin') sprite.play({ key: 'goblin-walk', startFrame: e.id % 2 });
    if (kind === 'skeleton') sprite.play({ key: 'skeleton-walk', startFrame: e.id % 2 });
    if (kind === 'slime') this.tweens.add({ targets: sprite, scaleX: 1.12, scaleY: 0.88, duration: 420, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    if (kind === 'boss' || kind === 'miniboss') {
      const label = this.worldText(e.label ?? '', kind === 'boss' ? 8 : 6, kind === 'boss' ? '#ff9aa8' : '#ffd166', {
        stroke: '#1a1222',
        strokeThickness: 2,
      })
        .setOrigin(0.5, 1)
        .setDepth(8600);
      enemy.label = label;
    }
    this.enemies.push(enemy);
    this.enemyBySprite.set(sprite, enemy);
    if (kind === 'boss') this.boss = enemy;
  }

  private spawnDoor(e: Entity, x: number, y: number) {
    const orientation = (e.meta?.orientation as 'v' | 'h') ?? 'v';
    const kind = String(e.meta?.door ?? 'wooden');
    const key = `door-${kind}-${orientation}`;
    const cx = e.x * T + T / 2;
    const cy = e.y * T + T / 2;
    const s = this.doors.create(cx, cy, key) as Phaser.Physics.Arcade.Sprite;
    s.setDepth(orientation === 'h' ? cy + 8 : cy + T + 8);
    const body = s.body as Phaser.Physics.Arcade.StaticBody;
    body.setSize(orientation === 'v' ? 16 : 48, orientation === 'v' ? 48 : 16);
    body.position.set(cx - (orientation === 'v' ? 8 : 24), cy - (orientation === 'v' ? 24 : 8));
    body.updateCenter();
    if (kind === 'enchanted' || kind === 'rune' || kind === 'cursed') {
      const tint = kind === 'cursed' ? 0xff4d6d : kind === 'rune' ? 0x7ff0e0 : 0xd7a8ff;
      const glow = this.add.image(cx, cy, 'glow').setTint(tint).setAlpha(0.3).setScale(1.6).setBlendMode(Phaser.BlendModes.ADD).setDepth(s.depth + 1);
      this.tweens.add({ targets: glow, alpha: 0.12, duration: 1100, yoyo: true, repeat: -1 });
      s.setData('glow', glow);
    }
    const opens = e.meta?.opens !== false;
    this.addInteract(`door-${e.id}`, cx, cy, 34, () => (s.active ? (opens ? `Open the ${kind} door` : 'Try the cursed door') : null), () => {
      if (!s.active) return;
      if (!opens) {
        this.sfx('locked');
        this.cameras.main.shake(120, 0.004);
        this.emit('dialog', { kind: 'door', title: e.label ?? 'Locked door', text: e.text });
        return;
      }
      this.sfx('door');
      this.emit('dialog', { kind: 'door', title: e.label ?? 'Door', text: e.text });
      (s.getData('glow') as Phaser.GameObjects.Image | undefined)?.destroy();
      this.tweens.add({
        targets: s,
        alpha: 0,
        scaleX: orientation === 'v' ? 0.2 : 1,
        scaleY: orientation === 'h' ? 0.2 : 1,
        duration: 380,
        onComplete: () => s.destroy(),
      });
      body.enable = false;
      this.emit('log', { text: `Opened the ${e.label} door` });
    });
  }

  // ------------------------------------------------------------------ input
  private setupInput() {
    const kb = this.input.keyboard!;
    const names = ['W', 'A', 'S', 'D', 'UP', 'DOWN', 'LEFT', 'RIGHT', 'SPACE', 'E', 'Q', 'ONE', 'TWO', 'THREE', 'ENTER', 'F'];
    this.keys = {};
    for (const n of names) this.keys[n] = kb.addKey(n, false);
    kb.on('keydown-E', () => this.interact());
    kb.on('keydown-ENTER', () => this.interact());
    kb.on('keydown-F', () => this.interact());
    kb.on('keydown-Q', () => this.cycleWeapon());
    kb.on('keydown-ONE', () => this.setWeapon('sword'));
    kb.on('keydown-TWO', () => this.setWeapon('bow'));
    kb.on('keydown-THREE', () => this.setWeapon('hammer'));
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      audio.unlock();
      if (p.leftButtonDown() || p.wasTouch) {
        this.pointerDown = true;
        this.usingPointerAim = !p.wasTouch;
        if (p.wasTouch) {
          const wp = p.positionToCamera(this.cameras.main) as Phaser.Math.Vector2;
          this.aim = Math.atan2(wp.y - (this.hero.y - 8), wp.x - this.hero.x);
          this.attack();
        }
      }
    });
    this.input.on('pointerup', () => (this.pointerDown = false));
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!p.wasTouch) this.usingPointerAim = true;
    });
    this.input.on('wheel', (_p: unknown, _o: unknown, _dx: number, dy: number) => {
      if (Math.abs(dy) > 5) this.cycleWeapon(dy > 0 ? 1 : -1);
    });
    window.addEventListener('keydown', this.onWindowKey, true);
  }

  private onWindowKey = (ev: KeyboardEvent) => {
    const t = ev.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
    if ([' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(ev.key)) ev.preventDefault();
    audio.unlock();
  };

  setWeapon(w: WeaponId) {
    if (this.weapon === w) return;
    this.weapon = w;
    this.sfx('click');
    this.emit('weapon', { weapon: w });
  }

  cycleWeapon(dir = 1) {
    const i = WEAPONS.indexOf(this.weapon);
    this.setWeapon(WEAPONS[(i + dir + WEAPONS.length) % WEAPONS.length]);
  }

  setDialogOpen(open: boolean) {
    this.dialogOpen = open;
  }

  setMode(mode: GameMode) {
    if (this.mode === 'attract') return;
    this.mode = mode;
    this.stats.mode = mode;
    if (mode === 'explore') {
      for (const e of this.enemies) if (e.state === 'chase') e.state = 'idle';
      this.emit('toast', { text: 'Explore mode: monsters are friendly. Walk around and read.', tone: 'info' });
    } else {
      this.emit('toast', { text: 'Fight mode: monsters bite again.', tone: 'bad' });
    }
  }

  getMode() {
    return this.mode;
  }

  // ------------------------------------------------------------------ update
  override update(time: number) {
    if (this.mode === 'attract') {
      this.updateAttract(time);
      this.updateEnemies(time);
      this.updateFloaters();
      return;
    }
    if (!this.busy && !this.ended) this.updateHero(time);
    this.updateEnemies(time);
    if (this.bossActive) this.updateBoss(time);
    this.updateFloaters();
    if (time >= this.nextInteractScan) {
      this.nextInteractScan = time + 90;
      this.scanInteract();
    }
    this.updateRoomAndFog(false);
    if (time >= this.nextStatsAt) {
      this.nextStatsAt = time + 250;
      if (this.stats.startedAt !== null && !this.ended) this.stats.timeMs = Date.now() - this.stats.startedAt;
      this.emit('stats', this.stats);
    }
  }

  private updateAttract(time: number) {
    if (this.attractTargets.length === 0) return;
    if (time >= this.nextAttractAt) {
      this.nextAttractAt = time + 4200;
      const target = this.attractTargets[this.attractIdx % this.attractTargets.length];
      this.attractIdx++;
      this.cameras.main.pan(target.x, target.y, 3800, 'Sine.easeInOut');
    }
  }

  private readMove(): { x: number; y: number } {
    let x = 0;
    let y = 0;
    const k = this.keys;
    if (k.A.isDown || k.LEFT.isDown) x -= 1;
    if (k.D.isDown || k.RIGHT.isDown) x += 1;
    if (k.W.isDown || k.UP.isDown) y -= 1;
    if (k.S.isDown || k.DOWN.isDown) y += 1;
    if (touchInput.enabled && (Math.abs(touchInput.moveX) > 0.15 || Math.abs(touchInput.moveY) > 0.15)) {
      x = touchInput.moveX;
      y = touchInput.moveY;
    }
    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    return { x, y };
  }

  private updateHero(time: number) {
    const body = this.hero.body as Phaser.Physics.Arcade.Body;
    const move = this.readMove();
    const moving = Math.abs(move.x) + Math.abs(move.y) > 0.05;
    if ((moving || this.pointerDown) && this.stats.startedAt === null) this.stats.startedAt = Date.now();
    if (time >= this.knockUntil) {
      const speed = TUNING.hero.speed * this.speedMult;
      body.setVelocity(move.x * speed, move.y * speed);
    }
    if (moving) {
      if (this.hero.anims.currentAnim?.key !== 'hero-walk' || !this.hero.anims.isPlaying) this.hero.play('hero-walk', true);
      if (!this.usingPointerAim) this.aim = Math.atan2(move.y, move.x);
    } else {
      this.hero.anims.stop();
      this.hero.setFrame(0);
    }
    if (this.usingPointerAim) {
      const p = this.input.activePointer;
      const wp = p.positionToCamera(this.cameras.main) as Phaser.Math.Vector2;
      this.aim = Math.atan2(wp.y - (this.hero.y - 8), wp.x - this.hero.x);
    }
    this.hero.setFlipX(Math.cos(this.aim) < 0);
    this.hero.setDepth(this.hero.y);
    this.heroShadow.setPosition(this.hero.x, this.hero.y - 1);
    // Blink while invulnerable.
    this.hero.setAlpha(time < this.invulnUntil ? (Math.floor(time / 70) % 2 ? 0.35 : 1) : 1);

    const wantAttack = (this.pointerDown && this.usingPointerAim) || this.keys.SPACE.isDown || touchInput.attack;
    if (wantAttack && !this.dialogOpen) {
      if (touchInput.attack && !this.usingPointerAim) this.autoAim();
      this.attack();
    }
    if (touchInput.interactPressed) {
      touchInput.interactPressed = false;
      this.interact();
    }
    if (touchInput.weaponCyclePressed) {
      touchInput.weaponCyclePressed = false;
      this.cycleWeapon();
    }
    // Pit?
    const tx = Math.floor(this.hero.x / T);
    const ty = Math.floor((this.hero.y - 3) / T);
    if (this.tileAt(tx, ty) === 'o') this.fallIntoPit();
  }

  private autoAim() {
    let best: Enemy | null = null;
    let bestD = 150;
    for (const e of this.enemies) {
      if (e.state === 'dead' || !e.sprite.active) continue;
      const d = Phaser.Math.Distance.Between(this.hero.x, this.hero.y, e.sprite.x, e.sprite.y);
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    if (best) this.aim = Math.atan2(best.sprite.y - 6 - (this.hero.y - 8), best.sprite.x - this.hero.x);
  }

  // ------------------------------------------------------------------ combat
  private damageBonus() {
    return this.blade;
  }

  private attack() {
    const now = this.time.now;
    if (now < this.nextAttackAt[this.weapon] || this.busy) return;
    if (this.stats.startedAt === null) this.stats.startedAt = Date.now();
    const W = TUNING.weapons;
    this.stats.weaponUse[this.weapon]++;
    const ox = this.hero.x;
    const oy = this.hero.y - 8;
    const dx = Math.cos(this.aim);
    const dy = Math.sin(this.aim);
    if (this.weapon === 'sword') {
      this.nextAttackAt.sword = now + W.sword.cooldownMs;
      this.sfx('swing');
      const slash = this.add.image(ox + dx * 10, oy + dy * 10, 'slash').setRotation(this.aim).setDepth(8100).setScale(0.7).setAlpha(0.95);
      this.tweens.add({ targets: slash, alpha: 0, scale: 0.95, duration: 140, onComplete: () => slash.destroy() });
      const half = Phaser.Math.DegToRad(W.sword.arcDeg / 2);
      const hitTest = (x: number, y: number, r: number) => {
        const d = Phaser.Math.Distance.Between(ox, oy, x, y);
        if (d > W.sword.range + r) return false;
        if (d < 8) return true;
        const ang = Math.atan2(y - oy, x - ox);
        return Math.abs(Phaser.Math.Angle.Wrap(ang - this.aim)) <= half;
      };
      for (const e of this.enemies) {
        if (e.state === 'dead' || !e.sprite.active) continue;
        const r = e.kind === 'boss' ? 18 : e.kind === 'miniboss' ? 11 : 6;
        if (hitTest(e.sprite.x, e.sprite.y - (e.kind === 'boss' ? 16 : 7), r)) this.hitEnemy(e, W.sword.damage + this.damageBonus(), dx, dy, W.sword.knockback);
      }
      this.hitSolids((x, y) => hitTest(x, y, 7));
    } else if (this.weapon === 'bow') {
      this.nextAttackAt.bow = now + W.bow.cooldownMs;
      this.sfx('arrow');
      const a = this.arrows.create(ox + dx * 6, oy + dy * 6, 'arrow') as ArcadeSprite;
      a.setRotation(this.aim).setDepth(8050);
      const body = a.body as Phaser.Physics.Arcade.Body;
      body.setSize(4, 4).setOffset(6, -0.5);
      body.setVelocity(dx * W.bow.speed, dy * W.bow.speed);
      a.setData('born', now);
      this.time.delayedCall((W.bow.range / W.bow.speed) * 1000, () => a.active && a.destroy());
    } else {
      this.nextAttackAt.hammer = now + W.hammer.cooldownMs;
      this.sfx('hammer');
      const cx = ox + dx * W.hammer.reach;
      const cy = oy + dy * W.hammer.reach + 4;
      this.cameras.main.shake(110, 0.006);
      const ring = this.add.image(cx, cy, 'ring').setDepth(8050).setScale(0.2).setAlpha(0.95);
      this.tweens.add({ targets: ring, scale: (W.hammer.radius * 2) / 56, alpha: 0, duration: 260, onComplete: () => ring.destroy() });
      this.burst(cx, cy, 0xd8c8a8, 14, 0);
      for (const e of this.enemies) {
        if (e.state === 'dead' || !e.sprite.active) continue;
        const d = Phaser.Math.Distance.Between(cx, cy, e.sprite.x, e.sprite.y - 6);
        const r = e.kind === 'boss' ? 18 : e.kind === 'miniboss' ? 11 : 6;
        if (d <= W.hammer.radius + r) {
          const ang = Math.atan2(e.sprite.y - cy, e.sprite.x - cx);
          this.hitEnemy(e, W.hammer.damage + this.damageBonus(), Math.cos(ang), Math.sin(ang), W.hammer.knockback);
        }
      }
      this.hitSolids((x, y) => Phaser.Math.Distance.Between(cx, cy, x, y) <= W.hammer.radius + 6);
    }
  }

  private hitSolids(test: (x: number, y: number) => boolean) {
    for (const obj of this.solids.getChildren() as Phaser.Physics.Arcade.Sprite[]) {
      if (!obj.active) continue;
      const kind = obj.getData('kind');
      if (kind !== 'crate' && kind !== 'chest') continue;
      if (!test(obj.x, obj.y - 7)) continue;
      if (kind === 'crate') this.breakCrate(obj);
      else this.openChest(obj);
    }
  }

  private hitEnemy(e: Enemy, dmg: number, dx: number, dy: number, knock: number) {
    if (e.state === 'dead') return;
    if (e.kind === 'boss' && !this.bossActive) this.activateBoss();
    const now = this.time.now;
    e.hp -= dmg;
    e.sprite.setTintFill(0xffffff);
    this.time.delayedCall(70, () => e.sprite.active && e.sprite.clearTint());
    const mass = e.kind === 'boss' ? 0.15 : e.kind === 'miniboss' ? 0.35 : 1;
    const body = e.sprite.body as Phaser.Physics.Arcade.Body;
    body.setVelocity(dx * knock * mass, dy * knock * mass);
    e.state = e.state === 'asleep' ? 'asleep' : 'stun';
    e.stunUntil = now + (e.kind === 'boss' ? 60 : 160);
    this.sfx(e.kind === 'boss' || e.kind === 'miniboss' ? 'bosshit' : 'hit');
    this.burst(e.sprite.x, e.sprite.y - 8, ENEMY_COLORS[e.kind], 5);
    if (e.kind === 'boss' && this.spec.boss) {
      const loc = this.spec.boss.loc;
      const removed = Math.max(1, Math.round((dmg / e.maxHp) * loc));
      this.floatText(`-${formatNumber(removed)} lines`, e.sprite.x, e.sprite.y - 44, '#ffd166');
      const left = Math.max(0, Math.round((Math.max(0, e.hp) / e.maxHp) * loc));
      this.emit('boss', { state: 'hp', name: this.spec.boss.name, hp: Math.max(0, e.hp), maxHp: e.maxHp, loc, locLeft: left, phase: this.bossPhase });
    } else if (e.kind === 'miniboss') {
      const loc = e.entity.loc ?? 0;
      this.floatText(`-${formatNumber(Math.max(1, Math.round((dmg / e.maxHp) * loc)))} lines`, e.sprite.x, e.sprite.y - 30, '#ffd166');
    } else {
      this.floatText(`-${dmg}`, e.sprite.x, e.sprite.y - 16, '#ffffff');
    }
    if (!e.revealed) {
      e.revealed = true;
      this.revealEnemy(e);
    }
    if (e.hp <= 0) this.killEnemy(e);
  }

  /** First hit shows what the monster actually is. */
  private revealEnemy(e: Enemy) {
    const ent = e.entity;
    let text = '';
    let sub = '';
    switch (e.kind) {
      case 'goblin':
        text = `${ent.label}: ${ent.text}`;
        sub = `${ent.path}:${ent.line}`;
        this.sfx('goblin');
        break;
      case 'slime':
        text = `Bloated file: ${ent.label}`;
        sub = `${formatNumber(ent.loc ?? 0)} lines`;
        this.sfx('slime');
        break;
      case 'ghost':
        text = `Issue ${ent.label}: ${ent.text}`;
        this.sfx('ghost');
        break;
      case 'skeleton':
        text = `Branch ${ent.label}`;
        sub = ent.text ?? '';
        this.sfx('skeleton');
        break;
      case 'miniboss':
        text = `${ent.label}`;
        sub = `${formatNumber(ent.loc ?? 0)} lines · ${ent.path}`;
        break;
      case 'boss':
        return;
    }
    this.bubble(e.sprite, text, sub, e.kind === 'miniboss' ? 36 : 20, 2800);
  }

  private killEnemy(e: Enemy) {
    e.state = 'dead';
    const s = e.sprite;
    // Let the monster's speech bubble linger where it fell.
    for (const b of this.bubbles) {
      if (b.target === s) {
        b.target = { x: s.x, y: s.y, active: true } as Bubble['target'];
        b.until = Math.max(b.until, this.time.now + 1800);
      }
    }
    const body = s.body as Phaser.Physics.Arcade.Body;
    body.enable = false;
    this.stats.enemiesKilled++;
    if (e.kind === 'boss') {
      this.defeatBoss();
      return;
    }
    this.sfx('kill');
    this.burst(s.x, s.y - 8, ENEMY_COLORS[e.kind], e.kind === 'miniboss' ? 30 : 14);
    e.label?.destroy();
    e.shadow.destroy();
    this.tweens.add({ targets: s, alpha: 0, scaleY: 0.2, duration: 180, onComplete: () => s.destroy() });
    const ent = e.entity;
    if (e.kind === 'goblin') {
      this.stats.goblinsKilled++;
      this.stats.resolved.push({ kind: ent.label ?? 'TODO', text: ent.text ?? '', path: ent.path ?? '', line: ent.line ?? 0, url: ent.url ?? null });
      this.floatText('resolved', s.x, s.y - 22, '#8bd17c');
      this.emit('log', { text: `${ent.label} resolved in ${ent.path}:${ent.line}`, url: ent.url });
    } else if (e.kind === 'ghost') {
      this.floatText('exorcised', s.x, s.y - 22, '#c9d6ff');
      this.emit('log', { text: `Issue ${ent.label} exorcised`, url: ent.url });
    } else if (e.kind === 'skeleton') {
      this.floatText('pruned', s.x, s.y - 22, '#ece5cf');
      this.emit('log', { text: `Stale branch ${ent.label} pruned`, url: ent.url });
    } else if (e.kind === 'miniboss') {
      this.floatText('refactored!', s.x, s.y - 34, '#ffd166');
      this.emit('log', { text: `${ent.label} refactored (${formatNumber(ent.loc ?? 0)} lines)`, url: ent.url });
      this.dropPickup(s.x, s.y - 4, 'potion');
      this.cameras.main.shake(160, 0.006);
    } else if (e.kind === 'slime') {
      this.emit('log', { text: `${ent.label} slimmed down`, url: ent.url });
    }
    if (e.kind !== 'miniboss' && Math.random() < 0.2 && this.hp < this.maxHp) this.dropPickup(s.x, s.y - 4, 'heart');
  }

  private dropPickup(x: number, y: number, kind: 'heart' | PowerUp) {
    const tex = kind === 'heart' ? 'heart' : POWERUP_INFO[kind].tex;
    const p = this.pickups.create(x, y, tex) as ArcadeSprite;
    p.setDepth(y + 2).setData('kind', kind);
    (p.body as Phaser.Physics.Arcade.Body).setSize(10, 10);
    this.tweens.add({ targets: p, y: y - 10, duration: 220, yoyo: true, ease: 'Quad.out' });
    this.tweens.add({ targets: p, alpha: 0.6, duration: 500, yoyo: true, repeat: -1, delay: 400 });
  }

  private onPickup(p: ArcadeSprite) {
    if (!p.active) return;
    const kind = p.getData('kind') as 'heart' | PowerUp;
    p.destroy();
    if (kind === 'heart') {
      this.heal(2);
      this.sfx('pickup');
      return;
    }
    this.applyPowerup(kind);
  }

  private applyPowerup(kind: PowerUp) {
    const info = POWERUP_INFO[kind];
    if (kind === 'blade') this.blade += TUNING.powerups.blade.damageBonus;
    if (kind === 'boots') this.speedMult = Math.min(1.6, this.speedMult * TUNING.powerups.boots.speedMult);
    if (kind === 'shield') this.shield += TUNING.powerups.shield.absorb;
    if (kind === 'potion') this.heal(TUNING.powerups.potion.heal);
    this.sfx(kind === 'potion' ? 'heal' : 'powerup');
    this.emit('powerup', { kind, blade: this.blade, speed: this.speedMult, shield: this.shield });
    this.emit('toast', { text: `${info.name}: ${info.text}`, tone: 'good' });
    this.emit('hp', { hp: this.hp, max: this.maxHp, shield: this.shield });
  }

  private heal(n: number) {
    this.hp = Math.min(this.maxHp, this.hp + n);
    this.emit('hp', { hp: this.hp, max: this.maxHp, shield: this.shield });
    this.floatText(`+${n}`, this.hero.x, this.hero.y - 20, '#8bd17c');
  }

  private onEnemyTouch(sprite: ArcadeSprite) {
    const e = this.enemyBySprite.get(sprite);
    if (!e || e.state === 'dead' || e.state === 'asleep' || this.mode !== 'play' || this.busy || this.ended) return;
    const now = this.time.now;
    if (now < e.nextContactAt) return;
    e.nextContactAt = now + TUNING.enemies.contactCooldownMs;
    const ang = Math.atan2(this.hero.y - sprite.y, this.hero.x - sprite.x);
    this.hurtHero(e.damage, Math.cos(ang), Math.sin(ang));
  }

  private onShotHit(shot: ArcadeSprite) {
    if (!shot.active) return;
    shot.destroy();
    if (this.mode !== 'play') return;
    const v = (shot.body as Phaser.Physics.Arcade.Body).velocity;
    const len = Math.hypot(v.x, v.y) || 1;
    this.hurtHero(1, v.x / len, v.y / len);
  }

  private hurtHero(dmg: number, dx: number, dy: number) {
    const now = this.time.now;
    if (now < this.invulnUntil || this.busy || this.ended) return;
    this.invulnUntil = now + TUNING.hero.iframesMs;
    this.stats.hitsTaken++;
    const body = this.hero.body as Phaser.Physics.Arcade.Body;
    body.setVelocity(dx * 180, dy * 180);
    this.knockUntil = now + 140;
    if (this.shield > 0) {
      this.shield--;
      this.sfx('bosshit');
      this.floatText('blocked', this.hero.x, this.hero.y - 20, '#8fb7ff');
      this.emit('hp', { hp: this.hp, max: this.maxHp, shield: this.shield });
      return;
    }
    this.hp -= dmg;
    this.sfx('hurt');
    this.cameras.main.shake(100, 0.005);
    this.hero.setTintFill(0xff4d5e);
    this.time.delayedCall(90, () => this.hero.clearTint());
    this.emit('hp', { hp: Math.max(0, this.hp), max: this.maxHp, shield: this.shield });
    if (this.hp <= 0) this.die();
  }

  private die() {
    this.busy = true;
    this.stats.deaths++;
    this.sfx('death');
    (this.hero.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
    this.emit('death', { deaths: this.stats.deaths });
    this.tweens.add({ targets: this.hero, angle: 90, alpha: 0.4, duration: 300 });
    this.cameras.main.fadeOut(700, 20, 0, 0);
    this.time.delayedCall(800, () => {
      this.hero.setAngle(0).setAlpha(1);
      this.hero.setPosition(this.lastSafe.x, this.lastSafe.y);
      this.hp = this.maxHp;
      this.invulnUntil = this.time.now + 1500;
      this.emit('hp', { hp: this.hp, max: this.maxHp, shield: this.shield });
      for (const e of this.enemies) {
        if (e.state === 'dead' || e.kind === 'boss') continue;
        e.state = 'idle';
        (e.sprite.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
      }
      this.cameras.main.fadeIn(500, 0, 0, 0);
      this.busy = false;
      this.emit('toast', { text: 'You respawned. The goblins remember you.', tone: 'bad' });
    });
  }

  private fallIntoPit() {
    if (this.busy) return;
    this.busy = true;
    this.stats.pitFalls++;
    this.sfx('pit');
    const body = this.hero.body as Phaser.Physics.Arcade.Body;
    body.setVelocity(0, 0);
    this.tweens.add({ targets: this.hero, scale: 0, angle: 540, duration: 900, ease: 'Quad.in' });
    this.time.delayedCall(1000, () => {
      const spawn = { x: this.spec.spawn.x * T + T / 2, y: this.spec.spawn.y * T + T - 2 };
      this.hero.setScale(1).setAngle(0).setPosition(spawn.x, spawn.y);
      this.cameras.main.flash(300, 80, 40, 160);
      this.busy = false;
      this.emit('toast', { text: 'You fell into the dependency pit and landed back at the entrance. Nobody reaches the bottom.', tone: 'info' });
      this.emit('log', { text: 'Fell into node_modules' });
    });
  }

  private killArrow(a: ArcadeSprite) {
    if (!a.active) return;
    this.burst(a.x, a.y, 0xc99b66, 3, 0);
    a.destroy();
  }

  private onArrowHit(a: ArcadeSprite, sprite: ArcadeSprite) {
    if (!a.active) return;
    const e = this.enemyBySprite.get(sprite);
    if (!e || e.state === 'dead') return;
    const v = (a.body as Phaser.Physics.Arcade.Body).velocity;
    const len = Math.hypot(v.x, v.y) || 1;
    a.destroy();
    this.hitEnemy(e, TUNING.weapons.bow.damage + this.damageBonus(), v.x / len, v.y / len, TUNING.weapons.bow.knockback);
  }

  private onArrowSolid(a: ArcadeSprite, s: Phaser.GameObjects.Sprite) {
    if (!a.active || !s.active) return;
    const kind = s.getData('kind');
    if (kind === 'crate') this.breakCrate(s as Phaser.Physics.Arcade.Sprite);
    else if (kind === 'chest') this.openChest(s as Phaser.Physics.Arcade.Sprite);
    else return;
    a.destroy();
  }

  private breakCrate(s: Phaser.Physics.Arcade.Sprite) {
    if (!s.active) return;
    const e = s.getData('entity') as Entity;
    this.stats.cratesBroken++;
    this.sfx('crate');
    this.burst(s.x, s.y - 7, 0xb98550, 12);
    this.floatText(e.label ?? 'file', s.x, s.y - 18, '#e8d6b0');
    s.destroy();
    if (Math.random() < 0.18 && this.hp < this.maxHp) this.dropPickup(s.x, s.y - 4, 'heart');
  }

  private openChest(s: Phaser.Physics.Arcade.Sprite) {
    if (!s.active || s.getData('opened')) return;
    s.setData('opened', true);
    s.setFrame(1);
    this.stats.chestsOpened++;
    this.sfx('chest');
    this.burst(s.x, s.y - 10, 0xffd166, 16);
    const e = s.getData('entity') as Entity;
    const kind = (e.meta?.powerup as PowerUp) ?? 'potion';
    this.dropPickup(s.x, s.y + 6, kind);
  }

  // ------------------------------------------------------------------ enemies
  private updateEnemies(time: number) {
    const hx = this.hero?.x ?? 0;
    const hy = this.hero?.y ?? 0;
    const heroRoom = this.currentRoom;
    const passive = this.mode !== 'play' || this.busy || this.ended;
    for (const e of this.enemies) {
      if (e.state === 'dead' || !e.sprite.active) continue;
      const s = e.sprite;
      const body = s.body as Phaser.Physics.Arcade.Body;
      s.setDepth(s.y);
      e.shadow.setPosition(s.x, s.y - 1);
      if (e.label) e.label.setPosition(s.x, s.y - s.displayHeight - 2);
      if (e.kind === 'ghost') {
        e.bob += 0.05;
        s.setY(s.y + Math.sin(e.bob) * 0.15);
      }
      if (e.kind === 'boss') continue; // boss handled separately
      if (e.state === 'stun') {
        if (time < e.stunUntil) continue;
        e.state = 'chase';
      }
      if (e.state === 'telegraph') {
        if (time >= e.dashUntil) {
          e.state = 'dash';
          const ang = Math.atan2(hy - s.y, hx - s.x);
          body.setVelocity(Math.cos(ang) * 210, Math.sin(ang) * 210);
          e.dashUntil = time + 380;
          s.clearTint();
        }
        continue;
      }
      if (e.state === 'dash') {
        if (time >= e.dashUntil) e.state = 'chase';
        continue;
      }
      const d = Phaser.Math.Distance.Between(s.x, s.y, hx, hy);
      const sameRoom = e.room === heroRoom || e.kind === 'ghost';
      const canChase = !passive && this.mode === 'play' && d < e.aggro && (sameRoom || d < 56);
      if (canChase) {
        if (e.state !== 'chase') {
          e.state = 'chase';
          if (e.kind === 'goblin' && Math.random() < 0.5) this.sfx('goblin');
          // Monsters shout what they are when they spot you (a few at a time).
          if (!e.revealed && this.bubbles.length < 3) {
            e.revealed = true;
            this.revealEnemy(e);
          }
        }
        const ang = Math.atan2(hy - 4 - s.y, hx - s.x);
        body.setVelocity(Math.cos(ang) * e.speed, Math.sin(ang) * e.speed);
        if (e.kind === 'miniboss' && time >= e.nextSpecialAt && d < 120) {
          e.nextSpecialAt = time + 3600;
          e.state = 'telegraph';
          e.dashUntil = time + 420;
          body.setVelocity(0, 0);
          s.setTint(0xff6b5e);
        }
      } else {
        if (e.state === 'chase') e.state = 'idle';
        if (time >= e.nextThinkAt) {
          e.nextThinkAt = time + 900 + Math.random() * 1800;
          const toHome = Phaser.Math.Distance.Between(s.x, s.y, e.home.x, e.home.y);
          if (toHome > 40) {
            const ang = Math.atan2(e.home.y - s.y, e.home.x - s.x);
            body.setVelocity(Math.cos(ang) * e.speed * 0.5, Math.sin(ang) * e.speed * 0.5);
          } else if (Math.random() < 0.6) {
            const ang = Math.random() * Math.PI * 2;
            body.setVelocity(Math.cos(ang) * e.speed * 0.35, Math.sin(ang) * e.speed * 0.35);
          } else {
            body.setVelocity(0, 0);
          }
        }
      }
      if (Math.abs(body.velocity.x) > 2) s.setFlipX(body.velocity.x < 0);
    }
  }

  // ------------------------------------------------------------------ boss
  private activateBoss() {
    if (!this.boss || this.bossActive || !this.spec.boss) return;
    this.bossActive = true;
    this.boss.state = 'chase';
    this.sfx('roar');
    this.cameras.main.shake(400, 0.008);
    this.cameras.main.flash(250, 120, 20, 40);
    this.boss.sprite.setFrame(1);
    this.time.delayedCall(700, () => this.boss?.sprite.active && this.boss.sprite.setFrame(0));
    const theme = getTheme(this.spec.theme);
    if (this.mode !== 'attract') audio.playMusic(theme.music, true);
    const b = this.spec.boss;
    this.emit('boss', { state: 'start', name: b.name, hp: this.boss.hp, maxHp: this.boss.maxHp, loc: b.loc, locLeft: b.loc, phase: 1 });
    this.nextTauntAt = this.time.now + 900;
    this.nextBossShotAt = this.time.now + 1800;
    this.nextSummonAt = this.time.now + 9000;
    this.emit('log', { text: `${b.name} wakes up (${formatNumber(b.loc)} lines)`, url: b.url });
  }

  private updateBoss(time: number) {
    const e = this.boss;
    if (!e || e.state === 'dead' || !e.sprite.active) return;
    const s = e.sprite;
    const body = s.body as Phaser.Physics.Arcade.Body;
    const ratio = e.hp / e.maxHp;
    const phase = ratio > 0.66 ? 1 : ratio > 0.33 ? 2 : 3;
    if (phase !== this.bossPhase) {
      this.bossPhase = phase;
      this.sfx('roar');
      this.cameras.main.shake(250, 0.007);
      const lines = phase === 2 ? 'You refactored a third of me. Cute.' : 'Fine. No more Mr. Nice Code.';
      this.bubble(s, lines, '', 56, 2600, true);
      this.nextTauntAt = time + 4000;
    }
    const passive = this.mode !== 'play' || this.busy || this.ended;
    if (e.state === 'stun' && time < e.stunUntil) return;
    if (e.state === 'telegraph') {
      if (time >= e.dashUntil) {
        e.state = 'dash';
        const ang = Math.atan2(this.hero.y - s.y, this.hero.x - s.x);
        body.setVelocity(Math.cos(ang) * 230, Math.sin(ang) * 230);
        e.dashUntil = time + 450;
        s.clearTint();
      }
      return;
    }
    if (e.state === 'dash') {
      if (time >= e.dashUntil) e.state = 'chase';
      return;
    }
    e.state = 'chase';
    const speed = e.speed * (phase === 1 ? 1 : phase === 2 ? 1.25 : 1.5);
    const ang = Math.atan2(this.hero.y - s.y, this.hero.x - s.x);
    const d = Phaser.Math.Distance.Between(s.x, s.y, this.hero.x, this.hero.y);
    if (passive) body.setVelocity(0, 0);
    else if (d > 26) body.setVelocity(Math.cos(ang) * speed, Math.sin(ang) * speed);
    else body.setVelocity(0, 0);
    s.setFlipX(Math.cos(ang) < 0);
    if (passive) {
      if (time >= this.nextTauntAt) this.bossTaunt(time);
      return;
    }
    if (time >= this.nextBossShotAt) {
      this.nextBossShotAt = time + (phase === 1 ? 2600 : phase === 2 ? 2200 : 2900);
      if (phase === 3) this.radialShots(s.x, s.y - 26, 10);
      else this.spreadShots(s.x, s.y - 26, ang, phase === 1 ? 3 : 5);
      s.setFrame(1);
      this.time.delayedCall(260, () => s.active && s.setFrame(0));
    }
    if (phase >= 2 && time >= this.nextSummonAt) {
      this.nextSummonAt = time + 8000;
      this.summonGoblins(2);
    }
    if (phase >= 2 && time >= e.nextSpecialAt && d < 160) {
      e.nextSpecialAt = time + (phase === 3 ? 4200 : 6000);
      e.state = 'telegraph';
      e.dashUntil = time + 520;
      body.setVelocity(0, 0);
      s.setTint(0xff6b5e);
    }
    if (time >= this.nextTauntAt) this.bossTaunt(time);
  }

  private bossTaunt(time: number) {
    const taunts = this.spec.boss?.taunts ?? [];
    if (!this.boss || taunts.length === 0) return;
    this.nextTauntAt = time + 5200;
    const text = taunts[this.bossTauntIdx % taunts.length];
    this.bossTauntIdx++;
    this.bubble(this.boss.sprite, `// ${text}`, '', 56, 3000, true);
  }

  private spreadShots(x: number, y: number, ang: number, n: number) {
    this.sfx('shoot');
    const spread = Phaser.Math.DegToRad(14);
    for (let i = 0; i < n; i++) {
      const a = ang + (i - (n - 1) / 2) * spread;
      this.fireShot(x, y, a, 112);
    }
  }

  private radialShots(x: number, y: number, n: number) {
    this.sfx('shoot');
    const offset = Math.random() * Math.PI;
    for (let i = 0; i < n; i++) this.fireShot(x, y, offset + (i / n) * Math.PI * 2, 96);
  }

  private fireShot(x: number, y: number, ang: number, speed: number) {
    const s = this.shots.create(x, y, 'brace') as ArcadeSprite;
    s.setDepth(8060).setRotation(ang);
    const body = s.body as Phaser.Physics.Arcade.Body;
    body.setSize(5, 5);
    body.setVelocity(Math.cos(ang) * speed, Math.sin(ang) * speed);
    this.time.delayedCall(3500, () => s.active && s.destroy());
  }

  private summonGoblins(n: number) {
    if (!this.boss) return;
    const lair = this.roomsById.get(this.boss.room);
    if (!lair) return;
    const bossTodos = this.spec.findings.todos.filter((t) => t.path === this.spec.boss?.path);
    for (let i = 0; i < n; i++) {
      const todo = bossTodos.length > 0 ? bossTodos[(this.bossTauntIdx + i) % bossTodos.length] : null;
      const x = this.boss.sprite.x + (i === 0 ? -26 : 26);
      const y = this.boss.sprite.y + 6;
      const tx = Math.floor(x / T);
      const ty = Math.floor((y - 4) / T);
      if (!this.walkable(tx, ty)) continue;
      const entity: Entity = {
        id: 100000 + Math.floor(Math.random() * 1e6),
        kind: 'goblin',
        x: tx,
        y: ty,
        room: this.boss.room,
        label: todo?.kind ?? 'TODO',
        text: todo?.text || 'refactor this later',
        path: todo?.path ?? this.spec.boss?.path,
        line: todo?.line ?? 1,
        url: todo?.url ?? this.spec.boss?.url ?? null,
        hp: TUNING.enemies.goblin.hp,
      };
      this.spawnEnemy(entity, x, y);
      const g = this.enemies[this.enemies.length - 1];
      g.state = 'chase';
      this.stats.goblinsTotal++;
      this.stats.enemiesTotal++;
      this.burst(x, y - 6, 0x79d36a, 10);
    }
    this.sfx('goblin');
  }

  private defeatBoss() {
    const e = this.boss!;
    const s = e.sprite;
    this.bossActive = false;
    this.stats.bossDefeated = true;
    this.sfx('roar');
    this.cameras.main.shake(900, 0.01);
    if (this.spec.boss) {
      const b = this.spec.boss;
      this.emit('boss', { state: 'defeated', name: b.name, hp: 0, maxHp: e.maxHp, loc: b.loc, locLeft: 0, phase: 3 });
      this.emit('log', { text: `${b.name} defeated! ${formatNumber(b.loc)} lines refactored`, url: b.url });
    }
    for (const shot of [...this.shots.getChildren()]) shot.destroy();
    for (const other of this.enemies) {
      if (other.state !== 'dead' && other !== e && other.room === e.room) this.killEnemy(other);
    }
    const tokens = ['{', '}', ';', '//', '=>', 'if', 'TODO', '()', '[]', 'return'];
    for (let i = 0; i < 14; i++) {
      this.time.delayedCall(i * 70, () => {
        this.burst(s.x + Phaser.Math.Between(-16, 16), s.y - Phaser.Math.Between(8, 40), i % 2 ? 0xf1e7cf : 0xff4d6d, 10);
        const t = this.worldText(tokens[i % tokens.length], 8, i % 2 ? '#ffd166' : '#ff9aa8').setOrigin(0.5).setDepth(8700);
        t.setPosition(s.x + Phaser.Math.Between(-18, 18), s.y - Phaser.Math.Between(10, 40));
        this.tweens.add({ targets: t, y: t.y - 30, alpha: 0, duration: 900, onComplete: () => t.destroy() });
      });
    }
    this.tweens.add({ targets: s, alpha: 0, scale: 1.3, duration: 1100, delay: 300, onComplete: () => s.destroy() });
    e.label?.destroy();
    e.shadow.destroy();
    this.time.delayedCall(1800, () => this.win());
  }

  private win() {
    if (this.ended) return;
    this.ended = true;
    if (this.stats.startedAt !== null) this.stats.timeMs = Date.now() - this.stats.startedAt;
    audio.stopMusic();
    this.sfx('victory');
    (this.hero.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
    this.emit('victory', { ...this.stats, resolved: [...this.stats.resolved] });
  }

  // ------------------------------------------------------------------ rooms & fog
  private updateRoomAndFog(force: boolean) {
    const tx = Math.floor(this.hero.x / T);
    const ty = Math.floor((this.hero.y - 4) / T);
    const idx = ty * this.W + tx;
    if (!force && idx === this.lastTile) return;
    this.lastTile = idx;
    const rid = this.roomAt[idx] ?? -1;
    if (rid !== -1 && rid !== this.currentRoom) this.enterRoom(rid);
    if (rid === -1 && this.currentRoom !== -1) {
      // In a corridor: keep the last room id for enemy logic, but not for fog.
    }
    const room = rid !== -1 ? this.roomsById.get(rid) ?? null : null;
    this.fog.update(tx, ty, 6, room ? room.rect : null);
  }

  private enterRoom(rid: number) {
    this.currentRoom = rid;
    const room = this.roomsById.get(rid)!;
    const first = !this.visited.has(rid);
    if (first) {
      this.visited.add(rid);
      this.stats.roomsVisited++;
    }
    this.lastSafe = { x: this.hero.x, y: this.hero.y };
    this.emit('room', { id: rid, label: room.label, kind: room.kind, files: room.files, first });
    if (first && room.kind === 'folder') this.sfx('ding');
    if (first) {
      const quests = this.questRooms.get(rid);
      if (quests) {
        for (const q of quests) {
          this.stats.questsFound++;
          this.sfx('quest');
          this.emit('quest', q);
          this.emit('toast', { text: `Quest found: #${q.number} ${q.title}`, tone: 'gold' });
          this.emit('log', { text: `Quest #${q.number} lives here`, url: q.url });
        }
      }
      if (room.kind === 'pit') this.emit('toast', { text: 'Pit of Dependencies. Watch your step.', tone: 'info' });
      if (room.kind === 'crypt') this.emit('toast', { text: 'Crypt of Stale Branches. Something rattles.', tone: 'info' });
    }
    if (room.kind === 'boss' && !this.bossActive && this.boss && this.boss.state !== 'dead') this.activateBoss();
  }

  // ------------------------------------------------------------------ interactions
  private scanInteract() {
    if (this.busy || this.ended) {
      if (this.currentHint) {
        this.currentHint = null;
        this.emit('hint', null);
      }
      return;
    }
    const hx = this.hero.x;
    const hy = this.hero.y - 6;
    let best: Interactable | null = null;
    let bestD = Infinity;
    for (const it of this.interactables) {
      const d = Phaser.Math.Distance.Between(hx, hy, it.x, it.y);
      if (d > it.range || d >= bestD) continue;
      if (it.hint() === null) continue;
      best = it;
      bestD = d;
    }
    if (best !== this.currentHint) {
      this.currentHint = best;
      this.emit('hint', best ? { text: best.hint() ?? '' } : null);
    }
    // Close an open dialog once the player walks away from where they opened it.
    if (this.dialogOpen && this.dialogAnchor && Phaser.Math.Distance.Between(this.hero.x, this.hero.y, this.dialogAnchor.x, this.dialogAnchor.y) > 56) {
      this.dialogAnchor = null;
      this.emit('dialog', null);
    }
    // Proximity labels for crates: show filename when close.
    for (const obj of this.solids.getChildren() as Phaser.Physics.Arcade.Sprite[]) {
      if (!obj.active || obj.getData('kind') !== 'crate') continue;
      const d = Phaser.Math.Distance.Between(hx, hy, obj.x, obj.y);
      let label = obj.getData('label') as Phaser.GameObjects.Text | undefined;
      if (d < 46) {
        if (!label) {
          const e = obj.getData('entity') as Entity;
          label = this.worldText(e.label ?? '', 6, '#e8d6b0', { stroke: '#1a1222', strokeThickness: 2 }).setOrigin(0.5, 1).setDepth(8400);
          label.setPosition(obj.x, obj.y - 16);
          obj.setData('label', label);
        }
        label.setVisible(true);
      } else if (label) {
        label.setVisible(false);
      }
      if (!obj.active && label) label.destroy();
    }
  }

  interact() {
    if (this.busy || this.ended) return;
    audio.unlock();
    if (this.currentHint) {
      this.sfx('click');
      this.dialogAnchor = { x: this.hero.x, y: this.hero.y };
      this.currentHint.run();
    }
  }

  private openNpc(e: Entity) {
    this.sfx('talk');
    const folder = String(e.meta?.folder ?? '');
    const commits = Number(e.meta?.commits ?? 0);
    const source = String(e.meta?.source ?? '');
    const where = folder ? `I guard /${folder}.` : 'I hang out in the entrance hall.';
    const count =
      source === 'codeowners' ? 'CODEOWNERS says this folder is mine.' : commits > 0 ? `${formatNumber(commits)} of the recent commits here are mine.` : '';
    const last = e.text ? `My latest work: "${e.text}"` : '';
    const payload: DialogPayload = {
      kind: 'npc',
      title: e.label ?? 'Guardian',
      text: [where, count, last].filter(Boolean).join(' '),
      avatar: (e.meta?.avatar as string | null) ?? null,
      sprite: `npc-${e.id}`,
      url: e.url ?? null,
      urlLabel: 'View profile',
    };
    this.emit('dialog', payload);
  }

  private openTablet(e: Entity) {
    const repo = this.spec.repo;
    this.emit('dialog', {
      kind: 'tablet',
      title: repo.fullName,
      text: e.text ?? '',
      sprite: 'tablet',
      url: repo.htmlUrl,
      urlLabel: 'Open the repo',
    });
  }

  private openQuests() {
    const quests = this.spec.findings.quests ?? [];
    this.emit('dialog', {
      kind: 'quests',
      title: 'Quest Board',
      text: quests.length > 0 ? 'Good first issues posted by the maintainers. Find the room each one lives in:' : 'No quests posted.',
      sprite: 'questboard',
      lines: quests.map((q) => ({
        text: `#${q.number} ${q.title}`,
        url: q.url,
        sub: `Seek it in ${this.roomsById.get(q.room)?.label ?? 'the dungeon'}`,
      })),
    });
  }

  private inspectCrate(e: Entity) {
    this.emit('dialog', {
      kind: 'crate',
      title: e.label ?? 'File',
      text: `${e.text ?? ''}${e.loc ? ` · about ${formatNumber(e.loc)} lines` : ''}. Hit it to see what falls out.`,
      sprite: e.meta?.barrel ? 'barrel' : 'crate',
      url: e.url ?? null,
      urlLabel: 'View file',
    });
  }

  // ------------------------------------------------------------------ floaters & bubbles
  private floatText(text: string, x: number, y: number, color: string) {
    const t = this.worldText(text, 7, color, { stroke: '#1a1222', strokeThickness: 2 }).setOrigin(0.5, 1).setDepth(8800).setPosition(x, y);
    this.tweens.add({ targets: t, y: y - 14, alpha: 0, duration: 750, ease: 'Quad.out', onComplete: () => t.destroy() });
  }

  private bubble(
    target: Phaser.GameObjects.Components.Transform & { active: boolean },
    text: string,
    sub: string,
    offsetY: number,
    duration: number,
    danger = false,
  ) {
    // One bubble per target.
    this.bubbles = this.bubbles.filter((b) => {
      if (b.target === target) {
        b.container.destroy();
        return false;
      }
      return true;
    });
    if (this.bubbles.length >= 4) {
      const old = this.bubbles.shift()!;
      old.container.destroy();
    }
    const maxW = 132;
    const main = this.worldText(text, 7, danger ? '#ffd0d8' : '#f7efd9', { wordWrap: { width: maxW, useAdvancedWrap: true }, align: 'center' }).setOrigin(0.5, 0);
    const subT = sub ? this.worldText(sub, 6, '#b8aed0', { wordWrap: { width: maxW, useAdvancedWrap: true }, align: 'center' }).setOrigin(0.5, 0) : null;
    const w = Math.ceil(Math.max(main.width, subT?.width ?? 0)) + 10;
    const h = Math.ceil(main.height + (subT ? subT.height + 1 : 0)) + 8;
    main.setPosition(0, -h + 4);
    subT?.setPosition(0, -h + 4 + main.height + 1);
    const g = this.add.graphics();
    g.fillStyle(danger ? 0x2a0e18 : 0x1b1528, 0.94);
    g.fillRect(-w / 2, -h, w, h);
    g.lineStyle(1, danger ? 0xff4d6d : 0xc9a96e, 1);
    g.strokeRect(-w / 2 + 0.5, -h + 0.5, w - 1, h - 1);
    g.fillStyle(danger ? 0x2a0e18 : 0x1b1528, 0.94);
    g.fillTriangle(-3, 0, 3, 0, 0, 4);
    const container = this.add.container(0, 0, subT ? [g, main, subT] : [g, main]).setDepth(9600);
    this.bubbles.push({ target, container, until: this.time.now + duration, offsetY });
    this.updateFloaters();
  }

  private updateFloaters() {
    const now = this.time.now;
    const cam = this.cameras.main;
    this.bubbles = this.bubbles.filter((b) => {
      if (now > b.until || !b.target.active) {
        b.container.destroy();
        return false;
      }
      let x = b.target.x;
      let y = b.target.y - b.offsetY;
      // Keep bubbles on screen.
      const view = cam.worldView;
      const bounds = b.container.getBounds();
      const halfW = (bounds.width || 80) / 2;
      x = Phaser.Math.Clamp(x, view.x + halfW + 2, view.right - halfW - 2);
      // Stay clear of the HUD along the top of the screen.
      y = Math.max(y, view.y + 150 / cam.zoom + (bounds.height || 20));
      b.container.setPosition(Math.round(x), Math.round(y));
      return true;
    });
  }

  private burst(x: number, y: number, color: number, count: number, gravity = 120) {
    this.particles.setParticleTint(color);
    this.particles.gravityY = gravity;
    this.particles.explode(count, x, y);
  }

  // ------------------------------------------------------------------ public API for UI
  getMinimapState() {
    return {
      w: this.W,
      h: this.H,
      tiles: this.tiles,
      fog: this.fog?.state ?? null,
      hero: this.hero && this.mode !== 'attract' ? { x: this.hero.x / T, y: this.hero.y / T } : null,
      rooms: this.spec.rooms,
      visited: this.visited,
      currentRoom: this.currentRoom,
      bossAlive: !!this.boss && this.boss.state !== 'dead',
      questRooms: [...this.questRooms.keys()],
    };
  }

  getStats(): RunStats {
    return this.stats;
  }

  // ------------------------------------------------------------------ debug hooks (?debug=1)
  private installDebug() {
    if (!/[?&]debug=1/.test(location.search) && !/[?&]debug=1/.test(location.hash)) return;
    const w = window as unknown as { __gitcrawl?: Record<string, unknown> };
    w.__gitcrawl = {
      scene: this,
      teleport: (kind: string) => {
        const room = this.spec.rooms.find((r) => r.kind === kind || r.label === kind);
        if (!room) return false;
        this.hero.setPosition((room.rect.x + room.rect.w / 2) * T, (room.rect.y + room.rect.h - 1) * T);
        return true;
      },
      killAll: () => {
        for (const e of this.enemies) if (e.state !== 'dead' && e.kind !== 'boss') this.killEnemy(e);
      },
      hitBoss: (n = 10) => {
        if (this.boss) for (let i = 0; i < n; i++) this.hitEnemy(this.boss, 1, 0, 1, 0);
      },
      stats: () => this.stats,
      setAim: (a: number) => (this.aim = a),
      attack: () => this.attack(),
      weapon: (w: WeaponId) => this.setWeapon(w),
      interact: () => this.interact(),
      hint: () => this.currentHint?.hint() ?? null,
      hero: () => ({ x: this.hero.x, y: this.hero.y, hp: this.hp }),
      moveTo: (x: number, y: number) => this.hero.setPosition(x, y),
      entities: () => this.spec.entities,
      audio,
    };
  }
}

/** Pixelify Sans has odd-looking fi/fl ligatures; a zero-width non-joiner breaks them. */
export function noLigatures(text: string): string {
  return text.replace(/f(?=[filt])/g, 'f\u200c');
}

function hslToHex(hsl: string): string {
  const m = /hsl\((\d+)\s+(\d+)%\s+(\d+)%\)/.exec(hsl);
  if (!m) return '#888888';
  const h = Number(m[1]) / 360;
  const s = Number(m[2]) / 100;
  const l = Number(m[3]) / 100;
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const r = Math.round(hue2rgb(p, q, h + 1 / 3) * 255);
  const g = Math.round(hue2rgb(p, q, h) * 255);
  const b = Math.round(hue2rgb(p, q, h - 1 / 3) * 255);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}
