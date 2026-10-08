import * as S from '../art/sprites';
import { spriteDataUrl } from '../art/textures';
import type { WeaponId } from '../game/types';

let cache: Record<string, string> | null = null;

export function icons() {
  if (!cache) {
    cache = {
      heartFull: spriteDataUrl(S.HEART_FULL, 3),
      heartHalf: spriteDataUrl(S.HEART_HALF, 3),
      heartEmpty: spriteDataUrl(S.HEART_EMPTY, 3),
      sword: spriteDataUrl(S.ICON_SWORD, 3),
      bow: spriteDataUrl(S.ICON_BOW, 3),
      hammer: spriteDataUrl(S.ICON_HAMMER, 3),
      shield: spriteDataUrl(S.ICON_SHIELD, 2),
      blade: spriteDataUrl(S.ICON_BLADE, 2),
      boots: spriteDataUrl(S.ICON_BOOTS, 2),
      potion: spriteDataUrl(S.ICON_POTION, 2),
      tablet: spriteDataUrl(S.TABLET, 3),
      questboard: spriteDataUrl(S.QUESTBOARD, 3),
      crate: spriteDataUrl(S.CRATE, 3),
      barrel: spriteDataUrl(S.BARREL, 3),
      shrine: spriteDataUrl(S.SHRINE, 3),
      chest: spriteDataUrl(S.CHEST_CLOSED, 3),
      hero: spriteDataUrl(S.HERO_IDLE, 4),
      goblin: spriteDataUrl(S.GOBLIN_A, 4),
      ghost: spriteDataUrl(S.GHOST, 4),
      skeleton: spriteDataUrl(S.SKELETON_A, 4),
      gold: spriteDataUrl(S.GOLD, 3),
    };
  }
  return cache;
}

export function weaponIcon(w: WeaponId): string {
  return icons()[w];
}

export function npcIcon(robe: string): string {
  return spriteDataUrl(S.NPC, 3, { r: robe });
}
