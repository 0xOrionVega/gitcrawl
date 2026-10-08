/**
 * All balancing numbers in one place so tuning never needs code changes.
 * Units: tiles for generation, pixels / ms for gameplay (16px tiles).
 */
export const TUNING = {
  generator: {
    /** Each grid column/row is (biggest room in it) + cellPad tiles, at least cellMin. */
    cellPad: 7,
    cellMinW: 16,
    cellMinH: 14,
    maxFolderRooms: 28,
    entrance: { w: 14, h: 10 },
    boss: { w: 20, h: 14 },
    treasury: { w: 10, h: 8 },
    crypt: { w: 12, h: 9 },
    pit: { w: 12, h: 10 },
    room: { minW: 8, maxW: 18, minH: 7, maxH: 13 },
    loopChance: 0.3,
    maxGoblins: 64,
    maxGoblinsPerRoom: 6,
    maxSlimes: 16,
    maxSlimesPerRoom: 3,
    slimeMinLoc: 600,
    maxGhosts: 12,
    maxSkeletons: 8,
    staleDays: 180,
    abandonedDays: 365,
    maxCratesPerRoom: 5,
    maxChests: 8,
    minibosses: 3,
    maxNpcs: 8,
  },
  scan: {
    maxFiles: 40,
    maxBytes: 5_000_000,
    maxFileBytes: 800_000,
    maxBossBytes: 1_500_000,
    privateMaxFiles: 15,
  },
  hero: {
    hp: 10,
    speed: 92,
    iframesMs: 700,
    interactRange: 26,
  },
  weapons: {
    sword: { damage: 1, cooldownMs: 280, range: 24, arcDeg: 120, knockback: 150 },
    bow: { damage: 1, cooldownMs: 420, speed: 270, range: 230, knockback: 60 },
    hammer: { damage: 3, cooldownMs: 780, radius: 30, reach: 14, knockback: 240 },
  },
  enemies: {
    goblin: { hp: 2, speed: 52, aggro: 110, damage: 1 },
    slime: { hp: 3, speed: 34, aggro: 95, damage: 1 },
    ghost: { hp: 3, speed: 30, aggro: 140, damage: 1 },
    skeleton: { hp: 3, speed: 48, aggro: 120, damage: 1 },
    miniboss: { hp: 14, speed: 40, aggro: 130, damage: 2 },
    boss: { hp: 42, speed: 38, damage: 2 },
    contactCooldownMs: 650,
  },
  powerups: {
    blade: { damageBonus: 1 },
    boots: { speedMult: 1.22 },
    shield: { absorb: 3 },
    potion: { heal: 6 },
  },
  health: {
    noLicense: 15,
    noTests: 15,
    noReadme: 10,
    noCi: 10,
    noContributing: 5,
    abandoned: 10,
    giantBoss: 10,
    bigBoss: 5,
    goblinPlague: 10,
    goblinTrouble: 5,
    staleBranches: 5,
    noDescription: 3,
  },
} as const;

export type Tuning = typeof TUNING;
