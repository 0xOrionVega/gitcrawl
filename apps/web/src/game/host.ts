/**
 * Owns the single Phaser.Game instance. The landing page, the run and the
 * attract-mode background all reuse it by restarting the dungeon scene.
 */
import Phaser from 'phaser';
import type { DungeonSpec } from '@gitcrawl/shared';
import { BootScene } from './BootScene';
import { DungeonScene } from './DungeonScene';
import { Emitter } from '../util/emitter';
import type { GameEvents, GameMode } from './types';

export const bus = new Emitter<GameEvents>();

let game: Phaser.Game | null = null;
let booted: Promise<void> | null = null;

export function ensureGame(parent: HTMLElement): Promise<void> {
  if (booted) return booted;
  booted = new Promise((resolve) => {
    game = new Phaser.Game({
      type: Phaser.AUTO,
      parent,
      backgroundColor: '#0b0a0f',
      pixelArt: true,
      roundPixels: true,
      antialias: false,
      scale: { mode: Phaser.Scale.RESIZE, width: parent.clientWidth || window.innerWidth, height: parent.clientHeight || window.innerHeight },
      physics: { default: 'arcade', arcade: { debug: false } },
      audio: { noAudio: true },
      banner: false,
      input: { mouse: { preventDefaultWheel: false }, touch: { capture: true } },
      scene: [BootScene, DungeonScene],
    });
    game.events.once('gitcrawl-booted', () => resolve());
  });
  return booted;
}

export function startDungeon(spec: DungeonSpec, mode: GameMode) {
  if (!game) throw new Error('Game not created');
  // Use the SceneManager for both calls: ScenePlugin.stop() is always queued to
  // the next frame and would shut down the freshly started scene.
  if (game.scene.isActive('dungeon') || game.scene.isPaused('dungeon') || game.scene.isSleeping('dungeon')) game.scene.stop('dungeon');
  game.scene.start('dungeon', { spec, mode, bus });
}

export function stopDungeon() {
  if (!game) return;
  if (game.scene.isActive('dungeon') || game.scene.isPaused('dungeon')) game.scene.stop('dungeon');
}

export function getDungeon(): DungeonScene | null {
  if (!game) return null;
  const scene = game.scene.getScene('dungeon') as DungeonScene | null;
  return scene && scene.scene.isActive() ? scene : null;
}

export function getCanvas(): HTMLCanvasElement | null {
  return game?.canvas ?? null;
}

export function setPaused(paused: boolean) {
  const scene = getDungeon();
  if (!scene) return;
  if (paused) scene.scene.pause();
  else scene.scene.resume();
}
