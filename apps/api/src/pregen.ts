/**
 * Pre-generate popular dungeons so launch traffic is served from cache:
 *   GITHUB_TOKEN=... pnpm pregen [owner/repo ...]
 */
import { loadConfig, DEFAULT_DAILY } from './config.js';
import { DungeonStore } from './store.js';
import { Generator } from './generator.js';

const TOP = [
  ...DEFAULT_DAILY,
  'freeCodeCamp/freeCodeCamp', 'sindresorhus/awesome', 'public-apis/public-apis', 'codecrafters-io/build-your-own-x',
  'EbookFoundation/free-programming-books', 'kamranahmedse/developer-roadmap', 'donnemartin/system-design-primer',
  'jwasham/coding-interview-university', 'TheAlgorithms/Python', 'trekhleb/javascript-algorithms', 'ossu/computer-science',
  'microsoft/PowerToys', 'microsoft/terminal', 'electron/electron', 'angular/angular', 'nestjs/nest', 'remix-run/react-router',
  'grafana/grafana', 'prometheus/prometheus', 'hashicorp/terraform', 'ansible/ansible', 'home-assistant/core',
  'langchain-ai/langchain', 'openai/openai-python', 'anthropics/anthropic-sdk-python', 'ggerganov/llama.cpp',
  'AUTOMATIC1111/stable-diffusion-webui', 'neovim/neovim', 'vim/vim', 'git/git', 'curl/curl', 'nginx/nginx',
];

const cfg = loadConfig();
if (!cfg.githubToken) {
  console.error('Set GITHUB_TOKEN first (a classic or fine-grained token with public read access).');
  process.exit(1);
}
const store = new DungeonStore(cfg.cacheDir);
const gen = new Generator(cfg, store);
const list = process.argv.slice(2).length > 0 ? process.argv.slice(2) : [...new Set(TOP)];
for (const full of list) {
  const [owner, name] = full.split('/');
  if (gen.cached(owner, name)) {
    console.log(`= ${full} (cached)`);
    continue;
  }
  const t = Date.now();
  const res = await gen.generate(owner, name);
  if (res.ok) {
    console.log(`+ ${full}: ${res.spec.title.name}, boss ${res.spec.boss?.name ?? '-'}, ${res.spec.stats.todos} TODOs (${Date.now() - t} ms, ${gen.rate.remaining} calls left)`);
  } else {
    console.log(`! ${full}: ${res.error}`);
    if (res.status === 503) break;
  }
}
store.flush();
