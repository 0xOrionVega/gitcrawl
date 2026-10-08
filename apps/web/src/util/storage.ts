/** localStorage that never throws (private mode, sandboxed iframes, blocked storage). */
const PREFIX = 'gitcrawl:';
const memory = new Map<string, string>();

export const storage = {
  get(key: string): string | null {
    try {
      const v = window.localStorage.getItem(PREFIX + key);
      if (v !== null) return v;
    } catch {
      /* ignore */
    }
    return memory.get(key) ?? null;
  },
  set(key: string, value: string) {
    memory.set(key, value);
    try {
      window.localStorage.setItem(PREFIX + key, value);
    } catch {
      /* ignore */
    }
  },
};
