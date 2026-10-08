/** Optional server features. Every call fails soft: the game works without the API. */
import type { RepoRef } from '@gitcrawl/shared';
import { API_BASE } from '../config';

export interface LeaderEntry {
  nickname: string;
  timeMs: number;
  goblins: number;
  deaths: number;
  at: string;
}

export interface HallEntry {
  fullName: string;
  value: number;
  label: string;
}

export interface HallData {
  biggestBosses: HallEntry[];
  mostTodos: HallEntry[];
  healthiest: HallEntry[];
  mostCursed: HallEntry[];
}

export interface DailyData {
  date: string;
  repo: string;
  leaderboard: LeaderEntry[];
}

export const apiAvailable = () => API_BASE !== null;

async function get<T>(path: string): Promise<T | null> {
  if (API_BASE === null) return null;
  try {
    const res = await fetch(`${API_BASE}${path}`);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export function getLeaderboard(ref: RepoRef) {
  return get<{ entries: LeaderEntry[] }>(`/api/leaderboard/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.name)}`);
}

export function getHall() {
  return get<HallData>('/api/hall');
}

export function getDaily() {
  return get<DailyData>('/api/daily');
}

export function getAuthStatus() {
  return get<{ enabled: boolean; user: { login: string; avatarUrl: string | null } | null }>('/auth/status');
}

export async function submitRun(
  ref: RepoRef,
  run: { nickname: string; timeMs: number; goblins: number; deaths: number; seed: number; daily: boolean },
): Promise<{ rank: number; entries: LeaderEntry[] } | { error: string } | null> {
  if (API_BASE === null) return null;
  try {
    const res = await fetch(`${API_BASE}/api/runs/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.name)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(run),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) return { error: (body as { error?: string } | null)?.error ?? 'The leaderboard is busy. Try again in a minute.' };
    return body as { rank: number; entries: LeaderEntry[] };
  } catch {
    return { error: "Couldn't reach the leaderboard." };
  }
}
