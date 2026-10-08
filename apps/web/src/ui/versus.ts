/** Versus: two repos side by side. "My utils.js is bigger than yours." */
import { formatNumber, parseRepoInput, type DungeonSpec, type RepoRef } from '@gitcrawl/shared';
import { h, clear, copyText } from '../util/dom';
import { toast } from './toast';
import { SITE_URL, OWNER_X } from '../config';

export interface VersusActions {
  compare: (a: RepoRef, b: RepoRef) => void;
  play: (ref: RepoRef) => void;
  home: () => void;
}

export function renderVersusForm(root: HTMLElement, a: VersusActions, preset: { a?: RepoRef | null; b?: RepoRef | null } = {}) {
  clear(root);
  const inA = h('input', { class: 'repo-input', placeholder: 'your/repo', 'aria-label': 'First repository' }) as HTMLInputElement;
  const inB = h('input', { class: 'repo-input', placeholder: 'facebook/react', 'aria-label': 'Second repository' }) as HTMLInputElement;
  if (preset.a) inA.value = `${preset.a.owner}/${preset.a.name}`;
  if (preset.b) inB.value = `${preset.b.owner}/${preset.b.name}`;
  const err = h('p', { class: 'form-error', role: 'alert' });
  const form = h(
    'form',
    {
      class: 'vs-form',
      onsubmit: (ev: Event) => {
        ev.preventDefault();
        const ra = parseRepoInput(inA.value);
        const rb = parseRepoInput(inB.value || 'facebook/react');
        if (!ra || !rb) {
          err.textContent = 'Use owner/repo for both, like vuejs/core.';
          return;
        }
        a.compare(ra, rb);
      },
    },
    inA,
    h('span', { class: 'vs-mid' }, 'vs'),
    inB,
    h('button', { class: 'btn primary', type: 'submit' }, 'Compare'),
  );
  root.append(
    h(
      'div',
      { class: 'page-inner' },
      h('div', { class: 'topbar' }, h('button', { class: 'home', onclick: a.home }, 'gitcrawl')),
      h('h1', { class: 'victory-title' }, 'Versus'),
      h('p', { class: 'victory-sub' }, 'Two repos, one arena. Whose boss is bigger, whose goblins are louder.'),
      form,
      err,
    ),
  );
  if (!preset.a) inA.focus();
}

interface Metric {
  label: string;
  value: (s: DungeonSpec) => number;
  format?: (n: number) => string;
  higherWins: boolean;
}

const METRICS: Metric[] = [
  { label: 'Dungeon health', value: (s) => s.health.score, higherWins: true },
  { label: 'Boss size (lines)', value: (s) => s.boss?.loc ?? 0, higherWins: false },
  { label: 'TODOs found', value: (s) => s.stats.todos, higherWins: false },
  { label: 'TODOs per 10k lines', value: (s) => (s.stats.scannedLoc ? (s.stats.todos / s.stats.scannedLoc) * 10_000 : 0), format: (n) => n.toFixed(1), higherWins: false },
  { label: 'Files', value: (s) => s.stats.files, higherWins: true },
  { label: 'Deepest nesting', value: (s) => s.stats.maxDepth, higherWins: false },
  { label: 'Test files', value: (s) => s.stats.testFiles, higherWins: true },
];

export function versusVerdicts(a: DungeonSpec, b: DungeonSpec): string[] {
  const out: string[] = [];
  if (a.boss && b.boss) {
    const [big, small] = a.boss.loc >= b.boss.loc ? [a, b] : [b, a];
    const ratio = big.boss!.loc / Math.max(1, small.boss!.loc);
    out.push(
      ratio >= 1.15
        ? `${big.repo.fullName}'s ${big.boss!.name} is ${ratio.toFixed(1)}× bigger than ${small.repo.fullName}'s ${small.boss!.name}.`
        : `Both bosses are about the same size: ${formatNumber(a.boss.loc)} vs ${formatNumber(b.boss.loc)} lines.`,
    );
  }
  if (a.health.score !== b.health.score) {
    const [w, l] = a.health.score > b.health.score ? [a, b] : [b, a];
    out.push(`${w.repo.fullName} is the healthier dungeon (${w.health.score} vs ${l.health.score}).`);
  } else {
    out.push(`Dead heat on health: both score ${a.health.score}.`);
  }
  if (a.stats.todos !== b.stats.todos) {
    const [m, f] = a.stats.todos > b.stats.todos ? [a, b] : [b, a];
    out.push(`${m.repo.fullName} has ${formatNumber(m.stats.todos - f.stats.todos)} more goblins in the scanned files.`);
  }
  return out;
}

export function renderVersus(root: HTMLElement, a: DungeonSpec, b: DungeonSpec, actions: VersusActions) {
  clear(root);
  const col = (s: DungeonSpec, other: DungeonSpec) => {
    const c = h('div', { class: 'panel vs-col' }, h('h3', {}, s.repo.fullName), h('p', { class: 'muted' }, s.title.name));
    for (const m of METRICS) {
      const v = m.value(s);
      const o = m.value(other);
      const max = Math.max(v, o, 1e-9);
      const win = v !== o && (m.higherWins ? v > o : v < o);
      c.append(
        h(
          'div',
          { class: `vs-row${win ? ' win' : ''}` },
          h('div', { class: 'label' }, h('span', {}, m.label), h('span', {}, m.format ? m.format(v) : formatNumber(v))),
          h('div', { class: 'bar' }, h('span', { style: `width:${Math.round((v / max) * 100)}%` })),
        ),
      );
    }
    c.append(h('button', { class: 'btn small primary', onclick: () => actions.play({ owner: s.repo.owner, name: s.repo.name }) }, 'Play this dungeon'));
    return c;
  };
  const link = `${SITE_URL}/vs/${a.repo.fullName}/${b.repo.fullName}`;
  const verdicts = h('ul', { class: 'panel verdicts' }, ...versusVerdicts(a, b).map((v) => h('li', {}, v)));
  root.append(
    h(
      'div',
      { class: 'page-inner' },
      h('div', { class: 'topbar' }, h('button', { class: 'home', onclick: actions.home }, 'gitcrawl')),
      h('h1', { class: 'victory-title' }, 'Versus'),
      h('div', { class: 'vs-grid', style: 'margin-top:24px' }, col(a, b), h('div', { class: 'vs-mid' }, 'vs'), col(b, a)),
      verdicts,
      h(
        'div',
        { class: 'button-row' },
        h(
          'a',
          {
            class: 'btn primary',
            href: `https://x.com/intent/post?text=${encodeURIComponent(`${versusVerdicts(a, b)[0] ?? ''} Settled it on gitcrawl.`)}&url=${encodeURIComponent(link)}&via=${OWNER_X}`,
            target: '_blank',
            rel: 'noopener',
          },
          'Post on X',
        ),
        h('button', { class: 'btn', onclick: async () => toast((await copyText(link)) ? 'Link copied.' : "Couldn't copy.", 'good') }, 'Copy link'),
        h('button', { class: 'btn ghost', onclick: actions.home }, 'Back'),
      ),
    ),
  );
}
