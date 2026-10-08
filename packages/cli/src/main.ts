/**
 * gitcrawl CLI: play any local git repo as a dungeon. Private code never
 * leaves your machine: the dungeon is generated here and served from
 * localhost with the bundled web client.
 *
 *   npx gitcrawl-cli [path] [--port 4747] [--no-open] [--json out.json]
 */
import { createServer } from 'node:http';
import { existsSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { generateDungeon, formatNumber, type DungeonSpec } from '@gitcrawl/shared';
import { localSnapshot } from './local.js';

interface Args {
  path: string;
  port: number;
  open: boolean;
  json: string | null;
  help: boolean;
}

function parseArgs(argv: string[]): Args {
  const a: Args = { path: '.', port: 4747, open: true, json: null, help: false };
  for (let i = 0; i < argv.length; i++) {
    const v = argv[i];
    if (v === '--help' || v === '-h') a.help = true;
    else if (v === '--port' || v === '-p') a.port = Number(argv[++i]);
    else if (v === '--no-open') a.open = false;
    else if (v === '--json') a.json = argv[++i] ?? 'dungeon.json';
    else if (!v.startsWith('-')) a.path = v;
  }
  return a;
}

const HELP = `gitcrawl: play a git repo as a dungeon

Usage:
  npx gitcrawl-cli [path]            build the dungeon and open it in your browser
  npx gitcrawl-cli [path] --json f   save the dungeon JSON instead
Options:
  --port <n>     local port (default 4747)
  --no-open      don't open the browser
Your code stays on this machine. Nothing is uploaded.`;

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

function webRoot(): string | null {
  const here = dirname(fileURLToPath(import.meta.url));
  for (const candidate of [join(here, 'web'), join(here, '..', 'dist', 'web'), join(here, '..', '..', '..', 'apps', 'web', 'dist')]) {
    if (existsSync(join(candidate, 'index.html'))) return candidate;
  }
  return null;
}

function openBrowser(url: string) {
  const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  try {
    spawn(cmd, args, { stdio: 'ignore', detached: true }).unref();
  } catch {
    /* the URL is printed anyway */
  }
}

function serve(spec: DungeonSpec, root: string, port: number): Promise<string> {
  const index = readFileSync(join(root, 'index.html'), 'utf8');
  const body = JSON.stringify(spec);
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const path = decodeURIComponent(url.pathname);
    if (path === '/local/dungeon.json') {
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(body);
      return;
    }
    if (path.startsWith('/api/') || path.startsWith('/auth/')) {
      // No server features locally; the web client falls back to building other repos in the browser.
      res.writeHead(503, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'Running locally', fallback: 'browser' }));
      return;
    }
    const file = normalize(join(root, path));
    if (file.startsWith(root + sep) && existsSync(file) && statSync(file).isFile()) {
      res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
      res.end(readFileSync(file));
      return;
    }
    res.writeHead(200, { 'content-type': MIME['.html'] });
    res.end(index);
  });
  return new Promise((resolvePromise, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolvePromise(`http://localhost:${port}/local`));
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(HELP);
    return;
  }
  const dir = resolve(args.path);
  const started = Date.now();
  process.stdout.write(`gitcrawl: reading ${dir}\n`);
  const snapshot = await localSnapshot(dir, { onProgress: (s) => process.stdout.write(`  ${s}\n`) });
  const spec = generateDungeon(snapshot);
  const s = spec.stats;
  console.log(
    `\n  ${spec.repo.fullName}: ${spec.title.name}\n  ${formatNumber(s.files)} files, ${spec.rooms.length} rooms, ${formatNumber(s.todos)} TODOs` +
      `${spec.boss ? `, boss ${spec.boss.name} (${formatNumber(spec.boss.loc)} lines)` : ''}\n  Dungeon health ${spec.health.score}/100 (${spec.health.grade})` +
      `  [${((Date.now() - started) / 1000).toFixed(1)}s]\n`,
  );
  if (args.json) {
    writeFileSync(args.json, JSON.stringify(spec, null, 2));
    console.log(`Saved ${args.json}`);
    return;
  }
  const root = webRoot();
  if (!root) {
    const out = 'gitcrawl-dungeon.json';
    writeFileSync(out, JSON.stringify(spec));
    console.log(`The bundled web client is missing, so the dungeon was saved to ${out}.`);
    return;
  }
  let url: string | null = null;
  for (let p = args.port; p < args.port + 10 && !url; p++) {
    try {
      url = await serve(spec, root, p);
    } catch {
      /* port busy, try the next one */
    }
  }
  if (!url) {
    console.error('Could not find a free port.');
    process.exit(1);
  }
  console.log(`Dungeon ready at ${url}\nPress Ctrl+C to stop.`);
  if (args.open) openBrowser(url);
}

main().catch((err) => {
  console.error(`gitcrawl: ${(err as Error).message}`);
  process.exit(1);
});
