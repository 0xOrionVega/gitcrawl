import Phaser from 'phaser';
import { makeCommonTextures } from '../art/textures';

/** Draws every texture once, then hands over to the dungeon. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('boot');
  }

  create() {
    makeCommonTextures(this);
    this.game.events.emit('gitcrawl-booted');
  }
}
