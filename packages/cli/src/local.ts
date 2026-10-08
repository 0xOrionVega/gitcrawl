/**
 * RepoSnapshot from a local git checkout. Everything runs on this machine:
 * no network calls, no uploads. Used by the CLI (private repos) and by the
 * fixture script that builds the demo dungeons.
 */
import { spawn } from 'node:child_process';
import type { BranchInfo, Contributor, FolderCommit, RepoSnapshot, ScannedFile, SnapshotSource, TreeEntry } from '@gitcrawl/shared';
import {
  detectLicense,
  isCodeownersPath,
  isLicensePath,
  isReadmePath,
  looksBinary,
  parseRepoInput,
  scanContent,
  selectScanFiles,
} from '@gitcrawl/shared';

export interface LocalOptions {
  /** Override owner/name (otherwise taken from the GitHub remote or the folder name). */
  owner?: string;
  name?: string;
  maxScanFiles?: number;
  maxScanBytes?: number;
  /** Commits to sample for guardians (folder owners). */
  historyDepth?: number;
  source?: SnapshotSource;
  onProgress?: (step: string) => void;
  now?: () => Date;
}

export function git(cwd: string, args: string[], opts: { input?: string; maxBuffer?: number } = {}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn('git', args, { cwd, stdio: ['pipe', 'pipe', 'pipe'] });
    const chunks: Buffer[] = [];
    const errChunks: Buffer[] = [];
    let size = 0;
    child.stdout.on('data', (c: Buffer) => {
      size += c.length;
      if (opts.maxBuffer && size > opts.maxBuffer) {
        child.kill();
        reject(new Error(`git ${args[0]}: output too large`));
        return;
      }
      chunks.push(c);
    });
    child.stderr.on('data', (c: Buffer) => errChunks.push(c));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve(Buffer.concat(chunks));
      else reject(new Error(`git ${args.join(' ')} failed (${code}): ${Buffer.concat(errChunks).toString().trim()}`));
    });
    if (opts.input !== undefined) child.stdin.end(opts.input);
    else child.stdin.end();
  });
}

const gitText = async (cwd: string, args: string[]) => (await git(cwd, args)).toString('utf8').trim();
const gitTry = async (cwd: string, args: string[]) => {
  try {
    return await gitText(cwd, args);
  } catch {
    return '';
  }
};

/** Read many blobs in one `git cat-file --batch` call. */
async function readBlobs(cwd: string, shas: string[]): Promise<Map<string, Buffer>> {
  const out = new Map<string, Buffer>();
  if (shas.length === 0) return out;
  const buf = await git(cwd, ['cat-file', '--batch'], { input: `${shas.join('\n')}\n` });
  let pos = 0;
  for (const sha of shas) {
    const nl = buf.indexOf(10, pos);
    if (nl === -1) break;
    const header = buf.subarray(pos, nl).toString('utf8');
    pos = nl + 1;
    const parts = header.split(' ');
    if (parts[1] === 'missing') continue;
    const size = Number(parts[2]);
    out.set(sha, buf.subarray(pos, pos + size));
    pos += size + 1; // trailing LF
  }
  return out;
}

function loginFromEmail(email: string): string | null {
  const m = /^(?:\d+\+)?([A-Za-z0-9-]+)@users\.noreply\.github\.com$/i.exec(email);
  return m ? m[1] : null;
}

export async function localSnapshot(dir: string, opts: LocalOptions = {}): Promise<RepoSnapshot> {
  const progress = opts.onProgress ?? (() => {});
  const now = opts.now ?? (() => new Date());
  const notes: string[] = [];

  progress('Reading the repository…');
  const root = await gitText(dir, ['rev-parse', '--show-toplevel']);
  const sha = await gitText(root, ['rev-parse', 'HEAD']);
  const current = await gitTry(root, ['rev-parse', '--abbrev-ref', 'HEAD']);
  const originHead = (await gitTry(root, ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'])).replace(/^origin\//, '');
  const defaultBranch = originHead || (current && current !== 'HEAD' ? current : 'main');
  const remote = await gitTry(root, ['config', '--get', 'remote.origin.url']);
  const ghRef = remote ? parseRepoInput(remote) : null;
  const folderName = root.split(/[\\/]/).pop() || 'repo';
  const owner = opts.owner ?? ghRef?.owner ?? 'local';
  const name = opts.name ?? ghRef?.name ?? folderName;
  const htmlUrl = ghRef ? `https://github.com/${ghRef.owner}/${ghRef.name}` : null;

  // ---------------------------------------------------------------- tree
  progress('Mapping the folders…');
  const lsTree = (await git(root, ['ls-tree', '-r', '-l', '-z', 'HEAD'], { maxBuffer: 512 * 1024 * 1024 })).toString('utf8');
  const tree: TreeEntry[] = [];
  const shaByPath = new Map<string, string>();
  for (const rec of lsTree.split('\0')) {
    if (!rec) continue;
    const tab = rec.indexOf('\t');
    const meta = rec.slice(0, tab).split(/\s+/);
    const path = rec.slice(tab + 1);
    if (meta[1] !== 'blob') continue;
    const size = Number(meta[3]);
    tree.push({ path, size: Number.isFinite(size) ? size : 0 });
    shaByPath.set(path, meta[2]);
  }

  // ---------------------------------------------------------------- contents
  progress('Counting the goblins…');
  const scanList = selectScanFiles(tree, opts.maxScanFiles ?? 300, opts.maxScanBytes ?? 30_000_000);
  const tauntPaths = new Set(scanList.slice(0, 4).map((e) => e.path));
  const extra = tree.filter((e) => e.path.split('/').length === 1 && (isReadmePath(e.path) || isLicensePath(e.path)));
  const codeowners = tree.find((e) => isCodeownersPath(e.path));
  const wanted = [...scanList, ...extra, ...(codeowners ? [codeowners] : [])];
  const blobs = await readBlobs(root, [...new Set(wanted.map((e) => shaByPath.get(e.path)!))]);
  const textOf = (path: string): string | null => {
    const b = blobs.get(shaByPath.get(path) ?? '');
    if (!b) return null;
    const t = b.toString('utf8');
    return looksBinary(t) ? null : t;
  };
  const scanned: ScannedFile[] = [];
  for (const e of scanList) {
    const t = textOf(e.path);
    if (t !== null) scanned.push(scanContent(e.path, t, { taunts: tauntPaths.has(e.path) }));
  }
  const readmeEntry = extra.find((e) => isReadmePath(e.path));
  const licenseEntry = extra.find((e) => isLicensePath(e.path));
  const readmeExcerpt = readmeEntry ? (textOf(readmeEntry.path) ?? '').slice(0, 8000) : null;
  const license = licenseEntry ? detectLicense(textOf(licenseEntry.path) ?? '') : null;

  // ---------------------------------------------------------------- history
  progress('Asking the guardians…');
  const depth = opts.historyDepth ?? 400;
  const log = await gitTry(root, [
    'log',
    `-n${depth}`,
    '--no-merges',
    '--no-renames',
    '--format=%x1e%an%x1f%ae%x1f%cI%x1f%s',
    '--name-only',
    'HEAD',
  ]);
  const authorStats = new Map<string, { name: string; login: string | null; commits: number }>();
  const folderAgg = new Map<string, Map<string, { n: number; msg: string; date: string; login: string | null }>>();
  for (const block of log.split('\x1e')) {
    if (!block.trim()) continue;
    const [headerLine, ...fileLines] = block.split('\n');
    const [an, ae, date, subject] = headerLine.split('\x1f');
    if (!an || /\[bot\]|dependabot|renovate|github-actions/i.test(`${an} ${ae}`)) continue;
    const login = loginFromEmail(ae ?? '');
    const id = login ?? an;
    const stat = authorStats.get(id) ?? { name: an, login, commits: 0 };
    stat.commits++;
    authorStats.set(id, stat);
    const folders = new Set<string>();
    for (const f of fileLines) {
      const file = f.trim();
      if (!file) continue;
      const parts = file.split('/');
      if (parts.length > 1) folders.add(parts[0]);
      if (parts.length > 2) folders.add(`${parts[0]}/${parts[1]}`);
    }
    folders.add('');
    for (const folder of folders) {
      let m = folderAgg.get(folder);
      if (!m) folderAgg.set(folder, (m = new Map()));
      const cur = m.get(id);
      if (cur) cur.n++;
      else m.set(id, { n: 1, msg: subject ?? '', date: date ?? '', login });
    }
  }
  const avatarFor = (login: string | null) => (login ? `https://github.com/${login}.png?size=80` : null);
  const contributors: Contributor[] = [...authorStats.entries()]
    .sort((a, b) => b[1].commits - a[1].commits)
    .slice(0, 10)
    .map(([id, s]) => ({
      login: s.login ?? s.name ?? id,
      avatarUrl: avatarFor(s.login),
      contributions: s.commits,
      url: s.login ? `https://github.com/${s.login}` : null,
    }));
  const folderCommits: FolderCommit[] = [];
  for (const [folder, authors] of folderAgg) {
    const top = [...authors.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 2);
    for (const [id, a] of top) {
      folderCommits.push({
        folder,
        author: a.login ?? authorStats.get(id)?.name ?? id,
        avatarUrl: avatarFor(a.login),
        message: a.msg.length > 100 ? `${a.msg.slice(0, 99)}…` : a.msg,
        date: a.date || null,
        count: a.n,
      });
    }
  }
  const pushedAt = (await gitTry(root, ['log', '-1', '--format=%cI', 'HEAD'])) || null;
  const firstCommit = (await gitTry(root, ['log', '--max-parents=0', '--format=%cI', 'HEAD'])).split('\n').pop() || null;
  const shallow = (await gitTry(root, ['rev-parse', '--is-shallow-repository'])) === 'true';
  if (shallow) notes.push('History is shallow, so guardians are based on recent commits only.');

  // ---------------------------------------------------------------- branches
  const refs = await gitTry(root, [
    'for-each-ref',
    '--format=%(refname:short)%09%(committerdate:iso-strict)',
    'refs/heads',
    'refs/remotes/origin',
  ]);
  const branchMap = new Map<string, string | null>();
  for (const line of refs.split('\n')) {
    if (!line.trim()) continue;
    const [ref, date] = line.split('\t');
    if (!ref || ref === 'origin' || ref.endsWith('/HEAD')) continue;
    const b = ref.replace(/^origin\//, '');
    if (!branchMap.has(b) || (date && (branchMap.get(b) ?? '') < date)) branchMap.set(b, date || null);
  }
  const branches: BranchInfo[] = [...branchMap.entries()].map(([b, d]) => ({ name: b, lastCommitDate: d }));

  notes.push('Issues and quests come from GitHub, so they are not shown for local repos.');

  return {
    version: 1,
    source: opts.source ?? 'local',
    owner,
    name,
    description: null,
    homepage: null,
    htmlUrl,
    avatarUrl: ghRef ? `https://github.com/${ghRef.owner}.png?size=120` : null,
    defaultBranch,
    sha,
    stars: null,
    forks: null,
    license,
    createdAt: firstCommit,
    pushedAt,
    primaryLanguage: null,
    languages: {},
    tree,
    treeTruncated: false,
    scanned,
    contributors,
    folderCommits,
    branches,
    issues: null,
    openIssuesCount: null,
    quests: null,
    readmeExcerpt,
    codeowners: codeowners ? textOf(codeowners.path) : null,
    fetchedAt: now().toISOString(),
    private: false,
    notes,
  };
}
