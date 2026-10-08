/** Path routing on the real site, hash routing in the static demo. */
import { parseRepoInput, type RepoRef } from '@gitcrawl/shared';
import { DEMO } from '../config';

export type Route =
  | { name: 'home' }
  | { name: 'play'; ref: RepoRef; explore: boolean; daily: boolean }
  | { name: 'report'; ref: RepoRef }
  | { name: 'vs'; a: RepoRef | null; b: RepoRef | null }
  | { name: 'hall' }
  | { name: 'daily' }
  | { name: 'local' };

const useHash = DEMO || location.protocol === 'file:';

function currentPath(): string {
  if (useHash) return location.hash.replace(/^#/, '').split('?')[0] || '/';
  return location.pathname;
}

function currentQuery(): URLSearchParams {
  if (useHash) return new URLSearchParams(location.hash.split('?')[1] ?? '');
  return new URLSearchParams(location.search);
}

export function parseRoute(): Route {
  const path = decodeURIComponent(currentPath()).replace(/\/+$/, '') || '/';
  const q = currentQuery();
  const parts = path.split('/').filter(Boolean);
  if (parts.length === 0) return { name: 'home' };
  const ref = (o?: string, r?: string) => (o && r ? parseRepoInput(`${o}/${r}`) : null);
  switch (parts[0]) {
    case 'r': {
      const r = ref(parts[1], parts[2]);
      return r ? { name: 'play', ref: r, explore: q.get('mode') === 'explore', daily: q.get('daily') === '1' } : { name: 'home' };
    }
    case 'report': {
      const r = ref(parts[1], parts[2]);
      return r ? { name: 'report', ref: r } : { name: 'home' };
    }
    case 'vs':
      return { name: 'vs', a: ref(parts[1], parts[2]), b: ref(parts[3], parts[4]) };
    case 'hall':
      return { name: 'hall' };
    case 'daily':
      return { name: 'daily' };
    case 'local':
      return { name: 'local' };
    default: {
      // gitcrawl.dev/facebook/react also works.
      const r = ref(parts[0], parts[1]);
      return r ? { name: 'play', ref: r, explore: false, daily: false } : { name: 'home' };
    }
  }
}

export function href(path: string): string {
  return useHash ? `#${path}` : path;
}

export function playPath(ref: RepoRef, opts: { explore?: boolean; daily?: boolean } = {}): string {
  const q = new URLSearchParams();
  if (opts.explore) q.set('mode', 'explore');
  if (opts.daily) q.set('daily', '1');
  const qs = q.toString();
  return `/r/${ref.owner}/${ref.name}${qs ? `?${qs}` : ''}`;
}

const listeners = new Set<() => void>();

export function onRouteChange(fn: () => void) {
  listeners.add(fn);
}

export function navigate(path: string, replace = false) {
  if (useHash) {
    const next = `#${path}`;
    if (location.hash === next) {
      listeners.forEach((fn) => fn());
      return;
    }
    if (replace) history.replaceState(null, '', next);
    else history.pushState(null, '', next);
  } else if (replace) {
    history.replaceState(null, '', path);
  } else {
    history.pushState(null, '', path);
  }
  listeners.forEach((fn) => fn());
}

window.addEventListener('popstate', () => listeners.forEach((fn) => fn()));
if (useHash) window.addEventListener('hashchange', () => listeners.forEach((fn) => fn()));
