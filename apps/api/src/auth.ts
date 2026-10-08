/**
 * Private repos via a GitHub App (user-to-server OAuth flow).
 *
 * The user installs the App on the repos they choose, with read-only
 * permissions (Contents, Metadata, Issues, Pull requests). Their user token is
 * kept only inside an encrypted, HttpOnly cookie: nothing is stored server-side,
 * and private dungeons are cached in memory per user for one hour.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { AppAuthConfig } from './config.js';

export interface Session {
  token: string;
  login: string;
  avatarUrl: string | null;
  exp: number;
}

const COOKIE = 'gc_session';
const STATE_COOKIE = 'gc_state';

function key(secret: string): Buffer {
  return createHash('sha256').update(secret).digest();
}

export function seal(data: unknown, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(secret), iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(data), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, body]).toString('base64url');
}

export function unseal<T>(value: string, secret: string): T | null {
  try {
    const raw = Buffer.from(value, 'base64url');
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const body = raw.subarray(28);
    const decipher = createDecipheriv('aes-256-gcm', key(secret), iv);
    decipher.setAuthTag(tag);
    const text = Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8');
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i === -1) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function cookie(name: string, value: string, maxAgeSec: number, secure: boolean): string {
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${secure ? '; Secure' : ''}`;
}

export function getSession(cookieHeader: string | undefined, app: AppAuthConfig): Session | null {
  const raw = parseCookies(cookieHeader)[COOKIE];
  if (!raw) return null;
  const s = unseal<Session>(raw, app.sessionSecret);
  if (!s || s.exp < Date.now()) return null;
  return s;
}

export function sessionCookie(s: Session, app: AppAuthConfig, secure: boolean): string {
  return cookie(COOKIE, seal(s, app.sessionSecret), Math.floor((s.exp - Date.now()) / 1000), secure);
}

export function clearSessionCookie(secure: boolean): string {
  return cookie(COOKIE, '', 0, secure);
}

export function newState(app: AppAuthConfig, secure: boolean): { state: string; cookie: string } {
  const state = randomBytes(16).toString('base64url');
  return { state, cookie: cookie(STATE_COOKIE, seal({ state, exp: Date.now() + 600_000 }, app.sessionSecret), 600, secure) };
}

export function checkState(cookieHeader: string | undefined, state: string, app: AppAuthConfig): boolean {
  const raw = parseCookies(cookieHeader)[STATE_COOKIE];
  if (!raw || !state) return false;
  const v = unseal<{ state: string; exp: number }>(raw, app.sessionSecret);
  if (!v || v.exp < Date.now()) return false;
  const a = Buffer.from(v.state);
  const b = Buffer.from(state);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function authorizeUrl(app: AppAuthConfig, redirectUri: string, state: string): string {
  const q = new URLSearchParams({ client_id: app.clientId, redirect_uri: redirectUri, state });
  return `https://github.com/login/oauth/authorize?${q.toString()}`;
}

export async function exchangeCode(app: AppAuthConfig, code: string, redirectUri: string, fetchImpl: typeof fetch = fetch) {
  const res = await fetchImpl('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'User-Agent': 'gitcrawl-api' },
    body: JSON.stringify({ client_id: app.clientId, client_secret: app.clientSecret, code, redirect_uri: redirectUri }),
  });
  const body = (await res.json()) as { access_token?: string; expires_in?: number; error?: string };
  if (!body.access_token) throw new Error(body.error ?? 'GitHub did not return a token');
  const user = await fetchImpl('https://api.github.com/user', {
    headers: { Authorization: `Bearer ${body.access_token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'gitcrawl-api' },
  });
  const u = (await user.json()) as { login?: string; avatar_url?: string };
  const ttl = Math.min((body.expires_in ?? 8 * 3600) * 1000, 8 * 3600 * 1000);
  return { token: body.access_token, login: u.login ?? 'unknown', avatarUrl: u.avatar_url ?? null, exp: Date.now() + ttl } satisfies Session;
}

export async function revokeToken(app: AppAuthConfig, token: string, fetchImpl: typeof fetch = fetch) {
  const basic = Buffer.from(`${app.clientId}:${app.clientSecret}`).toString('base64');
  await fetchImpl(`https://api.github.com/applications/${app.clientId}/token`, {
    method: 'DELETE',
    headers: { Authorization: `Basic ${basic}`, Accept: 'application/vnd.github+json', 'User-Agent': 'gitcrawl-api', 'Content-Type': 'application/json' },
    body: JSON.stringify({ access_token: token }),
  }).catch(() => undefined);
}

/** Repos the user granted the App access to. */
export async function listPrivateRepos(token: string, fetchImpl: typeof fetch = fetch): Promise<{ fullName: string; private: boolean }[]> {
  const h = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'gitcrawl-api' };
  const inst = (await (await fetchImpl('https://api.github.com/user/installations?per_page=20', { headers: h })).json()) as {
    installations?: { id: number }[];
  };
  const out: { fullName: string; private: boolean }[] = [];
  for (const i of inst.installations ?? []) {
    const r = (await (await fetchImpl(`https://api.github.com/user/installations/${i.id}/repositories?per_page=100`, { headers: h })).json()) as {
      repositories?: { full_name: string; private: boolean }[];
    };
    for (const repo of r.repositories ?? []) out.push({ fullName: repo.full_name, private: repo.private });
  }
  return out;
}
