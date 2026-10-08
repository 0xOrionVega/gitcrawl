/** Small formatting helpers shared by the client, API and report. */

export function formatCount(n: number): string {
  if (!Number.isFinite(n)) return '?';
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${trim(n / 1_000_000)}M`;
  if (abs >= 10_000) return `${trim(n / 1000)}k`;
  return n.toLocaleString('en-US');
}

function trim(v: number): string {
  return (Math.round(v * 10) / 10).toString();
}

export function formatNumber(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${trim(bytes / 1024)} KB`;
  return `${trim(bytes / (1024 * 1024))} MB`;
}

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** "3 years", "5 months", "12 days" */
export function formatAge(days: number): string {
  if (days >= 730) return `${Math.floor(days / 365)} years`;
  if (days >= 365) return '1 year';
  if (days >= 60) return `${Math.floor(days / 30)} months`;
  if (days >= 30) return '1 month';
  if (days === 1) return '1 day';
  return `${Math.max(0, Math.floor(days))} days`;
}

export function daysBetween(fromIso: string, toIso: string): number {
  const a = Date.parse(fromIso);
  const b = Date.parse(toIso);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.floor((b - a) / 86_400_000);
}

export function basename(path: string): string {
  const i = path.lastIndexOf('/');
  return i === -1 ? path : path.slice(i + 1);
}

export function dirname(path: string): string {
  const i = path.lastIndexOf('/');
  return i === -1 ? '' : path.slice(0, i);
}

export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

/** Encode each path segment for use in a URL. */
export function encodePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/');
}

export function blobUrl(htmlUrl: string | null, sha: string, path: string, line?: number): string | null {
  if (!htmlUrl) return null;
  return `${htmlUrl}/blob/${sha}/${encodePath(path)}${line ? `#L${line}` : ''}`;
}

export function treeUrl(htmlUrl: string | null, ref: string, path = ''): string | null {
  if (!htmlUrl) return null;
  return `${htmlUrl}/tree/${encodePath(ref)}${path ? `/${encodePath(path)}` : ''}`;
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${formatNumber(n)} ${n === 1 ? one : many}`;
}
