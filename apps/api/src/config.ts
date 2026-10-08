import { resolve } from 'node:path';

export interface AppAuthConfig {
  clientId: string;
  clientSecret: string;
  sessionSecret: string;
  slug: string | null;
}

export interface Config {
  port: number;
  host: string;
  githubToken: string | null;
  cacheDir: string;
  siteUrl: string;
  webDist: string | null;
  corsOrigin: string;
  /** How long a generated public dungeon stays fresh. */
  ttlMs: number;
  /** Uncached generations per IP per hour. */
  generatePerHour: number;
  /** Leaderboard submissions per IP per hour. */
  runsPerHour: number;
  /** Refuse uncached work (and let browsers build it themselves) below this many GitHub calls left. */
  githubReserve: number;
  app: AppAuthConfig | null;
  trustProxy: boolean;
  dailyRepos: string[];
}

export const DEFAULT_DAILY = [
  'facebook/react', 'torvalds/linux', 'vuejs/core', 'microsoft/vscode', 'rust-lang/rust', 'golang/go', 'python/cpython',
  'nodejs/node', 'denoland/deno', 'sveltejs/svelte', 'vercel/next.js', 'tailwindlabs/tailwindcss', 'pallets/flask',
  'django/django', 'rails/rails', 'laravel/framework', 'bitcoin/bitcoin', 'ethereum/go-ethereum', 'neovim/neovim',
  'tmux/tmux', 'junegunn/fzf', 'BurntSushi/ripgrep', 'sharkdp/bat', 'ohmyzsh/ohmyzsh', 'kubernetes/kubernetes',
  'docker/compose', 'redis/redis', 'postgres/postgres', 'sqlite/sqlite', 'godotengine/godot', 'bevyengine/bevy',
  'excalidraw/excalidraw', 'nestjs/nest', 'expressjs/express', 'axios/axios', 'lodash/lodash', 'jquery/jquery',
  'twbs/bootstrap', 'kelseyhightower/nocode', 'microsoft/TypeScript', 'facebook/react-native', 'flutter/flutter',
  'tensorflow/tensorflow', 'pytorch/pytorch', 'huggingface/transformers', 'ollama/ollama', 'zed-industries/zed',
  'astral-sh/uv', 'oven-sh/bun', 'withastro/astro',
];

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const app =
    env.GITHUB_APP_CLIENT_ID && env.GITHUB_APP_CLIENT_SECRET && env.SESSION_SECRET
      ? {
          clientId: env.GITHUB_APP_CLIENT_ID,
          clientSecret: env.GITHUB_APP_CLIENT_SECRET,
          sessionSecret: env.SESSION_SECRET,
          slug: env.GITHUB_APP_SLUG ?? null,
        }
      : null;
  return {
    port: Number(env.PORT ?? 8787),
    host: env.HOST ?? '0.0.0.0',
    githubToken: env.GITHUB_TOKEN || null,
    cacheDir: resolve(env.CACHE_DIR ?? '.cache/gitcrawl'),
    siteUrl: (env.SITE_URL ?? 'http://localhost:8787').replace(/\/$/, ''),
    webDist: env.WEB_DIST === '' ? null : resolve(env.WEB_DIST ?? '../web/dist'),
    corsOrigin: env.CORS_ORIGIN ?? '*',
    ttlMs: Number(env.DUNGEON_TTL_HOURS ?? 24) * 3_600_000,
    generatePerHour: Number(env.GENERATE_PER_HOUR ?? 10),
    runsPerHour: Number(env.RUNS_PER_HOUR ?? 30),
    githubReserve: Number(env.GITHUB_RESERVE ?? 150),
    app,
    trustProxy: env.TRUST_PROXY !== '0',
    dailyRepos: env.DAILY_REPOS ? env.DAILY_REPOS.split(',').map((s) => s.trim()).filter(Boolean) : DEFAULT_DAILY,
  };
}
