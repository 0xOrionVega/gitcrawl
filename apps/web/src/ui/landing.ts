/** Landing: the live dungeon is the hero; the form floats over it. */
import { parseRepoInput, type RepoRef } from '@gitcrawl/shared';
import { h, clear } from '../util/dom';
import { loadFixtureIndex } from '../data/load';
import { storage } from '../util/storage';
import { DEMO, EMBEDDED, OWNER_X } from '../config';
import { getAuthStatus, getPrivateRepos } from '../data/api';

export interface LandingActions {
  play: (ref: RepoRef) => void;
  daily: () => void;
  versus: () => void;
  hall: () => void;
  guide: () => void;
  local: () => void;
}

const FAMOUS = ['facebook/react', 'torvalds/linux', 'vuejs/core', 'kelseyhightower/nocode', 'junegunn/fzf', 'bitcoin/bitcoin'];

export function recentRepos(): string[] {
  try {
    return JSON.parse(storage.get('recent') ?? '[]') as string[];
  } catch {
    return [];
  }
}

export function rememberRepo(fullName: string) {
  const list = recentRepos().filter((r) => r.toLowerCase() !== fullName.toLowerCase());
  list.unshift(fullName);
  storage.set('recent', JSON.stringify(list.slice(0, 6)));
}

export function renderLanding(root: HTMLElement, actions: LandingActions) {
  clear(root);
  const input = h('input', {
    class: 'repo-input',
    type: 'text',
    inputmode: 'url',
    autocomplete: 'off',
    autocapitalize: 'off',
    spellcheck: 'false',
    placeholder: 'owner/repo or a GitHub link',
    'aria-label': 'GitHub repository',
  }) as HTMLInputElement;
  const error = h('p', { class: 'form-error', role: 'alert' });
  const form = h(
    'form',
    {
      class: 'repo-form',
      onsubmit: (ev: Event) => {
        ev.preventDefault();
        const ref = parseRepoInput(input.value);
        if (!ref) {
          error.textContent = 'Paste a repo like facebook/react or a github.com link.';
          input.focus();
          return;
        }
        actions.play(ref);
      },
    },
    input,
    h('button', { class: 'btn primary', type: 'submit' }, 'Enter the dungeon'),
  );
  const chips = h('div', { class: 'chips', 'aria-label': 'Example repos' });
  const addChip = (name: string, note?: string) => {
    if ([...chips.querySelectorAll('button')].some((b) => b.dataset.repo === name)) return;
    const b = h('button', { class: 'chip', type: 'button', 'data-repo': name, onclick: () => actions.play(parseRepoInput(name)!) }, name, note ? h('small', {}, ` ${note}`) : null);
    chips.append(b);
  };
  for (const r of recentRepos().slice(0, 3)) addChip(r, 'recent');
  void loadFixtureIndex().then((index) => {
    const names = DEMO ? index.map((e) => e.fullName) : FAMOUS;
    for (const n of names.slice(0, 12)) addChip(n);
  });

  const links = h(
    'div',
    { class: 'landing-links' },
    h('button', { type: 'button', onclick: actions.guide }, 'How it works'),
    h('button', { type: 'button', onclick: actions.daily }, 'Daily raid'),
    h('button', { type: 'button', onclick: actions.versus }, 'Versus: your repo against another'),
    h('button', { type: 'button', onclick: actions.hall }, 'Hall of Shame'),
    h('button', { type: 'button', onclick: actions.local }, 'Private code? Play it locally'),
  );
  root.append(
    h(
      'div',
      { class: 'landing-inner' },
      h('h1', { class: 'logo' }, 'git', h('span', { class: 'flame' }, 'crawl')),
      h('p', { class: 'pitch' }, 'Paste a GitHub repo. Fight its TODOs. Slay its biggest file.'),
      form,
      error,
      chips,
      links,
      h(
        'p',
        { class: 'fineprint' },
        DEMO && EMBEDDED
          ? 'Preview build: these dungeons were built from the real repos and ship with the page. The full site opens any public repo.'
          : DEMO
            ? 'Demo build: the example dungeons are bundled; other repos are built in your browser from public GitHub data.'
            : 'Reads public repository data from GitHub. Not affiliated with GitHub.',
      ),
      h('p', { class: 'fineprint owner' }, 'Made by ', h('a', { href: `https://x.com/${OWNER_X}`, target: '_blank', rel: 'noopener' }, `@${OWNER_X}`)),
    ),
  );
  if (window.matchMedia('(pointer: fine)').matches) window.setTimeout(() => input.focus(), 50);
}

export function renderLocalHelp(root: HTMLElement, back: () => void, playPrivate: (ref: RepoRef) => void) {
  clear(root);
  const connect = h('div', { class: 'section', style: 'text-align:left' });
  root.append(
    h(
      'div',
      { class: 'landing-inner' },
      h('h1', { class: 'logo', style: 'font-size:28px' }, 'Play private code'),
      h('p', { class: 'pitch' }, 'Run the CLI inside any git repo. It builds the dungeon on your machine and opens it in your browser. Nothing is uploaded.'),
      h(
        'div',
        { class: 'panel badge-box', style: 'text-align:left' },
        h('code', {}, 'npx gitcrawl-cli'),
        h('p', { class: 'muted' }, 'Or point it at a folder: npx gitcrawl-cli ~/code/my-app. Add --json dungeon.json to save the dungeon instead of opening it.'),
      ),
      connect,
      h('div', { class: 'button-row', style: 'justify-content:center' }, h('button', { class: 'btn', onclick: back }, 'Back')),
    ),
  );
  void getAuthStatus().then(async (status) => {
    if (!status?.enabled) return;
    clear(connect);
    connect.append(h('h2', {}, 'Or connect GitHub'));
    if (!status.user) {
      connect.append(
        h('p', {}, 'Install the gitcrawl GitHub App on the repos you choose. It can only read them, and your code is processed in memory, never stored.'),
        h('a', { class: 'btn primary', href: '/auth/login' }, 'Connect GitHub'),
      );
      return;
    }
    connect.append(h('p', {}, `Connected as @${status.user.login}. Pick a repo you gave gitcrawl access to:`));
    const list = h('div', { class: 'chips', style: 'justify-content:flex-start' });
    connect.append(list);
    const repos = await getPrivateRepos();
    if (!repos || repos.length === 0) {
      list.append(h('p', { class: 'muted' }, 'No repos yet. Add some in the app installation settings on GitHub.'));
      return;
    }
    for (const r of repos.slice(0, 30)) {
      const ref = parseRepoInput(r.fullName);
      if (ref) list.append(h('button', { class: 'chip', type: 'button', onclick: () => playPrivate(ref) }, r.fullName, r.private ? h('small', {}, ' private') : null));
    }
  });
}
