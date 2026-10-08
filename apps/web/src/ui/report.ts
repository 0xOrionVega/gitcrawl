/** The value layer: everything the dungeon found, linked to the exact file and line. */
import { formatAge, formatNumber, gradeLabel, reportMarkdown, type DungeonSpec } from '@gitcrawl/shared';
import { h, copyText } from '../util/dom';
import { SITE_URL } from '../config';
import { toast } from './toast';

const link = (text: string, url: string | null | undefined) => (url ? h('a', { href: url, target: '_blank', rel: 'noopener' }, text) : h('span', {}, text));

export function renderReport(spec: DungeonSpec): HTMLElement {
  const f = spec.findings;
  const root = h('div', { class: 'report' });

  const health = h(
    'div',
    { class: 'panel health' },
    h('div', { class: `grade ${spec.health.grade}`, 'aria-label': `Grade ${spec.health.grade}` }, spec.health.grade),
    h(
      'div',
      {},
      h('div', { class: 'score' }, `${spec.health.score}/100`),
      h('div', {}, `${gradeLabel(spec.health.grade)} dungeon. ${spec.title.name}.`),
      h('div', { class: 'muted' }, `${formatNumber(spec.stats.files)} files, about ${formatNumber(spec.stats.totalLoc)} lines of code, ${formatNumber(spec.stats.folders)} folders.`),
    ),
  );
  root.append(health);

  const copyBtn = h(
    'button',
    {
      class: 'btn small',
      onclick: async () => {
        const ok = await copyText(reportMarkdown(spec, SITE_URL));
        toast(ok ? 'Report copied as Markdown. Paste it into an issue.' : "Couldn't copy. Your browser blocked the clipboard.", ok ? 'good' : 'bad');
      },
    },
    'Copy report as Markdown',
  );
  root.append(h('div', { class: 'button-row' }, copyBtn));

  if (spec.health.deductions.length > 0) {
    const ul = h('ul', { class: 'items' });
    for (const d of spec.health.deductions) {
      const curse = f.curses.find((c) => c.id === d.id);
      ul.append(h('li', {}, h('span', { class: 'deduction' }, `−${d.points}`), d.label, curse ? h('div', { class: 'where' }, curse.detail) : null));
    }
    root.append(section('Curses and deductions', h('div', { class: 'panel' }, ul)));
  } else {
    root.append(section('Curses and deductions', h('p', {}, 'None. This repo has a license, tests, CI, a README and a contributing guide.')));
  }

  if (f.bigFiles.length > 0) {
    const table = h('table');
    for (const b of f.bigFiles) {
      table.append(h('tr', {}, h('td', {}, link(b.path, b.url)), h('td', { class: 'num' }, `${b.exact ? '' : '~'}${formatNumber(b.loc)}`)));
    }
    root.append(section('Boss files: candidates for splitting', h('div', { class: 'panel' }, table)));
  }

  const goblinTitle = `Goblin log: ${formatNumber(f.todoTotal)} TODO, FIXME and HACK comments in ${formatNumber(f.todoScannedFiles)} scanned files`;
  if (f.todos.length === 0) {
    root.append(section(goblinTitle, h('p', {}, 'No goblins found in the scanned files.')));
  } else {
    const ul = h('ul', { class: 'items' });
    const shown = f.todos.slice(0, 120);
    for (const t of shown) {
      ul.append(
        h(
          'li',
          {},
          h('span', { class: `kind ${t.kind}` }, t.kind),
          t.text || h('span', { class: 'muted' }, 'no description'),
          h('div', { class: 'where' }, link(`${t.path}:${t.line}`, t.url), t.owner ? ` (${t.owner})` : ''),
        ),
      );
    }
    if (f.todos.length > shown.length) ul.append(h('li', { class: 'muted' }, `…and ${formatNumber(f.todoTotal - shown.length)} more. Copy the Markdown report for the full list.`));
    root.append(section(goblinTitle, h('div', { class: 'panel' }, ul)));
  }

  if (f.staleBranches === null) {
    root.append(section('Crypt: stale branches', h('p', { class: 'muted' }, 'Branch history was not collected for this dungeon.')));
  } else if (f.staleBranches.length > 0) {
    const ul = h('ul', { class: 'items' });
    for (const b of f.staleBranches.slice(0, 30)) ul.append(h('li', {}, link(b.name, b.url), h('span', { class: 'where' }, ` last commit ${formatAge(b.daysStale)} ago`)));
    root.append(section(`Crypt: ${f.staleBranches.length} stale branches to review`, h('div', { class: 'panel' }, ul)));
  }

  if (f.quests && f.quests.length > 0) {
    const ul = h('ul', { class: 'items' });
    for (const q of f.quests) ul.append(h('li', {}, link(`#${q.number} ${q.title}`, q.url), h('div', { class: 'where' }, q.labels.join(', '))));
    root.append(section('Quests: good places to start contributing', h('div', { class: 'panel' }, ul)));
  } else if (f.quests === null) {
    root.append(section('Quests', h('p', { class: 'muted' }, 'Issues were not available for this dungeon.')));
  }

  if (f.guardians.length > 0) {
    const ul = h('ul', { class: 'items' });
    for (const g of f.guardians.slice(0, 12)) {
      const who = /\s/.test(g.login) ? g.login : `@${g.login}`;
      ul.append(
        h(
          'li',
          {},
          h('code', {}, `/${g.folder}`),
          ' ',
          /\s/.test(g.login) ? who : link(who, `https://github.com/${g.login}`),
          h('div', { class: 'where' }, g.source === 'codeowners' ? 'from CODEOWNERS' : g.source === 'commits' ? `${formatNumber(g.commits)} recent commits` : 'top contributor'),
        ),
      );
    }
    root.append(section('Guardians: who to ask about each folder', h('div', { class: 'panel' }, ul)));
  }

  if (spec.notes.length > 0) root.append(h('p', { class: 'muted section' }, spec.notes.join(' ')));
  return root;
}

function section(title: string, body: HTMLElement): HTMLElement {
  return h('div', { class: 'section' }, h('h2', {}, title), body);
}
