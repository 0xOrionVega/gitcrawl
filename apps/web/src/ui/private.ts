/**
 * Private repos: the two ways in (the CLI on your machine, or the read-only
 * GitHub App) and the privacy page that explains exactly what happens to code.
 */
import { parseRepoInput, type RepoRef } from '@gitcrawl/shared';
import { h, clear } from '../util/dom';
import { getAuthStatus, getPrivateRepos, logout } from '../data/api';

const SAFE_POINTS: [string, string][] = [
  ['Read-only', 'The gitcrawl GitHub App can only read. It cannot push, comment, open issues or change settings.'],
  ['Only the repos you pick', 'You choose which repos the app can see when you install it, and you can remove them any time on GitHub.'],
  ['Code is never stored', 'Source files are read into memory to count lines and find TODOs, then dropped. Nothing is written to disk or a database.'],
  ['Only you see the dungeon', 'Private dungeons live in server memory for one hour, keyed to your GitHub account, and are never served to anyone else.'],
  ['No names in shares', 'Share cards, clips and links for a private repo hide the repo name and file names. Private runs never go on leaderboards or the Hall of Shame.'],
  ['Your token stays sealed', 'Your GitHub token is kept only in an encrypted, HttpOnly cookie in your browser (AES-256-GCM, 8 hours max). Disconnecting revokes it on GitHub.'],
];

function safeList() {
  return h(
    'ul',
    { class: 'panel safe-list' },
    ...SAFE_POINTS.map(([title, text]) => h('li', {}, h('span', { class: 'safe-check', 'aria-hidden': 'true' }, '✓'), h('div', {}, h('b', {}, title), h('p', {}, text)))),
  );
}

export function renderPrivate(root: HTMLElement, actions: { home: () => void; privacy: () => void; play: (ref: RepoRef) => void; editor: () => void }) {
  clear(root);
  const connect = h('div', { class: 'panel private-option' }, h('h2', {}, 'Connect GitHub'), h('p', { class: 'muted' }, 'Checking…'));
  root.append(
    h(
      'div',
      { class: 'page-inner private-page' },
      h('div', { class: 'topbar' }, h('button', { class: 'home', onclick: actions.home }, 'gitcrawl'), h('button', { class: 'btn', onclick: actions.privacy }, 'Is it safe?')),
      h('h1', { class: 'victory-title' }, 'Play private code'),
      h('p', { class: 'victory-sub' }, 'Your private repos can be dungeons too. Pick how you want to bring them in. Either way, your code stays yours.'),
      h(
        'div',
        { class: 'private-options' },
        h(
          'div',
          { class: 'panel private-option' },
          h('h2', {}, 'On your machine'),
          h('p', { class: 'safe-tag' }, 'Safest: nothing leaves your computer'),
          h('p', {}, 'Run the CLI inside any git repo. It builds the dungeon locally and opens it in your browser on localhost.'),
          h('code', { class: 'cmd' }, 'npx gitcrawl-cli'),
          h('p', { class: 'muted' }, 'Or point it at a folder: npx gitcrawl-cli ~/code/my-app. Add --json dungeon.json to save the dungeon instead.'),
        ),
        connect,
      ),
      h(
        'p',
        { class: 'muted' },
        'Rather fight in your editor? ',
        h('button', { class: 'linkish', onclick: actions.editor }, 'TODO Raid for VS Code and Cursor'),
        ' turns the TODOs in your open file into monsters. Nothing is uploaded.',
      ),
      h('div', { class: 'section' }, h('h2', {}, 'Why it is safe'), safeList(), h('p', {}, h('button', { class: 'linkish', onclick: actions.privacy }, 'Read the full privacy details'))),
    ),
  );
  void fillConnect(connect, actions.play);
}

async function fillConnect(box: HTMLElement, play: (ref: RepoRef) => void) {
  const status = await getAuthStatus();
  clear(box);
  box.append(h('h2', {}, 'Connect GitHub'), h('p', { class: 'safe-tag' }, 'Read-only, only the repos you choose'));
  if (!status?.enabled) {
    box.querySelector('h2')?.append(' ', h('span', { class: 'soon-badge' }, 'Coming soon'));
    box.append(h('p', {}, 'Sign in with GitHub, pick the repos you want, and play them right here. Read-only access, nothing stored. Until then, use the CLI: it works with any repo and nothing is uploaded.'));
    return;
  }
  if (!status.user) {
    box.append(
      h('p', {}, 'Sign in with GitHub, then install the gitcrawl app on the repos you want to play. You can play them right here.'),
      h('a', { class: 'btn primary', href: '/auth/login' }, 'Connect GitHub'),
    );
    return;
  }
  const install = status.installUrl ? h('a', { class: 'btn small', href: status.installUrl }, 'Choose repos on GitHub') : null;
  const disconnect = h(
    'button',
    {
      class: 'btn small ghost',
      onclick: async () => {
        await logout();
        void fillConnect(box, play);
      },
    },
    'Disconnect',
  );
  box.append(h('p', {}, `Connected as @${status.user.login}.`));
  const list = h('div', { class: 'chips', style: 'justify-content:flex-start' }, h('p', { class: 'muted' }, 'Loading your repos…'));
  box.append(list, h('div', { class: 'button-row' }, install, disconnect));
  const repos = await getPrivateRepos();
  clear(list);
  if (!repos || repos.length === 0) {
    list.append(h('p', { class: 'muted' }, 'No repos yet. Install the app on the repos you want to play, then come back here.'));
    return;
  }
  for (const r of repos.slice(0, 40)) {
    const ref = parseRepoInput(r.fullName);
    if (ref) list.append(h('button', { class: 'chip', type: 'button', onclick: () => play(ref) }, r.fullName, r.private ? h('small', {}, ' private') : null));
  }
}

export function renderPrivacy(root: HTMLElement, actions: { home: () => void; back: () => void }) {
  clear(root);
  const qa = (q: string, ...a: string[]) => h('div', { class: 'section' }, h('h2', {}, q), ...a.map((t) => h('p', {}, t)));
  root.append(
    h(
      'div',
      { class: 'page-inner private-page' },
      h('div', { class: 'topbar' }, h('button', { class: 'home', onclick: actions.home }, 'gitcrawl'), h('button', { class: 'btn primary', onclick: actions.back }, 'Play private code')),
      h('h1', { class: 'victory-title' }, 'Is it safe?'),
      h('p', { class: 'victory-sub' }, 'Yes. Here is exactly what gitcrawl can see, what it keeps, and how to cut it off.'),
      safeList(),
      qa('What can the GitHub App access?', 'Only the repos you select when installing it, with read-only permissions: contents, metadata, issues and pull requests. It has no write permissions of any kind, no access to your account settings, and no webhooks.'),
      qa(
        'What happens to my code?',
        'When you open a private dungeon, the server fetches the file list and reads a sample of source files to count lines and find TODO comments. That happens in memory. The code itself is never written to disk, logged or put in a database.',
        'What is kept is the dungeon: room names (your folders), file names and sizes, TODO text and issue titles. It stays in server memory for one hour, only for your GitHub account, and disappears when it expires, when you disconnect or when the server restarts.',
      ),
      qa('Who can see my private dungeon?', 'Only you, while you are signed in. Private dungeons are never cached on disk, never listed in the Hall of Shame, the daily raid or leaderboards, and have no public link. Share cards and clips say "a private repo" instead of the name.'),
      qa('Where is my GitHub login kept?', 'In one encrypted, HttpOnly cookie in your browser (AES-256-GCM). Page scripts cannot read it, and it expires after 8 hours at most. gitcrawl keeps no account database.'),
      qa('How do I cut off access?', 'Click Disconnect on the private page: the token is revoked on GitHub and your cached dungeons are deleted. To remove the app completely, uninstall it in GitHub → Settings → Applications.'),
      qa('I want zero uploads.', 'Use the CLI: npx gitcrawl-cli inside your repo. It reads your code on your own machine and serves the game on localhost. Nothing is sent to gitcrawl.'),
    ),
  );
  root.scrollTop = 0;
}
