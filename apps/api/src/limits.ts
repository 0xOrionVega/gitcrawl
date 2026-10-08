/** Sliding-window counters per key (IP). In memory: fine for one instance. */
export class RateLimiter {
  private hits = new Map<string, number[]>();

  constructor(
    private limit: number,
    private windowMs: number,
  ) {}

  /** Returns true if allowed (and records the hit). */
  take(key: string, now = Date.now()): boolean {
    const list = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (list.length >= this.limit) {
      this.hits.set(key, list);
      return false;
    }
    list.push(now);
    this.hits.set(key, list);
    if (this.hits.size > 50_000) this.sweep(now);
    return true;
  }

  retryAfterMs(key: string, now = Date.now()): number {
    const list = this.hits.get(key) ?? [];
    if (list.length < this.limit) return 0;
    return Math.max(0, this.windowMs - (now - list[0]));
  }

  private sweep(now: number) {
    for (const [k, list] of this.hits) {
      const fresh = list.filter((t) => now - t < this.windowMs);
      if (fresh.length === 0) this.hits.delete(k);
      else this.hits.set(k, fresh);
    }
  }
}
