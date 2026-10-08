import type { ThemeId } from './types.js';

export interface ThemePalette {
  /** Floor base and variants. */
  floor: string;
  floorAlt: string;
  floorDark: string;
  corridor: string;
  /** Wall top (seen from above) and wall face (front bricks). */
  wallTop: string;
  wallTopEdge: string;
  wallFace: string;
  wallFaceDark: string;
  wallFaceLight: string;
  /** Accent used for banners, runes, UI highlights. */
  accent: string;
  /** Torch / light colour. */
  light: string;
  /** Background behind the map. */
  void: string;
}

export interface ThemeMusic {
  /** MIDI root note. */
  root: number;
  scale: 'minor' | 'dorian' | 'phrygian' | 'major' | 'mixolydian' | 'harmonicMinor' | 'pentatonic';
  bpm: number;
  lead: 'square' | 'triangle' | 'sawtooth' | 'sine';
  /** Chord progression as scale degrees (0-based). */
  progression: number[];
}

export interface Theme {
  id: ThemeId;
  name: string;
  palette: ThemePalette;
  music: ThemeMusic;
}

const T = (id: ThemeId, name: string, palette: ThemePalette, music: ThemeMusic): Theme => ({ id, name, palette, music });

export const THEMES: Record<ThemeId, Theme> = {
  stone: T('stone', 'Forgotten Catacombs', {
    floor: '#3b3646', floorAlt: '#423c4e', floorDark: '#2e2a38', corridor: '#35303f',
    wallTop: '#1d1a24', wallTopEdge: '#2b2735', wallFace: '#5a5266', wallFaceDark: '#433d4e', wallFaceLight: '#6d6479',
    accent: '#c9a96e', light: '#ffb45e', void: '#0b0a0f',
  }, { root: 50, scale: 'minor', bpm: 104, lead: 'square', progression: [0, 5, 2, 6] }),

  sun: T('sun', 'Sun Temple', {
    floor: '#5b4a2c', floorAlt: '#665434', floorDark: '#4a3c24', corridor: '#544428',
    wallTop: '#2a2014', wallTopEdge: '#3b2e1c', wallFace: '#a08446', wallFaceDark: '#7f6836', wallFaceLight: '#bc9d58',
    accent: '#f1e05a', light: '#ffd66e', void: '#0e0b07',
  }, { root: 52, scale: 'mixolydian', bpm: 118, lead: 'square', progression: [0, 6, 3, 4] }),

  azure: T('azure', 'Azure Citadel', {
    floor: '#2c3a52', floorAlt: '#33435e', floorDark: '#243046', corridor: '#29364c',
    wallTop: '#121a29', wallTopEdge: '#1c2639', wallFace: '#4a6390', wallFaceDark: '#384d73', wallFaceLight: '#5a77a8',
    accent: '#5fa8ff', light: '#9fd0ff', void: '#070a12',
  }, { root: 50, scale: 'dorian', bpm: 112, lead: 'triangle', progression: [0, 3, 6, 4] }),

  jungle: T('jungle', 'Overgrown Jungle Temple', {
    floor: '#34442f', floorAlt: '#3b4d35', floorDark: '#2a3826', corridor: '#303f2b',
    wallTop: '#141c12', wallTopEdge: '#1f2b1c', wallFace: '#56704a', wallFaceDark: '#42583a', wallFaceLight: '#688758',
    accent: '#ffd43b', light: '#d8ff8a', void: '#070b06',
  }, { root: 48, scale: 'pentatonic', bpm: 100, lead: 'triangle', progression: [0, 3, 4, 2] }),

  ice: T('ice', 'Ice Caverns', {
    floor: '#2f4a54', floorAlt: '#36545f', floorDark: '#263e47', corridor: '#2c454f',
    wallTop: '#0f1f26', wallTopEdge: '#18303a', wallFace: '#5b95a8', wallFaceDark: '#467889', wallFaceLight: '#74b3c7',
    accent: '#00ADD8', light: '#b5f4ff', void: '#050d10',
  }, { root: 53, scale: 'dorian', bpm: 124, lead: 'square', progression: [0, 2, 5, 4] }),

  rust: T('rust', 'Rusted Iron Keep', {
    floor: '#4a3a33', floorAlt: '#54423a', floorDark: '#3c2f29', corridor: '#45362f',
    wallTop: '#1f1612', wallTopEdge: '#2f221c', wallFace: '#8a5a43', wallFaceDark: '#6d4635', wallFaceLight: '#a56d52',
    accent: '#dea584', light: '#ffb07a', void: '#0c0806',
  }, { root: 45, scale: 'harmonicMinor', bpm: 110, lead: 'sawtooth', progression: [0, 5, 3, 4] }),

  iron: T('iron', 'Iron Depths', {
    floor: '#3a3d42', floorAlt: '#42454b', floorDark: '#2f3236', corridor: '#36393e',
    wallTop: '#16181b', wallTopEdge: '#222428', wallFace: '#5d636c', wallFaceDark: '#484d55', wallFaceLight: '#727985',
    accent: '#a8b3c2', light: '#ffcf8a', void: '#08090a',
  }, { root: 43, scale: 'phrygian', bpm: 98, lead: 'square', progression: [0, 1, 0, 6] }),

  forge: T('forge', 'Molten Forge', {
    floor: '#46302f', floorAlt: '#513735', floorDark: '#3a2827', corridor: '#432e2d',
    wallTop: '#1e1111', wallTopEdge: '#2f1a1a', wallFace: '#8c4651', wallFaceDark: '#6e3540', wallFaceLight: '#a85563',
    accent: '#f34b7d', light: '#ff8a5c', void: '#0d0606',
  }, { root: 47, scale: 'harmonicMinor', bpm: 126, lead: 'sawtooth', progression: [0, 3, 4, 4] }),

  coffee: T('coffee', 'Coffee Mines', {
    floor: '#45362a', floorAlt: '#4f3e30', floorDark: '#392c22', corridor: '#413328',
    wallTop: '#1c140e', wallTopEdge: '#2b2017', wallFace: '#7d5a3c', wallFaceDark: '#63472f', wallFaceLight: '#96704d',
    accent: '#b07219', light: '#ffc27a', void: '#0b0806',
  }, { root: 48, scale: 'minor', bpm: 96, lead: 'triangle', progression: [0, 3, 5, 4] }),

  crimson: T('crimson', 'Crimson Caves', {
    floor: '#43272b', floorAlt: '#4d2c31', floorDark: '#381f23', corridor: '#3f2428',
    wallTop: '#1b0d10', wallTopEdge: '#2a1519', wallFace: '#7a2f3b', wallFaceDark: '#5f232d', wallFaceLight: '#943a48',
    accent: '#e0115f', light: '#ff9a8a', void: '#0c0506',
  }, { root: 50, scale: 'harmonicMinor', bpm: 108, lead: 'square', progression: [0, 5, 3, 4] }),

  indigo: T('indigo', 'Elephant Halls', {
    floor: '#33354f', floorAlt: '#3a3c5a', floorDark: '#2a2c42', corridor: '#30324a',
    wallTop: '#14152a', wallTopEdge: '#1e2039', wallFace: '#575c91', wallFaceDark: '#444874', wallFaceLight: '#6a70ad',
    accent: '#8892bf', light: '#c7b8ff', void: '#07070f',
  }, { root: 52, scale: 'dorian', bpm: 102, lead: 'triangle', progression: [0, 3, 2, 4] }),

  ember: T('ember', 'Ember Spires', {
    floor: '#4a3328', floorAlt: '#55392d', floorDark: '#3d2a21', corridor: '#452f25',
    wallTop: '#1f120c', wallTopEdge: '#2f1c13', wallFace: '#a35a36', wallFaceDark: '#82472a', wallFaceLight: '#c06c42',
    accent: '#F05138', light: '#ffb070', void: '#0d0705',
  }, { root: 52, scale: 'mixolydian', bpm: 120, lead: 'square', progression: [0, 4, 5, 3] }),

  crystal: T('crystal', 'Crystal Grotto', {
    floor: '#2c4236', floorAlt: '#324b3d', floorDark: '#24372d', corridor: '#2a3e33',
    wallTop: '#0f1c15', wallTopEdge: '#182b20', wallFace: '#4d8065', wallFaceDark: '#3b654f', wallFaceLight: '#5e9a7a',
    accent: '#68217a', light: '#b8ffd8', void: '#050c08',
  }, { root: 49, scale: 'minor', bpm: 106, lead: 'triangle', progression: [0, 6, 5, 4] }),

  sand: T('sand', 'Sandstone Shell', {
    floor: '#4f4632', floorAlt: '#594f39', floorDark: '#423a29', corridor: '#4a4230',
    wallTop: '#211d13', wallTopEdge: '#322c1d', wallFace: '#8f8459', wallFaceDark: '#726945', wallFaceLight: '#a89c6b',
    accent: '#89e051', light: '#fff0a0', void: '#0c0b07',
  }, { root: 47, scale: 'pentatonic', bpm: 116, lead: 'square', progression: [0, 2, 3, 1] }),

  violet: T('violet', 'Violet Vaults', {
    floor: '#3c2f4f', floorAlt: '#45365a', floorDark: '#322742', corridor: '#392d4b',
    wallTop: '#170f22', wallTopEdge: '#241834', wallFace: '#6e4f95', wallFaceDark: '#573d77', wallFaceLight: '#8361ad',
    accent: '#A97BFF', light: '#e0c2ff', void: '#09060e',
  }, { root: 51, scale: 'dorian', bpm: 110, lead: 'triangle', progression: [0, 5, 6, 4] }),
};

const LANGUAGE_THEME: Record<string, ThemeId> = {
  JavaScript: 'sun', Vue: 'jungle', Svelte: 'ember', Astro: 'ember',
  TypeScript: 'azure',
  Python: 'jungle', Cython: 'jungle', 'Jupyter Notebook': 'jungle',
  Go: 'ice', Dart: 'ice', Elm: 'ice',
  Rust: 'rust', Zig: 'rust',
  C: 'iron', Assembly: 'iron', Fortran: 'iron', Makefile: 'iron',
  'C++': 'forge', 'Objective-C': 'forge', 'Objective-C++': 'forge', CMake: 'forge',
  Java: 'coffee', Groovy: 'coffee', Scala: 'crimson',
  Kotlin: 'violet', Elixir: 'violet', Haskell: 'violet', 'F#': 'violet', Gleam: 'violet', Clojure: 'violet',
  Ruby: 'crimson', Crystal: 'crimson', Erlang: 'crimson',
  PHP: 'indigo', Perl: 'indigo', Nix: 'indigo',
  Swift: 'ember', OCaml: 'ember',
  'C#': 'crystal', Solidity: 'crystal', Julia: 'crystal', R: 'crystal',
  Shell: 'sand', PowerShell: 'sand', Lua: 'sand', Nim: 'sand', Dockerfile: 'sand',
};

export function themeForLanguage(language: string | null): ThemeId {
  if (!language) return 'stone';
  return LANGUAGE_THEME[language] ?? 'stone';
}

export function getTheme(id: ThemeId): Theme {
  return THEMES[id] ?? THEMES.stone;
}
