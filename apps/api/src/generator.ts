/** Fetch + generate with caching, request de-duplication and GitHub budget awareness. */
import { fetchGithubSnapshot, generateDungeon, GithubError, type DungeonSpec, type RateInfo } from '@gitcrawl/shared';
import type { Config } from './config.js';
import type { DungeonStore } from './store.js';

export type GenerateResult =
  | { ok: true; spec: DungeonSpec; cached: boolean }
  | { ok: false; status: number; error: string; fallback?: 'browser'; resetAt?: number | null };

export class Generator {
  private inflight = new Map<string, Promise<DungeonSpec>>();
  rate: RateInfo = { remaining: null, limit: null, resetAt: null, calls: 0 };

  constructor(
    private cfg: Config,
    private store: DungeonStore,
    private fetchImpl: typeof fetch = globalThis.fetch,
  ) {}

  cached(owner: string, name: string, maxAgeMs = this.cfg.ttlMs): DungeonSpec | null {
    const hit = this.store.get(`${owner}/${name}`);
    if (!hit) return null;
    if (Date.now() - hit.storedAt > maxAgeMs) return null;
    return hit.spec;
  }

  /** Anything cached, even stale (for images and badges). */
  any(owner: string, name: string): DungeonSpec | null {
    return this.store.get(`${owner}/${name}`)?.spec ?? null;
  }

  budgetLow(): boolean {
    if (this.rate.remaining === null) return false;
    if (this.rate.resetAt !== null && Date.now() > this.rate.resetAt) return false;
    return this.rate.remaining < this.cfg.githubReserve;
  }

  async generate(owner: string, name: string): Promise<GenerateResult> {
    const key = `${owner}/${name}`.toLowerCase();
    if (this.budgetLow()) {
      return { ok: false, status: 503, error: 'The dungeon master is out of GitHub budget for now.', fallback: 'browser', resetAt: this.rate.resetAt };
    }
    let job = this.inflight.get(key);
    if (!job) {
      job = (async () => {
        const { snapshot, rate } = await fetchGithubSnapshot(owner, name, {
          token: this.cfg.githubToken,
          mode: this.cfg.githubToken ? 'full' : 'lite',
          fetchImpl: this.fetchImpl,
          userAgent: 'gitcrawl-api',
        });
        this.mergeRate(rate);
        const spec = generateDungeon(snapshot);
        this.store.set(`${spec.repo.owner}/${spec.repo.name}`, spec);
        if (key !== `${spec.repo.owner}/${spec.repo.name}`.toLowerCase()) this.store.set(key, spec);
        return spec;
      })();
      this.inflight.set(key, job);
      job.finally(() => this.inflight.delete(key)).catch(() => undefined);
    }
    try {
      return { ok: true, spec: await job, cached: false };
    } catch (err) {
      if (err instanceof GithubError) {
        if (err.code === 'not_found') return { ok: false, status: 404, error: 'Repository not found (or it is private).' };
        if (err.code === 'rate_limited') {
          this.rate.remaining = 0;
          this.rate.resetAt = err.resetAt;
          return { ok: false, status: 503, error: 'GitHub rate limit reached.', fallback: 'browser', resetAt: err.resetAt };
        }
        if (err.code === 'forbidden') return { ok: false, status: 403, error: 'GitHub refused access to this repository.' };
        return { ok: false, status: 502, error: err.message, fallback: 'browser' };
      }
      return { ok: false, status: 500, error: (err as Error).message };
    }
  }

  private mergeRate(rate: RateInfo) {
    if (rate.remaining !== null) this.rate.remaining = rate.remaining;
    if (rate.limit !== null) this.rate.limit = rate.limit;
    if (rate.resetAt !== null) this.rate.resetAt = rate.resetAt;
    this.rate.calls += rate.calls;
  }
}
