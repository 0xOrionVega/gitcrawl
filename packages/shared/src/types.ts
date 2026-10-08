/**
 * Core data types.
 *
 * RepoSnapshot = raw facts about a repository, collected by a data source
 * (GitHub REST API, a local git checkout, or a fixture file).
 *
 * DungeonSpec = everything the game client needs to render and play a run,
 * derived deterministically from a snapshot by `generateDungeon`.
 */

export type SnapshotSource = 'github' | 'local' | 'fixture';

export interface TreeEntry {
  /** Path relative to the repo root, using `/` separators. Blobs only. */
  path: string;
  /** Size in bytes. */
  size: number;
}

export type TodoKind = 'TODO' | 'FIXME' | 'HACK' | 'XXX' | 'BUG';

export interface TodoItem {
  path: string;
  line: number;
  kind: TodoKind;
  /** Comment text after the keyword, cleaned up. May be empty. */
  text: string;
  /** Owner from `TODO(alice):` style comments. */
  owner?: string;
}

export interface ScannedFile {
  path: string;
  /** Exact number of lines. */
  lines: number;
  todos: TodoItem[];
  /** Candidate taunt lines (cleaned comment text). Only kept for big files. */
  comments?: string[];
}

export interface Contributor {
  login: string;
  avatarUrl: string | null;
  contributions: number;
  url: string | null;
}

export interface FolderCommit {
  /** Folder path the commit sample was taken for ('' = whole repo). */
  folder: string;
  author: string;
  avatarUrl: string | null;
  message: string;
  date: string | null;
}

export interface BranchInfo {
  name: string;
  lastCommitDate: string | null;
}

export interface IssueInfo {
  number: number;
  title: string;
  url: string;
  labels: string[];
  comments: number;
  createdAt: string | null;
}

export interface LicenseInfo {
  /** SPDX id when known, e.g. "MIT", "GPL-3.0". */
  spdx: string | null;
  name: string;
}

export interface RepoSnapshot {
  version: 1;
  source: SnapshotSource;
  owner: string;
  name: string;
  description: string | null;
  homepage: string | null;
  /** https://github.com/owner/name, or null for local repos without a GitHub remote. */
  htmlUrl: string | null;
  avatarUrl: string | null;
  defaultBranch: string;
  /** Commit SHA the snapshot describes. */
  sha: string;
  stars: number | null;
  forks: number | null;
  license: LicenseInfo | null;
  createdAt: string | null;
  pushedAt: string | null;
  primaryLanguage: string | null;
  /** Language name -> bytes. */
  languages: Record<string, number>;
  tree: TreeEntry[];
  treeTruncated: boolean;
  scanned: ScannedFile[];
  contributors: Contributor[];
  folderCommits: FolderCommit[];
  /** null = unknown (not collected). */
  branches: BranchInfo[] | null;
  /** Sample of open issues (PRs excluded). null = unknown. */
  issues: IssueInfo[] | null;
  openIssuesCount: number | null;
  /** good first issue / help wanted issues. null = unknown. */
  quests: IssueInfo[] | null;
  readmeExcerpt: string | null;
  codeowners: string | null;
  fetchedAt: string;
  private: boolean;
  /** Free-form notes about missing data, shown in the report. */
  notes: string[];
}

// ---------------------------------------------------------------------------
// Dungeon
// ---------------------------------------------------------------------------

export type ThemeId =
  | 'stone'
  | 'sun'
  | 'azure'
  | 'jungle'
  | 'ice'
  | 'rust'
  | 'iron'
  | 'forge'
  | 'coffee'
  | 'crimson'
  | 'indigo'
  | 'ember'
  | 'crystal'
  | 'sand'
  | 'violet';

export type RoomKind = 'entrance' | 'folder' | 'boss' | 'treasury' | 'crypt' | 'pit';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Room {
  id: number;
  kind: RoomKind;
  /** Display label, e.g. "packages/react-dom" or "Treasury". */
  label: string;
  /** Folder path this room represents ('' = repo root). null for special rooms. */
  folder: string | null;
  /** Floor area in tile coordinates. */
  rect: Rect;
  /** Recursive number of files mapped to this room. */
  files: number;
  bytes: number;
  depth: number;
  /** Position along the main path; -1 for side rooms. */
  order: number;
}

export type DoorKind = 'wooden' | 'iron' | 'enchanted' | 'rune' | 'cursed';

export interface Corridor {
  a: number;
  b: number;
  /** Door blocking the entrance into room b (treasury). */
  door: DoorKind | null;
}

export type EntityKind =
  | 'goblin'
  | 'slime'
  | 'ghost'
  | 'skeleton'
  | 'miniboss'
  | 'boss'
  | 'npc'
  | 'chest'
  | 'crate'
  | 'questboard'
  | 'tablet'
  | 'shrine'
  | 'door'
  | 'gold'
  | 'pit'
  | 'throne'
  | 'torch'
  | 'banner'
  | 'cobweb'
  | 'bones';

export type PowerUp = 'blade' | 'boots' | 'shield' | 'potion';

export interface Entity {
  id: number;
  kind: EntityKind;
  /** Tile coordinates (integer tile the entity stands on). */
  x: number;
  y: number;
  room: number;
  /** Short label, e.g. a filename or @login. */
  label?: string;
  /** Longer text, e.g. TODO text, issue title, commit message. */
  text?: string;
  path?: string;
  line?: number;
  url?: string | null;
  /** Combat hit points (in sword hits). */
  hp?: number;
  loc?: number;
  meta?: Record<string, string | number | boolean | null>;
}

export interface LanguageShare {
  name: string;
  bytes: number;
  pct: number;
  color: string;
}

export interface RepoMeta {
  owner: string;
  name: string;
  fullName: string;
  description: string | null;
  htmlUrl: string | null;
  avatarUrl: string | null;
  stars: number | null;
  forks: number | null;
  license: LicenseInfo | null;
  primaryLanguage: string | null;
  languages: LanguageShare[];
  sha: string;
  defaultBranch: string;
  createdAt: string | null;
  pushedAt: string | null;
  source: SnapshotSource;
  private: boolean;
}

export interface BossInfo {
  path: string;
  name: string;
  loc: number;
  exactLoc: boolean;
  hp: number;
  url: string | null;
  taunts: string[];
  language: string | null;
}

export interface DungeonStats {
  files: number;
  folders: number;
  codeFiles: number;
  totalLoc: number;
  scannedFiles: number;
  scannedLoc: number;
  todos: number;
  todosInDungeon: number;
  openIssues: number | null;
  staleBranches: number | null;
  contributors: number;
  maxDepth: number;
  deepestPath: string;
  rooms: number;
  enemies: number;
  testFiles: number;
  lockfileLoc: number;
}

export type CurseId =
  | 'no_license'
  | 'no_tests'
  | 'no_readme'
  | 'no_ci'
  | 'no_contributing'
  | 'abandoned'
  | 'no_description';

export interface Curse {
  id: CurseId;
  label: string;
  detail: string;
}

export interface BigFileFinding {
  path: string;
  loc: number;
  exact: boolean;
  url: string | null;
}

export interface TodoFinding extends TodoItem {
  url: string | null;
}

export interface BranchFinding {
  name: string;
  lastCommitDate: string;
  daysStale: number;
  url: string | null;
}

export interface QuestFinding {
  number: number;
  title: string;
  url: string;
  labels: string[];
  /** Room the quest is attached to. */
  room: number;
}

export interface GuardianFinding {
  folder: string;
  login: string;
  avatarUrl: string | null;
  commits: number;
  lastMessage: string | null;
  source: 'codeowners' | 'commits' | 'contributors';
}

export interface Findings {
  bigFiles: BigFileFinding[];
  todos: TodoFinding[];
  todoTotal: number;
  todoScannedFiles: number;
  staleBranches: BranchFinding[] | null;
  curses: Curse[];
  quests: QuestFinding[] | null;
  guardians: GuardianFinding[];
  lockfiles: { path: string; loc: number }[];
}

export interface HealthDeduction {
  id: string;
  label: string;
  points: number;
}

export interface Health {
  score: number;
  grade: 'S' | 'A' | 'B' | 'C' | 'D' | 'F';
  deductions: HealthDeduction[];
}

export interface DungeonTitle {
  id: string;
  name: string;
  tagline: string;
}

export interface DungeonMap {
  width: number;
  height: number;
  /**
   * Row-major tile string of length width*height:
   * ' ' void, '#' wall, '.' room floor, ',' corridor floor, 'o' pit hole.
   */
  tiles: string;
}

export interface DungeonSpec {
  version: 1;
  generator: string;
  repo: RepoMeta;
  seed: number;
  theme: ThemeId;
  title: DungeonTitle;
  abandoned: boolean;
  map: DungeonMap;
  rooms: Room[];
  corridors: Corridor[];
  entities: Entity[];
  spawn: { x: number; y: number };
  boss: BossInfo | null;
  stats: DungeonStats;
  findings: Findings;
  health: Health;
  readme: string | null;
  notes: string[];
  generatedAt: string;
}
