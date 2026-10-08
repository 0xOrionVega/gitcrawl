/** Victory screen: share card, stats, loot report, README badge, leaderboard. */
import { formatDuration, formatNumber, type DungeonSpec, type RepoRef } from '@gitcrawl/shared';
import { h, clear, copyText } from '../util/dom';
import type { RunStats, WeaponId } from '../game/types';
import { renderShareCard, canvasToBlob, verdictLine } from './sharecard';
import { renderReport } from './report';
import { toast } from './toast';
import { SITE_URL } from '../config';
import { clips } from '../record/clip';
import { apiAvailable, getLeaderboard, submitRun, type LeaderEntry } from '../data/api';
import { storage } from '../util/storage';

export interface EndActions {
  playAgain: () => void;
  explore: () => void;
  home: () => void;
  versus: () => void;
}

const WEAPON_NAMES: Record<WeaponId, string> = { sword: 'Sword', bow: 'Bow', hammer: 'Refactor hammer' };

export function shareText(spec: DungeonSpec, stats: RunStats | null): string {
  const parts: string[] = [];
  if (stats?.bossDefeated && spec.boss) {
    parts.push(`Cleared ${spec.repo.fullName} in ${formatDuration(stats.timeMs)} on gitcrawl.`);
    parts.push(`Beat a ${formatNumber(spec.boss.loc)}-line ${spec.boss.name}, resolved ${stats.goblinsKilled} TODOs.`);
  } else {
    parts.push(`${spec.repo.fullName} as a dungeon: ${spec.title.name}.`);
    parts.push(verdictLine(spec, stats));
  }
  parts.push(`Dungeon health ${spec.health.score}/100.`);
  return parts.join(' ');
}

export function badgeMarkdown(spec: DungeonSpec): string {
  const url = `${SITE_URL}/r/${spec.repo.fullName}`;
  return `[![Play ${spec.repo.fullName} on gitcrawl](${SITE_URL}/badge/${spec.repo.fullName}.svg)](${url})`;
}

export function renderEnd(root: HTMLElement, spec: DungeonSpec, stats: RunStats | null, actions: EndActions, opts: { daily: boolean; ref: RepoRef }) {
  clear(root);
  const won = !!stats?.bossDefeated || (stats !== null && spec.boss === null);
  const link = `${SITE_URL}/r/${spec.repo.fullName}`;
  const inner = h('div', { class: 'page-inner' });
  inner.append(
    h(
      'div',
      { class: 'topbar' },
      h('button', { class: 'home', onclick: actions.home }, 'gitcrawl'),
      h('span', { class: 'muted' }, spec.repo.fullName),
    ),
  );
  const title = won ? (spec.boss ? `${spec.boss.name} is defeated` : 'The throne is yours') : `Report for ${spec.repo.fullName}`;
  inner.append(h('h1', { class: 'victory-title' }, title));
  inner.append(
    h(
      'p',
      { class: 'victory-sub' },
      won && stats ? `You cleared ${spec.repo.fullName} in ${formatDuration(stats.timeMs)}. ${verdictLine(spec, stats)}` : verdictLine(spec, stats),
    ),
  );

  // ---- share card + stats
  const img = h('img', { class: 'card-preview', alt: `Share card for ${spec.repo.fullName}` });
  const cardCol = h('div', {}, img);
  const shareRow = h('div', { class: 'button-row' });
  cardCol.append(shareRow);
  void renderShareCard(spec, stats).then(async (canvas) => {
    img.src = canvas.toDataURL('image/png');
    const blob = await canvasToBlob(canvas);
    const fileName = `gitcrawl-${spec.repo.owner}-${spec.repo.name}.png`;
    const xUrl = `https://x.com/intent/post?text=${encodeURIComponent(shareText(spec, stats))}&url=${encodeURIComponent(link)}`;
    shareRow.append(h('a', { class: 'btn primary', href: xUrl, target: '_blank', rel: 'noopener' }, 'Post on X'));
    if (blob && navigator.canShare?.({ files: [new File([blob], fileName, { type: 'image/png' })] })) {
      shareRow.append(
        h(
          'button',
          {
            class: 'btn',
            onclick: async () => {
              try {
                await navigator.share({ files: [new File([blob], fileName, { type: 'image/png' })], text: shareText(spec, stats), url: link });
              } catch {
                /* cancelled */
              }
            },
          },
          'Share card',
        ),
      );
    }
    if (blob) shareRow.append(h('a', { class: 'btn', href: URL.createObjectURL(blob), download: fileName }, 'Download card'));
    shareRow.append(
      h(
        'button',
        {
          class: 'btn',
          onclick: async () => toast((await copyText(link)) ? 'Link copied.' : "Couldn't copy the link.", 'good'),
        },
        'Copy link',
      ),
    );
    if (clips.last) {
      shareRow.append(h('a', { class: 'btn', href: clips.last.url, download: `gitcrawl-${spec.repo.name}-boss.${clips.last.ext}` }, 'Download boss clip'));
    }
  });

  const dl = h('dl', { class: 'panel stat-list' });
  const add = (k: string, v: string) => dl.append(h('dt', {}, k), h('dd', {}, v));
  if (stats) {
    add('Time', formatDuration(stats.timeMs));
    add('TODOs resolved', `${stats.goblinsKilled} / ${stats.goblinsTotal}`);
    add('Monsters defeated', `${stats.enemiesKilled} / ${stats.enemiesTotal}`);
    add('Rooms explored', `${stats.roomsVisited} / ${stats.roomsTotal}`);
    add('Deaths', String(stats.deaths));
    add('Crates smashed', String(stats.cratesBroken));
    add('Chests opened', String(stats.chestsOpened));
    if (stats.questsTotal > 0) add('Quests found', `${stats.questsFound} / ${stats.questsTotal}`);
    if (stats.treasure !== null) add('Treasure', `${formatNumber(stats.treasure)} stars`);
    const fav = (Object.entries(stats.weaponUse) as [WeaponId, number][]).sort((a, b) => b[1] - a[1])[0];
    if (fav && fav[1] > 0) add('Favorite weapon', WEAPON_NAMES[fav[0]]);
    if (stats.pitFalls > 0) add('Fell into node_modules', `${stats.pitFalls}×`);
  } else {
    add('Files', formatNumber(spec.stats.files));
    add('TODOs', formatNumber(spec.stats.todos));
    add('Rooms', String(spec.rooms.length));
    if (spec.boss) add('Boss', `${spec.boss.name} (${formatNumber(spec.boss.loc)} lines)`);
  }
  const statCol = h('div', {}, dl);
  const playRow = h(
    'div',
    { class: 'button-row' },
    h('button', { class: 'btn primary', onclick: actions.playAgain }, won ? 'Play again' : 'Enter the dungeon'),
    h('button', { class: 'btn', onclick: actions.explore }, 'Explore without monsters'),
    h('button', { class: 'btn', onclick: actions.versus }, 'Compare with another repo'),
    h('button', { class: 'btn ghost', onclick: actions.home }, 'Try another repo'),
  );
  statCol.append(playRow);

  // ---- leaderboard
  if (apiAvailable() && stats && won) {
    const list = h('ol');
    const nick = h('input', { maxlength: 16, placeholder: 'Your name for the leaderboard', 'aria-label': 'Nickname' }) as HTMLInputElement;
    nick.value = storage.get('nickname') ?? '';
    const form = h(
      'form',
      {
        onsubmit: async (ev: Event) => {
          ev.preventDefault();
          const name = nick.value.trim();
          if (!name) {
            nick.focus();
            return;
          }
          storage.set('nickname', name);
          const res = await submitRun(opts.ref, { nickname: name, timeMs: stats.timeMs, goblins: stats.goblinsKilled, deaths: stats.deaths, seed: spec.seed, daily: opts.daily });
          if (!res) return;
          if ('error' in res) {
            toast(res.error, 'bad');
            return;
          }
          toast(`You're #${res.rank} on this repo's leaderboard.`, 'gold');
          fillBoard(list, res.entries);
          form.remove();
        },
      },
      nick,
      h('button', { class: 'btn small primary', type: 'submit' }, 'Submit time'),
    );
    const board = h('div', { class: 'panel leader section' }, h('h2', {}, opts.daily ? "Today's raid" : 'Fastest clears'), form, list);
    statCol.append(board);
    void getLeaderboard(opts.ref).then((r) => r && fillBoard(list, r.entries));
  }

  inner.append(h('div', { class: 'end-grid' }, cardCol, statCol));

  // ---- badge
  const md = badgeMarkdown(spec);
  inner.append(
    h(
      'div',
      { class: 'section' },
      h('h2', {}, 'Put this dungeon in your README'),
      h(
        'div',
        { class: 'panel badge-box' },
        h('p', {}, 'Visitors can play your repo straight from the badge. It shows your dungeon health.'),
        h('code', {}, md),
        h('div', {}, h('button', { class: 'btn small', onclick: async () => toast((await copyText(md)) ? 'Badge Markdown copied.' : "Couldn't copy.", 'good') }, 'Copy badge Markdown')),
      ),
    ),
  );

  // ---- report
  inner.append(h('div', { class: 'section' }, h('h2', {}, 'Loot report'), renderReport(spec)));
  root.append(inner);
  root.scrollTop = 0;
}

function fillBoard(list: HTMLElement, entries: LeaderEntry[]) {
  clear(list);
  if (entries.length === 0) {
    list.append(h('li', { class: 'muted' }, 'No times yet. Be the first.'));
    return;
  }
  for (const e of entries.slice(0, 10)) {
    list.append(h('li', {}, h('span', {}, e.nickname), h('span', { class: 'muted' }, `${formatDuration(e.timeMs)}${e.deaths ? `, ${e.deaths} deaths` : ''}`)));
  }
}
