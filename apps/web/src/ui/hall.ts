/** Hall of Shame (and Fame), from cached dungeons. */
import { formatNumber, parseRepoInput, type RepoRef } from '@gitcrawl/shared';
import { h, clear } from '../util/dom';
import type { HallData, HallEntry } from '../data/api';
import type { FixtureIndexEntry } from '../data/load';

export function hallFromFixtures(index: FixtureIndexEntry[]): HallData {
  const top = (list: FixtureIndexEntry[], value: (e: FixtureIndexEntry) => number, label: (e: FixtureIndexEntry) => string, desc = true): HallEntry[] =>
    [...list]
      .sort((a, b) => (desc ? value(b) - value(a) : value(a) - value(b)))
      .slice(0, 8)
      .map((e) => ({ fullName: e.fullName, value: value(e), label: label(e) }));
  return {
    biggestBosses: top(index.filter((e) => e.boss), (e) => e.boss!.loc, (e) => `${e.boss!.name}, ${formatNumber(e.boss!.loc)} lines`),
    mostTodos: top(index, (e) => e.todos, (e) => `${formatNumber(e.todos)} TODOs`),
    healthiest: top(index, (e) => e.health, (e) => `${e.health}/100 (${e.grade})`),
    mostCursed: top(index, (e) => e.health, (e) => `${e.health}/100 (${e.grade})`, false),
  };
}

export function renderHall(root: HTMLElement, data: HallData, play: (ref: RepoRef) => void, home: () => void) {
  clear(root);
  const list = (title: string, entries: HallEntry[]) =>
    h(
      'div',
      { class: 'section' },
      h('h2', {}, title),
      h(
        'ul',
        { class: 'panel hall-list' },
        ...(entries.length === 0
          ? [h('li', { class: 'muted' }, 'Nothing here yet.')]
          : entries.map((e) => h('li', {}, h('button', { onclick: () => play(parseRepoInput(e.fullName)!) }, e.fullName), h('span', { class: 'muted' }, e.label)))),
      ),
    );
  root.append(
    h(
      'div',
      { class: 'page-inner' },
      h('div', { class: 'topbar' }, h('button', { class: 'home', onclick: home }, 'gitcrawl')),
      h('h1', { class: 'victory-title' }, 'Hall of Shame'),
      h('p', { class: 'victory-sub' }, 'Every dungeon anyone has entered, ranked by the things maintainers would rather not talk about.'),
      h(
        'div',
        { class: 'hall-cols' },
        list('Biggest bosses', data.biggestBosses),
        list('Most TODOs', data.mostTodos),
        list('Most cursed', data.mostCursed),
        list('Healthiest (Hall of Fame)', data.healthiest),
      ),
    ),
  );
}
