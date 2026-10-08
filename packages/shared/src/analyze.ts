/**
 * Turn a raw RepoSnapshot into structured facts: file classification, folder
 * stats, boss candidates, TODOs, guardians, curses, health score and title.
 */
import type {
  BranchFinding,
  Curse,
  DungeonTitle,
  GuardianFinding,
  Health,
  HealthDeduction,
  LanguageShare,
  RepoSnapshot,
  ThemeId,
  TodoItem,
} from './types.js';
import { basename, daysBetween, dirname, formatAge, formatCount, formatNumber, treeUrl } from './format.js';
import {
  isBinaryPath,
  isCiPath,
  isContributingPath,
  isGeneratedPath,
  isLicensePath,
  isLockfile,
  isPitPath,
  isReadmePath,
  isTestPath,
  languageColor,
  languageOf,
} from './languages.js';
import { getTheme, themeForLanguage } from './themes.js';
import { TUNING } from './tuning.js';

export interface FileInfo {
  path: string;
  dir: string;
  name: string;
  size: number;
  lang: string | null;
  code: boolean;
  generated: boolean;
  test: boolean;
  lockfile: boolean;
  pit: boolean;
  binary: boolean;
  loc: number;
  exact: boolean;
}

export interface FolderInfo {
  path: string;
  parent: string | null;
  depth: number;
  directFiles: number;
  totalFiles: number;
  bytes: number;
  codeFiles: number;
  testFiles: number;
  children: string[];
}

export interface Analysis {
  snapshot: RepoSnapshot;
  files: FileInfo[];
  fileByPath: Map<string, FileInfo>;
  folders: Map<string, FolderInfo>;
  codeFiles: FileInfo[];
  bossFile: FileInfo | null;
  minibossFiles: FileInfo[];
  slimeFiles: FileInfo[];
  bigFiles: FileInfo[];
  todos: TodoItem[];
  todoScannedFiles: number;
  taunts: string[];
  lockfiles: FileInfo[];
  pitFiles: number;
  testFiles: FileInfo[];
  hasReadme: boolean;
  hasContributing: boolean;
  hasCi: boolean;
  hasLicense: boolean;
  hasTests: boolean;
  staleBranches: BranchFinding[] | null;
  abandoned: boolean;
  daysSincePush: number | null;
  guardians: GuardianFinding[];
  languages: LanguageShare[];
  primaryLanguage: string | null;
  theme: ThemeId;
  totalLoc: number;
  scannedLoc: number;
  todoDensity: number;
  maxDepth: number;
  deepestPath: string;
  curses: Curse[];
  health: Health;
  title: DungeonTitle;
  notes: string[];
}

const KIND_PRIORITY: Record<string, number> = { FIXME: 0, HACK: 1, BUG: 2, XXX: 3, TODO: 4 };

export function analyzeSnapshot(snapshot: RepoSnapshot): Analysis {
  const notes = [...snapshot.notes];
  const scannedByPath = new Map(snapshot.scanned.map((s) => [s.path, s]));

  // --- files -------------------------------------------------------------
  const files: FileInfo[] = [];
  for (const entry of snapshot.tree) {
    if (entry.path.startsWith('.git/')) continue;
    const def = languageOf(entry.path);
    const binary = isBinaryPath(entry.path);
    const scanned = scannedByPath.get(entry.path);
    const generated = isGeneratedPath(entry.path, entry.size);
    const lockfile = isLockfile(entry.path);
    let loc = 0;
    let exact = false;
    if (scanned) {
      loc = scanned.lines;
      exact = true;
    } else if (!binary) {
      const bpl = lockfile ? 30 : def?.bpl ?? 40;
      loc = entry.size > 0 ? Math.max(1, Math.round(entry.size / bpl)) : 0;
    }
    files.push({
      path: entry.path,
      dir: dirname(entry.path),
      name: basename(entry.path),
      size: entry.size,
      lang: def?.name ?? null,
      code: !!def?.code && !binary,
      generated,
      test: isTestPath(entry.path),
      lockfile,
      pit: isPitPath(entry.path),
      binary,
      loc,
      exact,
    });
  }
  const fileByPath = new Map(files.map((f) => [f.path, f]));

  // --- folders -----------------------------------------------------------
  const folders = new Map<string, FolderInfo>();
  const ensureFolder = (path: string): FolderInfo => {
    let folder = folders.get(path);
    if (folder) return folder;
    const parent = path === '' ? null : dirname(path);
    folder = {
      path,
      parent,
      depth: path === '' ? 0 : path.split('/').length,
      directFiles: 0,
      totalFiles: 0,
      bytes: 0,
      codeFiles: 0,
      testFiles: 0,
      children: [],
    };
    folders.set(path, folder);
    if (parent !== null) ensureFolder(parent).children.push(path);
    return folder;
  };
  ensureFolder('');
  let maxDepth = 0;
  let deepestPath = '';
  for (const f of files) {
    const folder = ensureFolder(f.dir);
    folder.directFiles++;
    let cur: FolderInfo | undefined = folder;
    while (cur) {
      cur.totalFiles++;
      cur.bytes += f.size;
      if (f.code && !f.generated && !f.pit) cur.codeFiles++;
      if (f.test) cur.testFiles++;
      cur = cur.parent === null ? undefined : folders.get(cur.parent);
    }
    if (!f.pit) {
      const depth = f.path.split('/').length - 1;
      if (depth > maxDepth) {
        maxDepth = depth;
        deepestPath = f.dir;
      }
    }
  }

  // --- code, boss, minibosses, slimes ------------------------------------
  const codeFiles = files.filter((f) => f.code && !f.generated && !f.pit);
  const byLoc = (a: FileInfo, b: FileInfo) => b.loc - a.loc || a.path.localeCompare(b.path);
  const nonTest = codeFiles.filter((f) => !f.test).sort(byLoc);
  const tests = codeFiles.filter((f) => f.test).sort(byLoc);
  const ranked = [...nonTest, ...tests];
  let bossFile: FileInfo | null = ranked[0] ?? null;
  if (!bossFile) {
    // No real code: the biggest text file takes the throne (e.g. a lone Dockerfile).
    const text = files.filter((f) => !f.binary && !f.pit && !f.lockfile && f.loc > 0).sort(byLoc);
    bossFile = text.find((f) => f.code) ?? null;
  }
  const minibossFiles = ranked.filter((f) => f !== bossFile).slice(0, TUNING.generator.minibosses);
  const taken = new Set([bossFile?.path, ...minibossFiles.map((f) => f.path)]);
  const slimeFiles = ranked
    .filter((f) => !taken.has(f.path) && f.loc >= TUNING.generator.slimeMinLoc)
    .slice(0, TUNING.generator.maxSlimes);
  const bigFiles = ranked.slice(0, 10);

  // --- TODOs -------------------------------------------------------------
  const todos: TodoItem[] = [];
  let todoScannedFiles = 0;
  let scannedLoc = 0;
  for (const s of snapshot.scanned) {
    const info = fileByPath.get(s.path);
    if (info && (info.generated || info.pit)) continue;
    todoScannedFiles++;
    scannedLoc += s.lines;
    todos.push(...s.todos);
  }
  todos.sort(
    (a, b) =>
      (KIND_PRIORITY[a.kind] ?? 9) - (KIND_PRIORITY[b.kind] ?? 9) || a.path.localeCompare(b.path) || a.line - b.line,
  );
  const todoDensity = scannedLoc > 0 ? (todos.length / scannedLoc) * 10_000 : 0;

  const taunts = (bossFile && scannedByPath.get(bossFile.path)?.comments) || [];

  // --- special files -----------------------------------------------------
  const lockfiles = files.filter((f) => f.lockfile && !f.pit).sort(byLoc);
  const pitFiles = files.filter((f) => f.pit).length;
  const testFiles = files.filter((f) => f.test && !f.pit);
  const rootPaths = files.filter((f) => f.dir === '').map((f) => f.path);
  const hasReadme = rootPaths.some(isReadmePath);
  const hasContributing = files.some((f) => isContributingPath(f.path));
  const hasCi = files.some((f) => isCiPath(f.path));
  const hasLicense = !!snapshot.license || rootPaths.some(isLicensePath);
  const hasTests = testFiles.length > 0;

  // --- branches / activity -----------------------------------------------
  let staleBranches: BranchFinding[] | null = null;
  if (snapshot.branches) {
    staleBranches = [];
    for (const b of snapshot.branches) {
      if (b.name === snapshot.defaultBranch || !b.lastCommitDate) continue;
      const days = daysBetween(b.lastCommitDate, snapshot.fetchedAt);
      if (days >= TUNING.generator.staleDays) {
        staleBranches.push({
          name: b.name,
          lastCommitDate: b.lastCommitDate,
          daysStale: days,
          url: treeUrl(snapshot.htmlUrl, b.name),
        });
      }
    }
    staleBranches.sort((a, b) => b.daysStale - a.daysStale);
  }
  const daysSincePush = snapshot.pushedAt ? daysBetween(snapshot.pushedAt, snapshot.fetchedAt) : null;
  const abandoned = daysSincePush !== null && daysSincePush >= TUNING.generator.abandonedDays;

  // --- languages ---------------------------------------------------------
  let langBytes: Record<string, number> = snapshot.languages;
  if (Object.keys(langBytes).length === 0) {
    langBytes = {};
    for (const f of files) {
      if (!f.lang || f.pit || f.generated || f.binary) continue;
      langBytes[f.lang] = (langBytes[f.lang] ?? 0) + f.size;
    }
  }
  const totalLangBytes = Object.values(langBytes).reduce((a, b) => a + b, 0) || 1;
  const languages: LanguageShare[] = Object.entries(langBytes)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([name, bytes]) => ({
      name,
      bytes,
      pct: Math.round((bytes / totalLangBytes) * 1000) / 10,
      color: languageColor(name),
    }));
  const primaryLanguage = snapshot.primaryLanguage ?? languages[0]?.name ?? null;
  const theme = themeForLanguage(primaryLanguage);

  // --- guardians ---------------------------------------------------------
  const guardians = findGuardians(snapshot, folders);

  // --- totals ------------------------------------------------------------
  const totalLoc = codeFiles.reduce((sum, f) => sum + f.loc, 0);

  if (snapshot.treeTruncated) notes.push('This repo is huge: only part of its file tree could be mapped.');

  // --- curses & health ---------------------------------------------------
  const curses: Curse[] = [];
  const deductions: HealthDeduction[] = [];
  const H = TUNING.health;
  const curse = (id: Curse['id'], label: string, detail: string, points: number) => {
    curses.push({ id, label, detail });
    deductions.push({ id, label, points });
  };
  if (!hasLicense) curse('no_license', 'No license', 'Legally, nobody may use, copy or modify this code.', H.noLicense);
  if (!hasTests) curse('no_tests', 'No tests', 'No test files found. The healing shrine never appeared.', H.noTests);
  if (!hasReadme) curse('no_readme', 'No README', 'Visitors arrive with no map and no welcome.', H.noReadme);
  if (!hasCi) curse('no_ci', 'No CI', 'No CI config found (GitHub Actions, GitLab CI, CircleCI…).', H.noCi);
  if (!hasContributing) {
    curse('no_contributing', 'No CONTRIBUTING guide', 'Would-be contributors have to guess the rules.', H.noContributing);
  }
  if (abandoned && daysSincePush !== null) {
    curse('abandoned', 'Abandoned', `Last push ${formatAge(daysSincePush)} ago.`, H.abandoned);
  }
  if (!snapshot.description && snapshot.source === 'github') {
    curse('no_description', 'No description', 'The repo has no one-line description on GitHub.', H.noDescription);
  }
  if (bossFile && bossFile.loc >= 4000) {
    deductions.push({ id: 'giant_boss', label: `Giant file: ${bossFile.name} (${formatNumber(bossFile.loc)} lines)`, points: H.giantBoss });
  } else if (bossFile && bossFile.loc >= 2000) {
    deductions.push({ id: 'big_boss', label: `Big file: ${bossFile.name} (${formatNumber(bossFile.loc)} lines)`, points: H.bigBoss });
  }
  if (scannedLoc >= 1000 && todoDensity >= 15) {
    deductions.push({ id: 'goblin_plague', label: `Goblin plague: ${todoDensity.toFixed(1)} TODOs per 10k lines`, points: H.goblinPlague });
  } else if (scannedLoc >= 1000 && todoDensity >= 6) {
    deductions.push({ id: 'goblin_trouble', label: `Goblin trouble: ${todoDensity.toFixed(1)} TODOs per 10k lines`, points: H.goblinTrouble });
  }
  if (staleBranches && staleBranches.length > 10) {
    deductions.push({ id: 'stale_branches', label: `${staleBranches.length} stale branches`, points: H.staleBranches });
  }
  const score = Math.max(0, 100 - deductions.reduce((s, d) => s + d.points, 0));
  const health: Health = { score, grade: gradeFor(score), deductions };

  const analysis: Analysis = {
    snapshot,
    files,
    fileByPath,
    folders,
    codeFiles,
    bossFile,
    minibossFiles,
    slimeFiles,
    bigFiles,
    todos,
    todoScannedFiles,
    taunts,
    lockfiles,
    pitFiles,
    testFiles,
    hasReadme,
    hasContributing,
    hasCi,
    hasLicense,
    hasTests,
    staleBranches,
    abandoned,
    daysSincePush,
    guardians,
    languages,
    primaryLanguage,
    theme,
    totalLoc,
    scannedLoc,
    todoDensity,
    maxDepth,
    deepestPath,
    curses,
    health,
    title: { id: 'default', name: '', tagline: '' },
    notes,
  };
  analysis.title = pickTitle(analysis);
  return analysis;
}

export function gradeFor(score: number): Health['grade'] {
  if (score >= 95) return 'S';
  if (score >= 85) return 'A';
  if (score >= 70) return 'B';
  if (score >= 55) return 'C';
  if (score >= 40) return 'D';
  return 'F';
}

function pickTitle(a: Analysis): DungeonTitle {
  const s = a.snapshot;
  const files = a.files.filter((f) => !f.pit).length;
  const monorepoRoots = ['packages', 'apps', 'libs', 'crates', 'modules', 'services', 'plugins'];
  const isMonorepo = monorepoRoots.some((r) => (a.folders.get(r)?.children.length ?? 0) >= 4);
  if (a.codeFiles.length === 0) {
    return { id: 'empty', name: 'The Empty Throne', tagline: 'No code, no bugs. Technically unhackable.' };
  }
  if (files >= 8000) {
    return { id: 'mega', name: 'Endless Megadungeon', tagline: `${formatCount(files)} files deep. Bring snacks.` };
  }
  if (a.abandoned && a.daysSincePush !== null) {
    return {
      id: 'abandoned',
      name: 'Abandoned Crypt',
      tagline: `Last commit ${formatAge(a.daysSincePush)} ago. Something still stirs.`,
    };
  }
  if (a.todos.length >= 25 && a.todoDensity >= 12) {
    return {
      id: 'goblins',
      name: 'Goblin Infestation',
      tagline: `${formatNumber(a.todos.length)} TODOs found. They have formed a union.`,
    };
  }
  if (a.bossFile && a.bossFile.loc >= 6000) {
    return {
      id: 'colossus',
      name: 'Lair of the Colossus',
      tagline: `${a.bossFile.name} is ${formatNumber(a.bossFile.loc)} lines long. It has opinions.`,
    };
  }
  if (isMonorepo) {
    return { id: 'monorepo', name: 'Monorepo Megadungeon', tagline: 'Many packages, one very long corridor.' };
  }
  if (a.maxDepth >= 8) {
    return { id: 'labyrinth', name: 'Legacy Labyrinth', tagline: `Folders nested ${a.maxDepth} levels deep. Mind the stairs.` };
  }
  if (files < 25) {
    return { id: 'tavern', name: 'Tiny Tavern', tagline: `Only ${files} files. Cozy. Suspiciously cozy.` };
  }
  if (a.health.score >= 90) {
    return { id: 'sanctum', name: 'Pristine Sanctum', tagline: 'Tests, CI, a license and a README. Show-off.' };
  }
  const theme = getTheme(a.theme);
  return {
    id: 'theme',
    name: theme.name,
    tagline: s.description ? s.description : `${formatNumber(files)} files of ${a.primaryLanguage ?? 'mystery'}.`,
  };
}

function findGuardians(snapshot: RepoSnapshot, folders: Map<string, FolderInfo>): GuardianFinding[] {
  const out: GuardianFinding[] = [];
  const covered = new Set<string>();
  const avatarByLogin = new Map<string, string | null>();
  for (const c of snapshot.contributors) avatarByLogin.set(c.login.toLowerCase(), c.avatarUrl);
  for (const fc of snapshot.folderCommits) {
    if (fc.avatarUrl && !avatarByLogin.has(fc.author.toLowerCase())) avatarByLogin.set(fc.author.toLowerCase(), fc.avatarUrl);
  }

  // 1. CODEOWNERS
  if (snapshot.codeowners) {
    for (const raw of snapshot.codeowners.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const [pattern, ...owners] = line.split(/\s+/);
      const owner = owners.find((o) => o.startsWith('@'));
      if (!pattern || !owner) continue;
      let folder = pattern.replace(/^\//, '').replace(/\/\*\*?$/, '').replace(/\/$/, '');
      if (pattern === '*') folder = '';
      if (folder.includes('*')) continue;
      if (!folders.has(folder) || covered.has(folder)) continue;
      const login = owner.slice(1);
      covered.add(folder);
      out.push({
        folder,
        login,
        avatarUrl: avatarByLogin.get(login.toLowerCase()) ?? null,
        commits: 0,
        lastMessage: null,
        source: 'codeowners',
      });
    }
  }

  // 2. Folder commit samples: most frequent author per folder.
  const byFolder = new Map<string, Map<string, { n: number; msg: string; date: string | null; avatar: string | null }>>();
  for (const c of snapshot.folderCommits) {
    if (!c.author || /\[bot\]$|^dependabot|^renovate|^github-actions/i.test(c.author)) continue;
    let m = byFolder.get(c.folder);
    if (!m) byFolder.set(c.folder, (m = new Map()));
    const cur = m.get(c.author);
    if (cur) {
      cur.n++;
      if (c.date && (!cur.date || c.date > cur.date)) {
        cur.msg = c.message;
        cur.date = c.date;
      }
    } else {
      m.set(c.author, { n: 1, msg: c.message, date: c.date, avatar: c.avatarUrl });
    }
  }
  for (const [folder, authors] of byFolder) {
    if (covered.has(folder) || !folders.has(folder)) continue;
    const best = [...authors.entries()].sort((a, b) => b[1].n - a[1].n || a[0].localeCompare(b[0]))[0];
    if (!best) continue;
    covered.add(folder);
    out.push({
      folder,
      login: best[0],
      avatarUrl: best[1].avatar ?? avatarByLogin.get(best[0].toLowerCase()) ?? null,
      commits: best[1].n,
      lastMessage: best[1].msg || null,
      source: 'commits',
    });
  }

  // 3. Top contributors hang out in the entrance hall.
  const used = new Set(out.map((g) => g.login.toLowerCase()));
  for (const c of snapshot.contributors) {
    if (out.length >= TUNING.generator.maxNpcs) break;
    if (used.has(c.login.toLowerCase()) || /\[bot\]$/i.test(c.login)) continue;
    used.add(c.login.toLowerCase());
    const lastMessage = snapshot.folderCommits.find((fc) => fc.author.toLowerCase() === c.login.toLowerCase())?.message ?? null;
    out.push({
      folder: '',
      login: c.login,
      avatarUrl: c.avatarUrl,
      commits: c.contributions,
      lastMessage,
      source: 'contributors',
    });
  }
  return out.slice(0, 12);
}

/** Pull a short, clean excerpt out of a README for the entrance tablet. */
export function summarizeReadme(raw: string | null, fallback: string | null): string | null {
  if (!raw) return fallback;
  const text = raw
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[!\[[^\]]*\]\([^)]*\)\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/`{3}[\s\S]*?`{3}/g, '')
    .replace(/[*_`>]/g, '');
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  let heading: string | null = null;
  let para: string | null = null;
  for (const line of lines) {
    if (!line) continue;
    if (/^#+\s/.test(line)) {
      if (!heading) heading = line.replace(/^#+\s*/, '').trim();
      continue;
    }
    if (/^[=-]{3,}$/.test(line) || /^\|/.test(line)) continue;
    if (line.length < 20) continue;
    para = line;
    break;
  }
  const parts = [heading, para].filter(Boolean) as string[];
  if (parts.length === 0) return fallback;
  const joined = parts.join(' — ');
  return joined.length > 240 ? `${joined.slice(0, 239).trimEnd()}…` : joined;
}

