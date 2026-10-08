/**
 * Build a RepoSnapshot from the GitHub REST API.
 *
 * Works in Node (server, with a token) and in the browser (unauthenticated
 * "lite" fallback when the server is busy). File contents come from
 * raw.githubusercontent.com, which does not count against the API rate limit;
 * private repos use the contents API with the user's token instead.
 */
import type {
  BranchInfo,
  Contributor,
  FolderCommit,
  IssueInfo,
  RepoSnapshot,
  ScannedFile,
  TreeEntry,
} from '../types.js';
import { scanContent, looksBinary } from '../scan.js';
import {
  isBinaryPath,
  isCodeownersPath,
  isGeneratedPath,
  isPitPath,
  isReadmePath,
  isTestPath,
  languageOf,
} from '../languages.js';
import { encodePath } from '../format.js';
import { TUNING } from '../tuning.js';

export type GithubErrorCode = 'not_found' | 'rate_limited' | 'forbidden' | 'network' | 'invalid' | 'other';

export class GithubError extends Error {
  readonly status: number;
  readonly code: GithubErrorCode;
  readonly resetAt: number | null;
  constructor(message: string, status: number, code: GithubErrorCode, resetAt: number | null = null) {
    super(message);
    this.name = 'GithubError';
    this.status = status;
    this.code = code;
    this.resetAt = resetAt;
  }
}

export interface RateInfo {
  remaining: number | null;
  limit: number | null;
  resetAt: number | null;
  calls: number;
}

export interface GithubFetchOptions {
  token?: string | null;
  fetchImpl?: typeof fetch;
  apiBase?: string;
  rawBase?: string;
  /** "full" = server with a token; "lite" = fewer calls for unauthenticated browsers. */
  mode?: 'full' | 'lite';
  /** Use the contents API (with token) for file bodies instead of raw.githubusercontent.com. */
  privateRepo?: boolean;
  onProgress?: (step: string) => void;
  signal?: AbortSignal;
  now?: () => Date;
  userAgent?: string;
  concurrency?: number;
}

interface ApiResult<T> {
  data: T;
  status: number;
}

export async function fetchGithubSnapshot(
  ownerIn: string,
  nameIn: string,
  opts: GithubFetchOptions = {},
): Promise<{ snapshot: RepoSnapshot; rate: RateInfo }> {
  const doFetch = opts.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const apiBase = (opts.apiBase ?? 'https://api.github.com').replace(/\/$/, '');
  const rawBase = (opts.rawBase ?? 'https://raw.githubusercontent.com').replace(/\/$/, '');
  const mode = opts.mode ?? (opts.token ? 'full' : 'lite');
  const progress = opts.onProgress ?? (() => {});
  const now = opts.now ?? (() => new Date());
  const isBrowser = typeof (globalThis as { document?: unknown }).document !== 'undefined';
  const rate: RateInfo = { remaining: null, limit: null, resetAt: null, calls: 0 };
  const notes: string[] = [];

  const headersFor = (accept: string): Record<string, string> => {
    const h: Record<string, string> = { Accept: accept, 'X-GitHub-Api-Version': '2022-11-28' };
    if (opts.token) h.Authorization = `Bearer ${opts.token}`;
    if (!isBrowser) h['User-Agent'] = opts.userAgent ?? 'gitcrawl';
    return h;
  };

  const trackRate = (res: Response) => {
    const rem = res.headers.get('x-ratelimit-remaining');
    const lim = res.headers.get('x-ratelimit-limit');
    const reset = res.headers.get('x-ratelimit-reset');
    if (rem !== null) rate.remaining = Number(rem);
    if (lim !== null) rate.limit = Number(lim);
    if (reset !== null) rate.resetAt = Number(reset) * 1000;
  };

  async function api<T>(
    path: string,
    o: { accept?: string; allow?: number[]; text?: boolean } = {},
  ): Promise<ApiResult<T | null>> {
    let res: Response;
    try {
      rate.calls++;
      res = await doFetch(`${apiBase}${path}`, {
        headers: headersFor(o.accept ?? 'application/vnd.github+json'),
        signal: opts.signal,
      });
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') throw err;
      throw new GithubError(`Could not reach GitHub (${(err as Error)?.message ?? 'network error'})`, 0, 'network');
    }
    trackRate(res);
    if (o.allow?.includes(res.status)) return { data: null, status: res.status };
    if (res.status === 404) throw new GithubError('Repository not found (or it is private).', 404, 'not_found');
    if (res.status === 403 || res.status === 429) {
      const remaining = res.headers.get('x-ratelimit-remaining');
      const retryAfter = res.headers.get('retry-after');
      if (remaining === '0' || retryAfter || res.status === 429) {
        const resetAt = rate.resetAt ?? (retryAfter ? Date.now() + Number(retryAfter) * 1000 : null);
        throw new GithubError('GitHub API rate limit reached.', res.status, 'rate_limited', resetAt);
      }
      throw new GithubError('GitHub refused the request.', res.status, 'forbidden');
    }
    if (res.status === 451) throw new GithubError('Repository unavailable for legal reasons.', 451, 'forbidden');
    if (!res.ok && res.status !== 204) {
      throw new GithubError(`GitHub API error ${res.status} on ${path}`, res.status, 'other');
    }
    if (res.status === 204) return { data: null, status: 204 };
    const data = (o.text ? await res.text() : await res.json()) as T;
    return { data, status: res.status };
  }

  /** Never let an optional call sink the whole dungeon. */
  async function optional<T>(label: string, fn: () => Promise<T>, fallback: T): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof GithubError && err.code === 'rate_limited') throw err;
      if ((err as Error)?.name === 'AbortError') throw err;
      notes.push(`${label} unavailable.`);
      return fallback;
    }
  }

  // ---------------------------------------------------------------- repo
  progress('Knocking on the dungeon door…');
  const repoPath = `/repos/${encodeURIComponent(ownerIn)}/${encodeURIComponent(nameIn)}`;
  const repoRes = await api<GhRepo>(repoPath);
  const repo = repoRes.data!;
  const owner = repo.owner?.login ?? ownerIn;
  const name = repo.name ?? nameIn;
  const base = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;
  const defaultBranch = repo.default_branch || 'main';

  // ---------------------------------------------------------------- sha
  const shaRes = await api<string>(`${base}/commits/${encodeURIComponent(defaultBranch)}`, {
    accept: 'application/vnd.github.sha',
    text: true,
    allow: [409, 422],
  });
  const sha = (shaRes.data ?? '').trim();
  const emptyRepo = !sha || shaRes.status === 409;

  // ---------------------------------------------------------------- tree + side data in parallel
  progress('Mapping the folders…');
  const treePromise: Promise<{ tree: TreeEntry[]; truncated: boolean }> = emptyRepo
    ? Promise.resolve({ tree: [], truncated: false })
    : fetchTree(sha);

  const languagesPromise = optional('Languages', async () => (await api<Record<string, number>>(`${base}/languages`)).data ?? {}, {});

  const contributorsPromise = optional(
    'Contributors',
    async () => {
      const r = await api<GhContributor[]>(`${base}/contributors?per_page=10`, { allow: [403, 204] });
      if (r.status === 403) {
        notes.push('Contributor list is too large for the GitHub API.');
        return [];
      }
      return (r.data ?? [])
        .filter((c) => c.login && c.type !== 'Bot' && !/\[bot\]$/i.test(c.login))
        .map<Contributor>((c) => ({
          login: c.login!,
          avatarUrl: c.avatar_url ?? null,
          contributions: c.contributions ?? 0,
          url: c.html_url ?? null,
        }));
    },
    [] as Contributor[],
  );

  const issuesPromise = optional<IssueInfo[] | null>(
    'Issues',
    async () => {
      if (!repo.has_issues) return [];
      const per = mode === 'full' ? 30 : 12;
      const r = await api<GhIssue[]>(`${base}/issues?state=open&sort=comments&direction=desc&per_page=${per}`);
      return mapIssues(r.data ?? []);
    },
    null,
  );

  const questsPromise = optional<IssueInfo[] | null>(
    'Quests',
    async () => {
      if (!repo.has_issues) return [];
      const labels = mode === 'full' ? ['good first issue', 'help wanted'] : ['good first issue'];
      const out: IssueInfo[] = [];
      for (const label of labels) {
        const r = await api<GhIssue[]>(`${base}/issues?state=open&labels=${encodeURIComponent(label)}&per_page=8`);
        for (const i of mapIssues(r.data ?? [])) if (!out.some((o) => o.number === i.number)) out.push(i);
      }
      return out.slice(0, 8);
    },
    null,
  );

  const branchesPromise = optional<BranchInfo[] | null>(
    'Branches',
    async () => {
      if (mode !== 'full' || emptyRepo) return null;
      const r = await api<GhBranch[]>(`${base}/branches?per_page=100`);
      const list = (r.data ?? []).filter((b) => b.name !== defaultBranch);
      const sample = list.slice(0, 12);
      const dated = await mapLimit(sample, 4, async (b) => {
        try {
          const c = await api<GhGitCommit>(`${base}/git/commits/${b.commit.sha}`);
          return { name: b.name, lastCommitDate: c.data?.committer?.date ?? c.data?.author?.date ?? null };
        } catch (err) {
          if (err instanceof GithubError && err.code === 'rate_limited') throw err;
          return { name: b.name, lastCommitDate: null };
        }
      });
      return [...dated, ...list.slice(12).map((b) => ({ name: b.name, lastCommitDate: null }))];
    },
    null,
  );

  const { tree, truncated } = await treePromise;

  // ---------------------------------------------------------------- folder commits (guardians)
  const folderCommitsPromise = optional(
    'Commit history',
    async () => {
      if (emptyRepo) return [] as FolderCommit[];
      const folders = mode === 'full' ? topFolders(tree, 6) : [];
      const targets = ['', ...folders];
      const per = mode === 'full' ? 15 : 30;
      const results = await mapLimit(targets, 3, async (folder) => {
        const q = folder ? `&path=${encodeURIComponent(folder)}` : '';
        const r = await api<GhCommit[]>(`${base}/commits?sha=${sha}&per_page=${per}${q}`);
        return (r.data ?? [])
          .filter((c) => c.author?.login)
          .map<FolderCommit>((c) => ({
            folder,
            author: c.author!.login!,
            avatarUrl: c.author!.avatar_url ?? null,
            message: firstLine(c.commit?.message ?? ''),
            date: c.commit?.author?.date ?? null,
          }));
      });
      return results.flat();
    },
    [] as FolderCommit[],
  );

  // ---------------------------------------------------------------- file contents
  progress('Counting the goblins…');
  const maxFiles = opts.privateRepo ? TUNING.scan.privateMaxFiles : TUNING.scan.maxFiles;
  const scanList = selectScanFiles(tree, maxFiles, TUNING.scan.maxBytes);
  const tauntPaths = new Set(scanList.slice(0, 4).map((e) => e.path));
  const readmeEntry = tree.find((e) => isReadmePath(e.path));
  const codeownersEntry = tree.find((e) => isCodeownersPath(e.path));

  const getText = async (path: string): Promise<string | null> => {
    try {
      if (opts.privateRepo) {
        const r = await api<string>(`${base}/contents/${encodePath(path)}?ref=${sha}`, {
          accept: 'application/vnd.github.raw',
          text: true,
        });
        return r.data;
      }
      const res = await doFetch(`${rawBase}/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/${sha}/${encodePath(path)}`, {
        signal: opts.signal,
      });
      if (!res.ok) return null;
      return await res.text();
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') throw err;
      if (err instanceof GithubError && err.code === 'rate_limited') throw err;
      return null;
    }
  };

  const scanned: ScannedFile[] = (
    await mapLimit(scanList, opts.concurrency ?? 6, async (entry) => {
      const text = await getText(entry.path);
      if (text === null || looksBinary(text)) return null;
      return scanContent(entry.path, text, { taunts: tauntPaths.has(entry.path) });
    })
  ).filter((s): s is ScannedFile => s !== null);
  if (scanList.length > 0 && scanned.length === 0) notes.push('Could not read file contents; TODOs are missing.');

  const [readmeRaw, codeowners] = await Promise.all([
    readmeEntry ? getText(readmeEntry.path).then((t) => (t ? t.slice(0, 8000) : null)) : Promise.resolve(null),
    codeownersEntry ? getText(codeownersEntry.path) : Promise.resolve(null),
  ]);

  progress('Waking the boss…');
  const [languages, contributors, issues, quests, branches, folderCommits] = await Promise.all([
    languagesPromise,
    contributorsPromise,
    issuesPromise,
    questsPromise,
    branchesPromise,
    folderCommitsPromise,
  ]);

  const openIssuesCount =
    issues === null ? null : repo.has_issues ? Math.max(issues.length, repo.open_issues_count ?? 0) : 0;
  if (mode === 'lite') notes.push('Generated in your browser with a reduced data budget (no branch history).');

  const snapshot: RepoSnapshot = {
    version: 1,
    source: 'github',
    owner,
    name,
    description: repo.description ?? null,
    homepage: repo.homepage || null,
    htmlUrl: repo.html_url ?? `https://github.com/${owner}/${name}`,
    avatarUrl: repo.owner?.avatar_url ?? null,
    defaultBranch,
    sha: sha || 'empty',
    stars: repo.stargazers_count ?? null,
    forks: repo.forks_count ?? null,
    license: repo.license ? { spdx: repo.license.spdx_id && repo.license.spdx_id !== 'NOASSERTION' ? repo.license.spdx_id : null, name: repo.license.name ?? 'Other' } : null,
    createdAt: repo.created_at ?? null,
    pushedAt: repo.pushed_at ?? null,
    primaryLanguage: repo.language ?? null,
    languages,
    tree,
    treeTruncated: truncated,
    scanned,
    contributors,
    folderCommits,
    branches,
    issues,
    openIssuesCount,
    quests,
    readmeExcerpt: readmeRaw,
    codeowners,
    fetchedAt: now().toISOString(),
    private: !!repo.private,
    notes,
  };
  return { snapshot, rate };

  // ---------------------------------------------------------------- helpers (hoisted)
  async function fetchTree(commitSha: string): Promise<{ tree: TreeEntry[]; truncated: boolean }> {
    const r = await api<GhTree>(`${base}/git/trees/${commitSha}?recursive=1`);
    const data = r.data!;
    if (!data.truncated) {
      return { tree: blobsOf(data.tree, ''), truncated: false };
    }
    // Huge repo: walk the top level and fetch each directory separately.
    const root = (await api<GhTree>(`${base}/git/trees/${commitSha}`)).data!;
    const entries: TreeEntry[] = blobsOf(root.tree, '');
    const dirs = root.tree.filter((e) => e.type === 'tree');
    const limit = mode === 'full' ? 30 : 8;
    let truncatedAny = dirs.length > limit;
    const subtrees = await mapLimit(dirs.slice(0, limit), 4, async (dir) => {
      try {
        const sub = (await api<GhTree>(`${base}/git/trees/${dir.sha}?recursive=1`)).data!;
        if (sub.truncated) truncatedAny = true;
        return blobsOf(sub.tree, `${dir.path}/`);
      } catch (err) {
        if (err instanceof GithubError && err.code === 'rate_limited') throw err;
        truncatedAny = true;
        return [];
      }
    });
    for (const list of subtrees) {
      for (const e of list) {
        if (entries.length >= 150_000) {
          truncatedAny = true;
          break;
        }
        entries.push(e);
      }
    }
    void truncatedAny;
    return { tree: entries, truncated: true };
  }
}

function blobsOf(entries: GhTreeEntry[], prefix: string): TreeEntry[] {
  const out: TreeEntry[] = [];
  for (const e of entries) {
    if (e.type !== 'blob') continue;
    out.push({ path: `${prefix}${e.path}`, size: e.size ?? 0 });
  }
  return out;
}

function mapIssues(items: GhIssue[]): IssueInfo[] {
  return items
    .filter((i) => !i.pull_request)
    .map((i) => ({
      number: i.number,
      title: i.title,
      url: i.html_url,
      labels: (i.labels ?? []).map((l) => (typeof l === 'string' ? l : l.name ?? '')).filter(Boolean),
      comments: i.comments ?? 0,
      createdAt: i.created_at ?? null,
    }));
}

function firstLine(message: string): string {
  const line = message.split('\n')[0].trim();
  return line.length > 100 ? `${line.slice(0, 99)}…` : line;
}

/** Top-level folders with the most files (guardian sampling). */
function topFolders(tree: TreeEntry[], max: number): string[] {
  const counts = new Map<string, number>();
  for (const e of tree) {
    const i = e.path.indexOf('/');
    if (i === -1) continue;
    const top = e.path.slice(0, i);
    if (top.startsWith('.')) continue;
    counts.set(top, (counts.get(top) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, max)
    .map(([k]) => k);
}

/**
 * Choose which files to download for TODO scanning: the biggest real source
 * files first (bosses live there), then the biggest file of every top-level
 * folder so goblins show up everywhere.
 */
export function selectScanFiles(tree: TreeEntry[], maxFiles: number, maxBytes: number): TreeEntry[] {
  const code = tree.filter((e) => {
    const def = languageOf(e.path);
    return (
      def?.code &&
      e.size > 0 &&
      !isBinaryPath(e.path) &&
      !isGeneratedPath(e.path, e.size) &&
      !isPitPath(e.path)
    );
  });
  const bySize = [...code].sort((a, b) => b.size - a.size || a.path.localeCompare(b.path));
  const nonTest = bySize.filter((e) => !isTestPath(e.path));
  const chosen: TreeEntry[] = [];
  const chosenSet = new Set<string>();
  let bytes = 0;
  const take = (e: TreeEntry, cap: number): boolean => {
    if (chosenSet.has(e.path) || chosen.length >= maxFiles) return false;
    if (e.size > cap || bytes + e.size > maxBytes) return false;
    chosen.push(e);
    chosenSet.add(e.path);
    bytes += e.size;
    return true;
  };
  // Boss candidates (allowed to be large).
  for (const e of nonTest.slice(0, 4)) take(e, TUNING.scan.maxBossBytes);
  // Biggest files overall, up to ~60% of the budget.
  for (const e of bySize) {
    if (chosen.length >= Math.floor(maxFiles * 0.6)) break;
    take(e, TUNING.scan.maxFileBytes);
  }
  // Round-robin across top-level folders for variety.
  const byTop = new Map<string, TreeEntry[]>();
  for (const e of bySize) {
    const top = e.path.includes('/') ? e.path.slice(0, e.path.indexOf('/')) : '';
    let list = byTop.get(top);
    if (!list) byTop.set(top, (list = []));
    list.push(e);
  }
  let progressed = true;
  while (chosen.length < maxFiles && progressed) {
    progressed = false;
    for (const list of byTop.values()) {
      while (list.length > 0) {
        const e = list.shift()!;
        if (take(e, TUNING.scan.maxFileBytes)) {
          progressed = true;
          break;
        }
      }
      if (chosen.length >= maxFiles) break;
    }
  }
  return chosen;
}

export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

// --- minimal GitHub response shapes -------------------------------------------

interface GhRepo {
  name?: string;
  owner?: { login?: string; avatar_url?: string };
  description?: string | null;
  homepage?: string | null;
  html_url?: string;
  default_branch?: string;
  stargazers_count?: number;
  forks_count?: number;
  license?: { spdx_id?: string | null; name?: string } | null;
  created_at?: string;
  pushed_at?: string;
  language?: string | null;
  open_issues_count?: number;
  has_issues?: boolean;
  private?: boolean;
}

interface GhTreeEntry {
  path: string;
  type: 'blob' | 'tree' | 'commit';
  sha: string;
  size?: number;
}

interface GhTree {
  sha: string;
  tree: GhTreeEntry[];
  truncated: boolean;
}

interface GhContributor {
  login?: string;
  avatar_url?: string;
  html_url?: string;
  contributions?: number;
  type?: string;
}

interface GhIssue {
  number: number;
  title: string;
  html_url: string;
  labels?: (string | { name?: string })[];
  comments?: number;
  created_at?: string;
  pull_request?: unknown;
}

interface GhBranch {
  name: string;
  commit: { sha: string };
}

interface GhGitCommit {
  author?: { date?: string };
  committer?: { date?: string };
}

interface GhCommit {
  author?: { login?: string; avatar_url?: string } | null;
  commit?: { message?: string; author?: { date?: string } };
}
