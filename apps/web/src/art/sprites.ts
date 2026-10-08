/**
 * Hand-made pixel art, stored as text so it diffs nicely and needs no assets.
 * Each map is a list of rows; '.' is transparent, other characters index the
 * sprite's colour table. Drawn into canvases at boot (see textures.ts).
 */

export interface PixelSprite {
  rows: string[];
  colors: Record<string, string>;
}

const K = '#1a1222'; // outline

export const HERO_COLORS = {
  k: K,
  s: '#d7dfeb', // steel
  S: '#8d98ad', // steel shade
  v: '#262a3a', // visor
  e: '#7ff0ff', // eye glint
  p: '#ff6b5e', // plume
  P: '#c2423c',
  c: '#3f7fe0', // cloak
  C: '#2a56a6',
  b: '#6b4730', // boots
  l: '#3b4166', // legs
  y: '#ffd166', // belt buckle
};

const heroTop = [
  '................',
  '.......pp.......',
  '......pPPk......',
  '.....kkkkkk.....',
  '....kssssssk....',
  '....ksssvvvk....',
  '....kSssvevk....',
  '....kSsssssk....',
  '.....kkkkkk.....',
  '....kcccccck....',
  '...kccccccCCk...',
  '...kcCyycccCk...',
];

export const HERO_IDLE: PixelSprite = {
  colors: HERO_COLORS,
  rows: [...heroTop, '....kcccccCk....', '....klk..klk....', '....kbk..kbk....', '....kkk..kkk....'],
};

export const HERO_WALK_A: PixelSprite = {
  colors: HERO_COLORS,
  rows: [...heroTop, '....kcccccCk....', '...klk...klk....', '..kbbk...kbk....', '..kkk.....kk....'],
};

export const HERO_WALK_B: PixelSprite = {
  colors: HERO_COLORS,
  rows: [...heroTop, '....kcccccCk....', '.....klk.klk....', '.....kbk..kbbk..', '.....kk....kkk..'],
};

const GOBLIN_COLORS = {
  k: K,
  g: '#79d36a',
  G: '#3f8f3a',
  y: '#ffe24a',
  w: '#f4f1e8',
  b: '#8a5a33',
  B: '#5e3b20',
  r: '#c94a4a',
};

export const GOBLIN_A: PixelSprite = {
  colors: GOBLIN_COLORS,
  rows: [
    '................',
    '................',
    '................',
    '..kk........kk..',
    '.kgGk.kkkk.kGgk.',
    '.kggkkggggkkggk.',
    '..kgggggggggGk..',
    '...kgykgggykGk..',
    '...kggggggggGk..',
    '....kgwkkwgGk...',
    '....kGggggGGk...',
    '...kgkbbbbbkgk..',
    '...kgkbBbbBkgk..',
    '....kkbbbbbkk...',
    '.....kgk.kgk....',
    '.....kkk.kkk....',
  ],
};

export const GOBLIN_B: PixelSprite = {
  colors: GOBLIN_COLORS,
  rows: [
    '................',
    '................',
    '................',
    '..kk........kk..',
    '.kgGk.kkkk.kGgk.',
    '.kggkkggggkkggk.',
    '..kgggggggggGk..',
    '...kgykgggykGk..',
    '...kggggggggGk..',
    '....kgwkkwgGk...',
    '....kGggggGGk...',
    '..kgkbbbbbbkgk..',
    '..kgkbBbbBbkgk..',
    '....kkbbbbbkk...',
    '....kgk...kgk...',
    '....kkk...kkk...',
  ],
};

export const SLIME: PixelSprite = {
  colors: { k: K, m: '#b07cf0', M: '#7d4fc0', w: '#f1e6ff', e: '#2a1640' },
  rows: [
    '................',
    '................',
    '................',
    '................',
    '................',
    '......kkkk......',
    '....kkmmmmkk....',
    '...kmmwwmmmmk...',
    '..kmmwwmmmmmmk..',
    '..kmmmmmmmmmmk..',
    '.kmmmekmmmekmmk.',
    '.kmmmeemmmeemmk.',
    '.kmmmmmmmmmmmmk.',
    '.kMmmmmmmmmmmMk.',
    '..kMMMMMMMMMMk..',
    '...kkkkkkkkkk...',
  ],
};

export const GHOST: PixelSprite = {
  colors: { k: '#2b2440', w: '#eef2ff', W: '#b8c2e6', e: '#1b1630', b: '#ff9ac0' },
  rows: [
    '................',
    '.....kkkkkk.....',
    '....kwwwwwwk....',
    '...kwwwwwwwwk...',
    '...kwweewweek...',
    '...kwweewweek...',
    '..kwwwwwwwwwwk..',
    '..kwbwwwwwwbwk..',
    '..kwwwwkkwwwwk..',
    '..kwwwwkkwwwwk..',
    '..kwwwwwwwwwwk..',
    '..kWwwwwwwwwWWk.',
    '..kWWwwWWwwWWk..',
    '..kWkWWkkWWkWk..',
    '..kk.kk..kk.kk..',
    '................',
  ],
};

const BONE = { k: K, b: '#ece5cf', B: '#b9ae8c', e: '#120d18', r: '#ff5050' };

export const SKELETON_A: PixelSprite = {
  colors: BONE,
  rows: [
    '................',
    '.....kkkkkk.....',
    '....kbbbbbbk....',
    '....kbeebeek....',
    '....kbrebrek....',
    '....kbbbbbbk....',
    '.....kbkbkk.....',
    '......kbbk......',
    '....kkbBbbkk....',
    '...kbkbkkbkbk...',
    '...kbkbBbbkbk...',
    '....k.kbbk.k....',
    '......kbbk......',
    '.....kbkkbk.....',
    '.....kbk.kbk....',
    '....kkk..kkk....',
  ],
};

export const SKELETON_B: PixelSprite = {
  colors: BONE,
  rows: [
    '................',
    '.....kkkkkk.....',
    '....kbbbbbbk....',
    '....kbeebeek....',
    '....kbrebrek....',
    '....kbbbbbbk....',
    '.....kbkbkk.....',
    '......kbbk......',
    '...kkkbBbbkkk...',
    '..kbk.bkkb.kbk..',
    '...k.kbBbbk.k...',
    '......kbbk......',
    '......kbbk......',
    '.....kbkkbk.....',
    '....kbk...kbk...',
    '....kkk...kkk...',
  ],
};

/** NPC with robe colour 'r' replaced at draw time. */
export const NPC: PixelSprite = {
  colors: { k: K, h: '#3b2a24', t: '#f0c29a', T: '#c9906b', e: '#1a1222', r: '#888888', R: '#555555', b: '#3a2a20', w: '#f6efe0' },
  rows: [
    '................',
    '.....kkkkk......',
    '....khhhhhk.....',
    '...khhhhhhhk....',
    '...khtttttk.....',
    '...kttettek.....',
    '....kttttTk.....',
    '.....kTTTk......',
    '....krrwrrk.....',
    '...krrrwrrrk....',
    '...ktrrwrrtk....',
    '...kTrrrrrTk....',
    '....krrrrRk.....',
    '....krrRrRk.....',
    '....kbk.kbk.....',
    '....kkk.kkk.....',
  ],
};

const WOOD = { k: K, w: '#a8683a', W: '#7a4825', d: '#5a331a', g: '#f2c14e', G: '#b38a2a', l: '#2a1a10' };

export const CHEST_CLOSED: PixelSprite = {
  colors: WOOD,
  rows: [
    '................',
    '................',
    '................',
    '................',
    '..kkkkkkkkkkkk..',
    '.kwwwwwwwwwwwwk.',
    '.kWwwwwwwwwwwWk.',
    '.kggggggggggggk.',
    '.kWWWWWkgkWWWWk.',
    '.kwwwwwkGkwwwwk.',
    '.kwwwwwwkwwwwwk.',
    '.kWwwwwwwwwwwWk.',
    '.kgwwwwwwwwwwgk.',
    '.kWWWWWWWWWWWWk.',
    '..kkkkkkkkkkkk..',
    '................',
  ],
};

export const CHEST_OPEN: PixelSprite = {
  colors: { ...WOOD, y: '#ffe680' },
  rows: [
    '................',
    '..kkkkkkkkkkkk..',
    '.kWwwwwwwwwwwWk.',
    '.kggggggggggggk.',
    '.kllllllllllllk.',
    '.klyyylllyyyllk.',
    '.kllllllllllllk.',
    '.kggggggggggggk.',
    '.kWWWWWkgkWWWWk.',
    '.kwwwwwkGkwwwwk.',
    '.kwwwwwwkwwwwwk.',
    '.kWwwwwwwwwwwWk.',
    '.kgwwwwwwwwwwgk.',
    '.kWWWWWWWWWWWWk.',
    '..kkkkkkkkkkkk..',
    '................',
  ],
};

export const CRATE: PixelSprite = {
  colors: { k: K, w: '#b98550', W: '#8a5d33', d: '#5f3d1f' },
  rows: [
    '................',
    '................',
    '..kkkkkkkkkkkk..',
    '..kWWWWWWWWWWk..',
    '..kWwwwwwwwdWk..',
    '..kWdwwwwwdwWk..',
    '..kWwdwwwdwwWk..',
    '..kWwwdwdwwwWk..',
    '..kWwwwdwwwwWk..',
    '..kWwwdwdwwwWk..',
    '..kWwdwwwdwwWk..',
    '..kWdwwwwwdwWk..',
    '..kWwwwwwwwdWk..',
    '..kWWWWWWWWWWk..',
    '..kkkkkkkkkkkk..',
    '................',
  ],
};

export const BARREL: PixelSprite = {
  colors: { k: K, w: '#9c6a3c', W: '#704622', i: '#8c96a8', I: '#5c6478' },
  rows: [
    '................',
    '................',
    '.....kkkkkk.....',
    '....kWwwwwWk....',
    '...kWwwwwwwWk...',
    '...kiiiiiiiik...',
    '...kIIIIIIIIk...',
    '...kWwwwwwwWk...',
    '...kWwwwwwwWk...',
    '...kWwwwwwwWk...',
    '...kiiiiiiiik...',
    '...kIIIIIIIIk...',
    '...kWwwwwwwWk...',
    '....kWwwwwWk....',
    '.....kkkkkk.....',
    '................',
  ],
};

export const TORCH_A: PixelSprite = {
  colors: { k: K, f: '#ffd166', F: '#ff8c42', r: '#ff4d3d', w: '#fff6d6', b: '#6b4a32', i: '#9aa3b5' },
  rows: [
    '................',
    '................',
    '.......w........',
    '......wfw.......',
    '......fFf.......',
    '.....fFrFf......',
    '.....FrrrF......',
    '......FrF.......',
    '......kbk.......',
    '.....kibik......',
    '......kbk.......',
    '......kbk.......',
    '................',
    '................',
    '................',
    '................',
  ],
};

export const TORCH_B: PixelSprite = {
  colors: TORCH_A.colors,
  rows: [
    '................',
    '................',
    '........w.......',
    '.......wf.......',
    '......ffFf......',
    '......FrrF......',
    '.....fFrrFf.....',
    '......FrrF......',
    '......kbk.......',
    '.....kibik......',
    '......kbk.......',
    '......kbk.......',
    '................',
    '................',
    '................',
    '................',
  ],
};

export const QUESTBOARD: PixelSprite = {
  colors: { k: K, w: '#a8683a', W: '#7a4825', p: '#f3ead2', P: '#cbbf9e', r: '#e04b4b', y: '#ffd166' },
  rows: [
    '................',
    '.kkkkkkkkkkkkkk.',
    '.kWWWWWWWWWWWWk.',
    '.kWppppWWpppPWk.',
    '.kWpPPpWWprrpWk.',
    '.kWppppWWpPPpWk.',
    '.kWpPPpWWppppWk.',
    '.kWWWWWWWWWWWWk.',
    '.kWWpppppWyyWWk.',
    '.kWWpPPPpWyyWWk.',
    '.kWWpppppWWWWWk.',
    '.kkkkkkkkkkkkkk.',
    '...kWk....kWk...',
    '...kWk....kWk...',
    '...kWk....kWk...',
    '...kkk....kkk...',
  ],
};

export const TABLET: PixelSprite = {
  colors: { k: K, s: '#9aa0b4', S: '#6c7186', d: '#4a4e60', g: '#c7f2ff' },
  rows: [
    '................',
    '.....kkkkkk.....',
    '....kssssssk....',
    '...kssssssssk...',
    '...ksgggsssSk...',
    '...ksssssssSk...',
    '...ksggsgggSk...',
    '...ksssssssSk...',
    '...ksgggggsSk...',
    '...ksssssssSk...',
    '...ksggsgggSk...',
    '...kSSSSSSSSk...',
    '..kddddddddddk..',
    '..kSSSSSSSSSSk..',
    '..kkkkkkkkkkkk..',
    '................',
  ],
};

export const SHRINE: PixelSprite = {
  colors: { k: K, s: '#a4a9bd', S: '#6d7287', c: '#7ff7ff', C: '#2ec4d6', w: '#ffffff' },
  rows: [
    '................',
    '.......kk.......',
    '......kcwk......',
    '.....kccCCk.....',
    '.....kcwcCk.....',
    '.....kccCCk.....',
    '......kCCk......',
    '.......kk.......',
    '....kkkkkkkk....',
    '...kssssssssk...',
    '....kSssssSk....',
    '.....kssssk.....',
    '.....kSssSk.....',
    '....kssssssk....',
    '...kSSSSSSSSk...',
    '...kkkkkkkkkk...',
  ],
};

export const GOLD: PixelSprite = {
  colors: { k: K, g: '#ffd166', G: '#d9a63a', y: '#fff3b0', d: '#9c6b1c' },
  rows: [
    '................',
    '................',
    '................',
    '................',
    '.......kk.......',
    '......kygk......',
    '.....kgyggk.....',
    '....kkgGgGkk....',
    '...kgygkkgygk...',
    '..kggGgyggGggk..',
    '..kgygGgGygygk..',
    '.kgGgygGgGgygGk.',
    '.kggGgGygGgGggk.',
    '.kdGdGdGdGdGdGk.',
    '..kkkkkkkkkkkk..',
    '................',
  ],
};

export const THRONE: PixelSprite = {
  colors: { k: K, r: '#a33a4a', R: '#6e2230', g: '#ffd166', G: '#c49a35', s: '#7a7f94' },
  rows: [
    '....kk....kk....',
    '...kgGk..kgGk...',
    '...kGRkkkkRGk...',
    '...kGRrrrrRGk...',
    '...kGRrrrrRGk...',
    '...kGRrrrrRGk...',
    '...kGRrrrrRGk...',
    '..kkGRRRRRRGkk..',
    '.kgGGGGGGGGGGgk.',
    '.kGrrrrrrrrrrGk.',
    '.kGRRRRRRRRRRGk.',
    '.kGkkkkkkkkkkGk.',
    '.kGk........kGk.',
    '.kGk........kGk.',
    '.kkk........kkk.',
    '................',
  ],
};

export const BANNER: PixelSprite = {
  colors: { k: K, b: '#888888', B: '#555555', p: '#c9a96e', y: '#f3ead2' },
  rows: [
    '.kpppppppppppk..',
    '..kbbbbbbbbbk...',
    '..kbbbbbbbbBk...',
    '..kbbyybbbbBk...',
    '..kbyyyybbbBk...',
    '..kbbyybbbbBk...',
    '..kbbbbbbbbBk...',
    '..kbbbbbbbbBk...',
    '..kbbbbbbbbBk...',
    '..kbbbbbbbbBk...',
    '..kbbbbkbbbBk...',
    '..kbbbk.kbbBk...',
    '..kbbk...kbBk...',
    '..kbk.....kBk...',
    '..kk.......kk...',
    '................',
  ],
};

export const COBWEB: PixelSprite = {
  colors: { w: 'rgba(230,230,240,0.55)' },
  rows: [
    'wwwwwwwww.......',
    'w..w...w.w......',
    'w...w..w..w.....',
    'ww...w.w...w....',
    'w.w...ww....w...',
    'w..w..www....w..',
    'w...ww...w......',
    'w...w.w...w.....',
    'ww.w...w........',
    'w.w.....w.......',
    'ww..............',
    'w...............',
    'w...............',
    '................',
    '................',
    '................',
  ],
};

export const BONES: PixelSprite = {
  colors: { k: '#3a3040', b: '#d9d0b8', B: '#a39a80' },
  rows: [
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '..........kk....',
    '.........kbbk...',
    '..kk.....kbBk...',
    '.kbbkkkk..kk....',
    '..kbbbbbkk......',
    '...kkkkbbbk.....',
    '.......kbbk.....',
    '........kk......',
  ],
};

// --- small icons (12x12) ------------------------------------------------------

export const HEART_FULL: PixelSprite = {
  colors: { k: K, r: '#ff4d5e', R: '#b8283a', w: '#ffc2c8' },
  rows: ['.kkk.kkk.', 'krwrkrrrk', 'krrrrrrRk', 'krrrrrrRk', '.krrrrRk.', '..krrRk..', '...kRk...', '....k....'],
};

export const HEART_HALF: PixelSprite = {
  colors: { k: K, r: '#ff4d5e', R: '#b8283a', e: '#3a2a3e', w: '#ffc2c8' },
  rows: ['.kkk.kkk.', 'krwrkeeek', 'krrrreeek', 'krrrreeek', '.krrreek.', '..krrek..', '...kRk...', '....k....'],
};

export const HEART_EMPTY: PixelSprite = {
  colors: { k: K, e: '#3a2a3e', E: '#2a1e2e' },
  rows: ['.kkk.kkk.', 'keeekeeek', 'keeeeeeEk', 'keeeeeeEk', '.keeeeEk.', '..keeEk..', '...kEk...', '....k....'],
};

export const ICON_SWORD: PixelSprite = {
  colors: { k: K, s: '#e9eef7', S: '#9aa6bb', g: '#ffd166', b: '#7a4a2a' },
  rows: [
    '.........kk.',
    '........ksk.',
    '.......kssk.',
    '......kssk..',
    '.....kssk...',
    '..k.kssk....',
    '..kgkSk.....',
    '...kgk......',
    '..kbkgk.....',
    '.kbk.kgk....',
    '.kk.........',
    '............',
  ],
};

export const ICON_BOW: PixelSprite = {
  colors: { k: K, w: '#b07a45', W: '#7a4a2a', s: '#e9eef7', a: '#c9d1de' },
  rows: [
    '...kkk......',
    '..kwWk......',
    '.kwk.s......',
    '.kwk..s.....',
    'kwk...s..k..',
    'kwk...saakk.',
    'kwk...s..k..',
    '.kwk..s.....',
    '.kwk.s......',
    '..kwWk......',
    '...kkk......',
    '............',
  ],
};

export const ICON_HAMMER: PixelSprite = {
  colors: { k: K, i: '#aeb6c8', I: '#6e768a', w: '#a8683a', W: '#6e4325' },
  rows: [
    '..kkkkkk....',
    '.kiiiiiik...',
    '.kiiiiIIk...',
    '.kIIIIIIk...',
    '..kkwkkk....',
    '....kwk.....',
    '....kWk.....',
    '....kwk.....',
    '....kWk.....',
    '....kwk.....',
    '....kkk.....',
    '............',
  ],
};

export const ICON_POTION: PixelSprite = {
  colors: { k: K, g: '#cfd6e6', r: '#ff5e7a', R: '#c43058', w: '#ffd0da', c: '#8a5a33' },
  rows: [
    '....kkk.....',
    '....kck.....',
    '....kgk.....',
    '...kgggk....',
    '..kgwrrgk...',
    '.kgwrrrrgk..',
    '.kgrrrrrRk..',
    '.kgrrrrRRk..',
    '..kgRRRRk...',
    '...kkkkk....',
    '............',
    '............',
  ],
};

export const ICON_BOOTS: PixelSprite = {
  colors: { k: K, b: '#8a5a33', B: '#5e3b20', y: '#ffd166', w: '#e8f6ff' },
  rows: [
    '............',
    '..kkkk......',
    '..kbbk......',
    '..kbbk......',
    '..kbyk......',
    '..kbbk.w....',
    '..kbbbkkw...',
    '..kbbbbbbk..',
    '..kBBBBBBk..',
    '...kkkkkk...',
    '............',
    '............',
  ],
};

export const ICON_SHIELD: PixelSprite = {
  colors: { k: K, s: '#8fb7ff', S: '#4f7bd0', y: '#ffd166', w: '#e8f0ff' },
  rows: [
    '.kkkkkkkk...',
    '.kswsssSk...',
    '.kswsyySk...',
    '.ksssyySk...',
    '.kssyyssk...',
    '.kSsyysSk...',
    '..kSssSk....',
    '...kSSk.....',
    '....kk......',
    '............',
    '............',
    '............',
  ],
};

export const ICON_BLADE: PixelSprite = {
  colors: { k: K, s: '#fff7cf', S: '#ffd166', g: '#ff8c42', b: '#7a4a2a' },
  rows: [
    '.........kk.',
    '........ksk.',
    '.......kssk.',
    '......kssk..',
    '.....kSsk...',
    '..k.kSSk....',
    '..kgkSk.....',
    '...kgk......',
    '..kbkgk.....',
    '.kbk.kgk....',
    '.kk.........',
    '............',
  ],
};

export const ARROW: PixelSprite = {
  colors: { k: K, w: '#c99b66', s: '#e9eef7', f: '#ff6b5e' },
  rows: ['.f.......k..', 'ffwwwwwwwssk', '.f.......k..'],
};

export const BRACE: PixelSprite = {
  colors: { k: '#2a0a12', r: '#ff4d6d', w: '#ffd0d8' },
  rows: ['..kkk.', '.krwk.', '.krk..', '.krk..', 'krk...', '.krk..', '.krk..', '.krwk.', '..kkk.'],
};

export const EXCLAIM: PixelSprite = {
  colors: { k: K, y: '#ffd166' },
  rows: ['.kkk.', '.kyk.', '.kyk.', '.kyk.', '.kkk.', '.kyk.', '.kkk.'],
};
