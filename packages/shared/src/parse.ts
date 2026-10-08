/** Parse what people paste into the box: "owner/repo", GitHub URLs, SSH remotes. */

export interface RepoRef {
  owner: string;
  name: string;
}

const OWNER_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const NAME_RE = /^[A-Za-z0-9._-]{1,100}$/;

export function parseRepoInput(input: string): RepoRef | null {
  let s = input.trim();
  if (!s) return null;
  s = s.replace(/^git\+/, '');
  // git@github.com:owner/repo.git
  const ssh = /^git@github\.com:([^/]+)\/([^/#?]+?)(?:\.git)?\/?$/i.exec(s);
  if (ssh) return validate(ssh[1], ssh[2]);
  s = s.replace(/^(https?:\/\/)?(www\.)?github\.com\//i, '');
  s = s.replace(/^(https?:\/\/)?(www\.)?gitcrawl\.[a-z.]+\/(r\/)?/i, '');
  s = s.split(/[?#]/)[0];
  const parts = s.split('/').filter(Boolean);
  if (parts.length < 2) return null;
  return validate(parts[0], parts[1].replace(/\.git$/i, ''));
}

function validate(owner: string, name: string): RepoRef | null {
  if (!OWNER_RE.test(owner)) return null;
  if (!NAME_RE.test(name) || name === '.' || name === '..') return null;
  return { owner, name };
}

export function repoKey(ref: RepoRef): string {
  return `${ref.owner.toLowerCase()}/${ref.name.toLowerCase()}`;
}
