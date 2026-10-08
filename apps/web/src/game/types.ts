import type { DungeonSpec, PowerUp, RoomKind } from '@gitcrawl/shared';

export type WeaponId = 'sword' | 'bow' | 'hammer';
export const WEAPONS: WeaponId[] = ['sword', 'bow', 'hammer'];

export type GameMode = 'play' | 'explore' | 'attract';

export interface ResolvedTodo {
  kind: string;
  text: string;
  path: string;
  line: number;
  url: string | null;
}

export interface RunStats {
  repo: string;
  mode: GameMode;
  startedAt: number | null;
  timeMs: number;
  goblinsKilled: number;
  goblinsTotal: number;
  enemiesKilled: number;
  enemiesTotal: number;
  bossDefeated: boolean;
  bossName: string | null;
  deaths: number;
  cratesBroken: number;
  chestsOpened: number;
  roomsVisited: number;
  roomsTotal: number;
  questsFound: number;
  questsTotal: number;
  treasure: number | null;
  pitFalls: number;
  weaponUse: Record<WeaponId, number>;
  resolved: ResolvedTodo[];
  hitsTaken: number;
}

export type DialogKind = 'npc' | 'tablet' | 'quests' | 'door' | 'shrine' | 'gold' | 'pit' | 'throne' | 'crate' | 'chest' | 'info';

export interface DialogPayload {
  kind: DialogKind;
  title: string;
  text?: string;
  avatar?: string | null;
  sprite?: string;
  url?: string | null;
  urlLabel?: string;
  lines?: { text: string; url?: string | null; sub?: string }[];
}

export interface GameEvents extends Record<string, unknown> {
  ready: { spec: DungeonSpec; mode: GameMode };
  hp: { hp: number; max: number; shield: number };
  weapon: { weapon: WeaponId };
  powerup: { kind: PowerUp; blade: number; speed: number; shield: number };
  room: { id: number; label: string; kind: RoomKind; files: number; first: boolean };
  boss: { state: 'start' | 'hp' | 'defeated'; name: string; hp: number; maxHp: number; loc: number; locLeft: number; phase: number };
  toast: { text: string; tone?: 'good' | 'bad' | 'info' | 'gold' };
  dialog: DialogPayload | null;
  hint: { text: string } | null;
  log: { text: string; url?: string | null };
  stats: RunStats;
  victory: RunStats;
  death: { deaths: number };
  quest: { number: number; title: string; url: string };
}
