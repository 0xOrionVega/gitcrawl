/** Server-side meta tags so shared links unfurl with the dungeon's card. */
import type { DungeonSpec } from '@gitcrawl/shared';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function metaFor(siteUrl: string, path: string, spec: DungeonSpec | null, fallback: { owner: string; name: string } | null): string {
  const url = `${siteUrl}${path}`;
  let title = 'gitcrawl: play any GitHub repo as a dungeon';
  let description = 'Paste a GitHub repo. Fight its TODOs. Slay its biggest file.';
  let image = `${siteUrl}/og/default.png`;
  if (spec) {
    title = `${spec.repo.fullName} as a dungeon: ${spec.title.name}`;
    const boss = spec.boss ? `Boss: ${spec.boss.name} (${spec.boss.loc.toLocaleString('en-US')} lines). ` : '';
    description = `${boss}${spec.stats.todos.toLocaleString('en-US')} TODOs to fight. Dungeon health ${spec.health.score}/100. Can you clear it?`;
    image = `${siteUrl}/og/${spec.repo.owner}/${spec.repo.name}.png`;
  } else if (path === '/editor') {
    title = 'TODO Raid for VS Code and Cursor | gitcrawl';
    description = 'Your TODOs come alive as pixel monsters and hunt your cursor. Fix the TODO to banish it for good.';
    image = `${siteUrl}/media/todo-raid-og.jpg`;
  } else if (fallback) {
    title = `${fallback.owner}/${fallback.name} as a dungeon | gitcrawl`;
    image = `${siteUrl}/og/${fallback.owner}/${fallback.name}.png`;
  }
  return [
    `<title>${esc(title)}</title>`,
    `<meta name="description" content="${esc(description)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:url" content="${esc(url)}" />`,
    `<meta property="og:title" content="${esc(title)}" />`,
    `<meta property="og:description" content="${esc(description)}" />`,
    `<meta property="og:image" content="${esc(image)}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:site" content="@0xOrionVega" />`,
    `<meta name="twitter:creator" content="@0xOrionVega" />`,
    `<meta name="twitter:title" content="${esc(title)}" />`,
    `<meta name="twitter:description" content="${esc(description)}" />`,
    `<meta name="twitter:image" content="${esc(image)}" />`,
  ].join('\n    ');
}

export function injectMeta(indexHtml: string, meta: string): string {
  const withoutTitle = indexHtml.replace(/<title>[\s\S]*?<\/title>\s*/, '');
  return withoutTitle.replace(/<!--gitcrawl:meta-->[\s\S]*?<!--\/gitcrawl:meta-->/, meta);
}
