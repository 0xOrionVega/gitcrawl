/**
 * gitcrawl API + static host.
 *
 *   GET  /api/dungeon/:owner/:repo      cached dungeon (generates on miss)
 *   GET  /api/leaderboard/:owner/:repo  fastest clears
 *   POST /api/runs/:owner/:repo         submit a clear
 *   GET  /api/hall                      Hall of Shame lists
 *   GET  /api/daily                     today's raid
 *   GET  /og/:owner/:repo.png           share card for link previews
 *   GET  /badge/:owner/:repo.svg        README badge
 *   /auth/*, /api/private/*             private repos via a GitHub App (optional)
 *   everything else                     the web app (with per-repo meta tags)
 */
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fetchGithubSnapshot, generateDungeon, parseRepoInput, GithubError, type DungeonSpec, type RepoRef } from '@gitcrawl/shared';
import type { Config } from './config.js';
import { DungeonStore, FileCache, LeaderboardStore, safeKey } from './store.js';
import { Generator } from './generator.js';
import { RateLimiter } from './limits.js';
import { badgeSvg, ogSvg, renderPng } from './og.js';
import { injectMeta, metaFor } from './html.js';
import {
  authorizeUrl,
  checkState,
  clearSessionCookie,
  exchangeCode,
  getSession,
  listPrivateRepos,
  newState,
  revokeToken,
  sessionCookie,
} from './auth.js';

export interface ServerDeps {
  fetchImpl?: typeof fetch;
  now?: () => number;
}

const NICK_RE = /^[\p{L}\p{N} _.\-]{1,16}$/u;

export async function buildServer(cfg: Config, deps: ServerDeps = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: process.env.NODE_ENV === 'test' ? false : { level: 'info' }, trustProxy: cfg.trustProxy });
  const store = new DungeonStore(cfg.cacheDir);
  const boards = new LeaderboardStore(cfg.cacheDir);
  const images = new FileCache(join(cfg.cacheDir, 'og'));
  const gen = new Generator(cfg, store, deps.fetchImpl ?? globalThis.fetch);
  const genLimiter = new RateLimiter(cfg.generatePerHour, 3_600_000);
  const refreshLimiter = new RateLimiter(1, 600_000);
  const runLimiter = new RateLimiter(cfg.runsPerHour, 3_600_000);
  const privateCache = new Map<string, { spec: DungeonSpec; at: number }>();
  const now = deps.now ?? Date.now;

  await app.register(cors, { origin: cfg.corsOrigin === '*' ? true : cfg.corsOrigin.split(','), credentials: cfg.corsOrigin !== '*' });

  const refOf = (req: FastifyRequest): RepoRef | null => {
    const p = req.params as { owner?: string; repo?: string };
    return p.owner && p.repo ? parseRepoInput(`${p.owner}/${p.repo.replace(/\.(png|svg)$/, '')}`) : null;
  };

  // ------------------------------------------------------------------ dungeon
  app.get('/api/health', async () => ({
    ok: true,
    dungeons: store.size(),
    github: { remaining: gen.rate.remaining, resetAt: gen.rate.resetAt, token: !!cfg.githubToken },
  }));

  app.get('/api/dungeon/:owner/:repo', async (req, reply) => {
    const ref = refOf(req);
    if (!ref) return reply.code(400).send({ error: 'Use /api/dungeon/owner/repo.' });
    const q = req.query as { refresh?: string };
    const refresh = q.refresh === '1' && refreshLimiter.take(`${ref.owner}/${ref.name}`.toLowerCase());
    if (!refresh) {
      const hit = gen.cached(ref.owner, ref.name);
      if (hit) {
        store.countPlay(`${ref.owner}/${ref.name}`);
        return reply.header('cache-control', 'public, max-age=300').header('x-gitcrawl-cache', 'hit').send(hit);
      }
    }
    if (!genLimiter.take(req.ip)) {
      return reply
        .code(429)
        .header('retry-after', Math.ceil(genLimiter.retryAfterMs(req.ip) / 1000))
        .send({ error: 'You have built a lot of dungeons this hour. Your browser can build this one itself.', fallback: 'browser' });
    }
    const result = await gen.generate(ref.owner, ref.name);
    if (!result.ok) {
      // A stale copy beats an error.
      const stale = gen.any(ref.owner, ref.name);
      if (stale && result.status >= 500) return reply.header('x-gitcrawl-cache', 'stale').send(stale);
      return reply.code(result.status).send({ error: result.error, fallback: result.fallback, resetAt: result.resetAt ?? null });
    }
    store.countPlay(`${ref.owner}/${ref.name}`);
    return reply.header('cache-control', 'public, max-age=300').header('x-gitcrawl-cache', 'miss').send(result.spec);
  });

  // ------------------------------------------------------------------ leaderboards
  app.get('/api/leaderboard/:owner/:repo', async (req, reply) => {
    const ref = refOf(req);
    if (!ref) return reply.code(400).send({ error: 'Bad repo.' });
    return { entries: boards.get(`${ref.owner}/${ref.name}`) };
  });

  app.post('/api/runs/:owner/:repo', async (req, reply) => {
    const ref = refOf(req);
    if (!ref) return reply.code(400).send({ error: 'Bad repo.' });
    if (!runLimiter.take(req.ip)) return reply.code(429).send({ error: 'Too many submissions. Take a breather.' });
    const body = (req.body ?? {}) as { nickname?: unknown; timeMs?: unknown; goblins?: unknown; deaths?: unknown; seed?: unknown; daily?: unknown };
    const nickname = String(body.nickname ?? '').trim();
    const timeMs = Number(body.timeMs);
    const goblins = Math.max(0, Math.floor(Number(body.goblins) || 0));
    const deaths = Math.max(0, Math.floor(Number(body.deaths) || 0));
    if (!NICK_RE.test(nickname)) return reply.code(400).send({ error: 'Pick a name with 1 to 16 letters, numbers or spaces.' });
    if (!Number.isFinite(timeMs) || timeMs < 8000 || timeMs > 3 * 3_600_000) return reply.code(400).send({ error: "That time doesn't look like a real run." });
    const spec = gen.any(ref.owner, ref.name);
    if (!spec || Number(body.seed) !== spec.seed) return reply.code(409).send({ error: 'This dungeon changed since you played it. Play it again to submit.' });
    const today = new Date(now()).toISOString().slice(0, 10);
    const dailyRepo = dailyFor(today);
    const isDaily = body.daily === true && dailyRepo.toLowerCase() === spec.repo.fullName.toLowerCase();
    const res = boards.add(
      spec.repo.fullName,
      { nickname, timeMs: Math.round(timeMs), goblins, deaths, at: new Date(now()).toISOString() },
      isDaily ? { date: today, repo: spec.repo.fullName } : null,
    );
    return res;
  });

  // ------------------------------------------------------------------ hall & daily
  app.get('/api/hall', async () => {
    const all = store.summaries();
    const top = <T,>(list: T[], f: (x: T) => number, desc = true) => [...list].sort((a, b) => (desc ? f(b) - f(a) : f(a) - f(b))).slice(0, 10);
    return {
      biggestBosses: top(all.filter((s) => s.boss), (s) => s.boss!.loc).map((s) => ({ fullName: s.fullName, value: s.boss!.loc, label: `${s.boss!.name}, ${s.boss!.loc.toLocaleString('en-US')} lines` })),
      mostTodos: top(all, (s) => s.todos).map((s) => ({ fullName: s.fullName, value: s.todos, label: `${s.todos.toLocaleString('en-US')} TODOs` })),
      healthiest: top(all, (s) => s.health).map((s) => ({ fullName: s.fullName, value: s.health, label: `${s.health}/100 (${s.grade})` })),
      mostCursed: top(all, (s) => s.health, false).map((s) => ({ fullName: s.fullName, value: s.health, label: `${s.health}/100 (${s.grade})` })),
      mostPlayed: top(all, (s) => s.plays).map((s) => ({ fullName: s.fullName, value: s.plays, label: `${s.plays.toLocaleString('en-US')} raids` })),
    };
  });

  function dailyFor(date: string): string {
    const day = Math.floor(Date.parse(`${date}T00:00:00Z`) / 86_400_000);
    return cfg.dailyRepos[day % cfg.dailyRepos.length];
  }

  app.get('/api/daily', async () => {
    const date = new Date(now()).toISOString().slice(0, 10);
    const repo = dailyFor(date);
    return { date, repo, leaderboard: boards.getDaily(date)?.entries ?? [] };
  });

  // ------------------------------------------------------------------ images
  app.get('/og/default.png', async (_req, reply) => {
    let png = images.read('default.png');
    if (!png) {
      png = renderPng(ogSvg(null, cfg.siteUrl));
      images.write('default.png', png);
    }
    return reply.type('image/png').header('cache-control', 'public, max-age=86400').send(png);
  });

  app.get('/og/:owner/:repo', async (req, reply) => {
    const ref = refOf(req);
    const spec = ref ? gen.any(ref.owner, ref.name) : null;
    const name = spec ? `${safeKey(spec.repo.fullName)}-${spec.seed}.png` : 'default.png';
    let png = images.read(name);
    if (!png) {
      png = renderPng(ogSvg(spec, cfg.siteUrl));
      images.write(name, png);
      if (spec) images.prune(`${safeKey(spec.repo.fullName)}-`, name);
    }
    return reply.type('image/png').header('cache-control', 'public, max-age=3600').send(png);
  });

  app.get('/badge/:owner/:repo', async (req, reply) => {
    const ref = refOf(req);
    const spec = ref ? gen.any(ref.owner, ref.name) : null;
    return reply.type('image/svg+xml').header('cache-control', 'public, max-age=3600').send(badgeSvg(spec));
  });

  // ------------------------------------------------------------------ private repos (optional)
  const secure = cfg.siteUrl.startsWith('https://');
  app.get('/auth/status', async (req) => {
    if (!cfg.app) return { enabled: false, user: null };
    const s = getSession(req.headers.cookie, cfg.app);
    return { enabled: true, user: s ? { login: s.login, avatarUrl: s.avatarUrl } : null, installUrl: cfg.app.slug ? `https://github.com/apps/${cfg.app.slug}/installations/new` : null };
  });

  if (cfg.app) {
    const appCfg = cfg.app;
    const redirectUri = `${cfg.siteUrl}/auth/callback`;
    app.get('/auth/login', async (_req, reply) => {
      const { state, cookie } = newState(appCfg, secure);
      return reply.header('set-cookie', cookie).redirect(authorizeUrl(appCfg, redirectUri, state));
    });
    app.get('/auth/callback', async (req, reply) => {
      const q = req.query as { code?: string; state?: string };
      if (!q.code || !checkState(req.headers.cookie, q.state ?? '', appCfg)) return reply.code(400).send({ error: 'Login expired. Try connecting again.' });
      try {
        const session = await exchangeCode(appCfg, q.code, redirectUri, deps.fetchImpl ?? fetch);
        return reply.header('set-cookie', sessionCookie(session, appCfg, secure)).redirect('/private');
      } catch (err) {
        return reply.code(502).send({ error: `GitHub login failed: ${(err as Error).message}` });
      }
    });
    app.post('/auth/logout', async (req, reply) => {
      const s = getSession(req.headers.cookie, appCfg);
      if (s) {
        await revokeToken(appCfg, s.token, deps.fetchImpl ?? fetch);
        for (const k of [...privateCache.keys()]) if (k.startsWith(`${s.login}:`)) privateCache.delete(k);
      }
      return reply.header('set-cookie', clearSessionCookie(secure)).send({ ok: true });
    });
    app.get('/api/private/repos', async (req, reply) => {
      const s = getSession(req.headers.cookie, appCfg);
      if (!s) return reply.code(401).send({ error: 'Connect GitHub first.' });
      return { repos: await listPrivateRepos(s.token, deps.fetchImpl ?? fetch) };
    });
    app.get('/api/private/dungeon/:owner/:repo', async (req, reply) => {
      const s = getSession(req.headers.cookie, appCfg);
      if (!s) return reply.code(401).send({ error: 'Connect GitHub first.' });
      const ref = refOf(req);
      if (!ref) return reply.code(400).send({ error: 'Bad repo.' });
      const key = `${s.login}:${ref.owner}/${ref.name}`.toLowerCase();
      reply.header('cache-control', 'private, no-store');
      const hit = privateCache.get(key);
      if (hit && now() - hit.at < 3_600_000) return hit.spec;
      try {
        const { snapshot } = await fetchGithubSnapshot(ref.owner, ref.name, {
          token: s.token,
          mode: 'full',
          privateRepo: true,
          fetchImpl: deps.fetchImpl ?? fetch,
          userAgent: 'gitcrawl-api',
        });
        const spec = generateDungeon(snapshot);
        privateCache.set(key, { spec, at: now() });
        return spec;
      } catch (err) {
        if (err instanceof GithubError && err.code === 'not_found') return reply.code(404).send({ error: 'Not found, or the gitcrawl app is not installed on this repo.' });
        return reply.code(502).send({ error: (err as Error).message });
      }
    });
  }

  // ------------------------------------------------------------------ web app
  if (cfg.webDist && existsSync(join(cfg.webDist, 'index.html'))) {
    const indexHtml = readFileSync(join(cfg.webDist, 'index.html'), 'utf8');
    await app.register(fastifyStatic, { root: cfg.webDist, prefix: '/', index: false, wildcard: false });
    const page = (req: FastifyRequest, reply: FastifyReply) => {
      const url = req.url.split('?')[0];
      const m = /^\/(?:r|report)\/([^/]+)\/([^/]+)/.exec(url);
      const ref = m ? parseRepoInput(`${decodeURIComponent(m[1])}/${decodeURIComponent(m[2])}`) : null;
      const spec = ref ? gen.any(ref.owner, ref.name) : null;
      const html = injectMeta(indexHtml, metaFor(cfg.siteUrl, url, spec, ref));
      return reply.type('text/html').header('cache-control', 'no-cache').send(html);
    };
    app.get('/', page);
    app.setNotFoundHandler((req, reply) => {
      if (req.method !== 'GET' || req.url.startsWith('/api/') || /\.[a-z0-9]{2,5}$/i.test(req.url.split('?')[0])) {
        return reply.code(404).send({ error: 'Not found' });
      }
      return page(req, reply);
    });
  }

  app.addHook('onClose', async () => store.flush());
  return app;
}
