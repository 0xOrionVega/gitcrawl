/**
 * TODO Raid: the gitcrawl extension for VS Code and Cursor, where the TODOs in
 * the open file turn into monsters that hunt your text cursor. Demo video,
 * install links and how to play.
 */
import * as S from '../art/sprites';
import { spriteDataUrl } from '../art/textures';
import { h, clear } from '../util/dom';

const EXTENSION_ID = 'Orion-vega.gitcrawl';
export const MARKETPLACE_URL = `https://marketplace.visualstudio.com/items?itemName=${EXTENSION_ID}`;
const OPEN_VSX_URL = `https://open-vsx.org/extension/${EXTENSION_ID.replace('.', '/')}`;

const MONSTERS: [S.PixelSprite, string, string, string][] = [
  [S.GOBLIN_A, 'Goblin', 'TODO', '2 hits. Quick on its feet.'],
  [S.SKELETON_A, 'Skeleton', 'FIXME', '3 hits. Slow and steady.'],
  [S.SLIME, 'Slime', 'HACK', '4 hits. Barely moves, hard to kill.'],
  [S.GHOST, 'Ghost', 'XXX or BUG', '1 hit. The fastest thing in the file.'],
];

const CONTROLS: [string, string][] = [
  ['Swing', 'Press Shift+Space. Hits every monster within one line and six characters of your text cursor.'],
  ['Bump', 'Moving your text cursor right next to a monster hits it too. The text cursor, not the mouse pointer.'],
  ['Dodge', 'A monster that reaches you glows red before it bites. Swing, or move away and it misses. A bite costs a heart.'],
  ['Banish', 'Fix or delete the comment and its monster is gone for good. That is the real win.'],
  ['Read', 'Hover a monster with the mouse to see its full TODO and the line it lives on.'],
  ['Stop', 'Click the hearts in the status bar, or run gitcrawl: End Raid.'],
];

function video() {
  const base = import.meta.env.BASE_URL;
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  return h(
    'video',
    {
      class: 'editor-video',
      poster: `${base}media/todo-raid-poster.jpg`,
      autoplay: !still,
      muted: true,
      loop: true,
      playsinline: true,
      controls: still,
      preload: 'metadata',
      'aria-label': 'A TODO raid in the editor: monsters chase the cursor, get hit with Shift+Space, and one is banished by deleting its TODO',
    },
    h('source', { src: `${base}media/todo-raid.webm`, type: 'video/webm' }),
    h('source', { src: `${base}media/todo-raid.mp4`, type: 'video/mp4' }),
  );
}

export function renderEditor(root: HTMLElement, actions: { home: () => void; guide: () => void }) {
  clear(root);
  const v = video();
  // Some browsers drop the muted attribute set through setAttribute; autoplay needs the property.
  v.muted = true;
  root.append(
    h(
      'div',
      { class: 'page-inner editor-page' },
      h('div', { class: 'topbar' }, h('button', { class: 'home', onclick: actions.home }, 'gitcrawl'), h('button', { class: 'btn', onclick: actions.guide }, 'How the dungeon works')),
      h('h1', { class: 'victory-title' }, 'TODO Raid'),
      h('p', { class: 'victory-sub' }, 'Your TODOs come alive in VS Code and Cursor and hunt your text cursor. Fix the TODO to banish its monster for good.'),
      h('div', { class: 'panel editor-video-wrap' }, v),
      h(
        'div',
        { class: 'button-row' },
        h('a', { class: 'btn primary', href: MARKETPLACE_URL, target: '_blank', rel: 'noopener' }, 'Install for VS Code'),
        h('a', { class: 'btn', href: OPEN_VSX_URL, target: '_blank', rel: 'noopener' }, 'Cursor, Windsurf, VSCodium'),
      ),
      h('p', { class: 'muted' }, 'Or search "gitcrawl" in your editor\'s Extensions panel. Free, open source, and your code never leaves the editor: the monsters are only decorations.'),
      h(
        'div',
        { class: 'section' },
        h('h2', {}, 'Start a raid'),
        h(
          'ol',
          { class: 'panel editor-steps' },
          h('li', {}, 'Open a file that has some ', h('code', {}, 'TODO'), ', ', h('code', {}, 'FIXME'), ', ', h('code', {}, 'HACK'), ' or ', h('code', {}, 'BUG'), ' comments.'),
          h('li', {}, 'Open the Command Palette: ', h('kbd', {}, 'Cmd+Shift+P'), ' on a Mac, ', h('kbd', {}, 'Ctrl+Shift+P'), ' on Windows and Linux.'),
          h('li', {}, 'Type ', h('b', {}, 'raid'), ' and pick ', h('b', {}, 'gitcrawl: Raid This File'), '.'),
          h('li', {}, 'A monster appears on every comment, and your hearts show up in the status bar.'),
          h('li', {}, 'Move your text cursor near them and press ', h('kbd', {}, 'Shift+Space'), ' to swing.'),
        ),
      ),
      h(
        'div',
        { class: 'section' },
        h('h2', {}, 'Who lives in your file'),
        h(
          'div',
          { class: 'guide-entries editor-monsters' },
          ...MONSTERS.map(([sprite, name, tag, text]) =>
            h(
              'div',
              { class: 'panel guide-entry' },
              h('div', { class: 'guide-icon' }, h('img', { class: 'px', src: spriteDataUrl(sprite, 3), alt: '' })),
              h('div', {}, h('h3', {}, name), h('p', { class: 'guide-repo' }, tag), h('p', {}, text)),
            ),
          ),
        ),
      ),
      h(
        'div',
        { class: 'section' },
        h('h2', {}, 'How to play'),
        h('dl', { class: 'panel editor-controls' }, ...CONTROLS.flatMap(([k, text]) => [h('dt', {}, k), h('dd', {}, text)])),
        h('p', { class: 'muted' }, 'The raid pauses while you are in another file or another window. Speed and hearts are in Settings under gitcrawl.'),
      ),
    ),
  );
  root.scrollTop = 0;
}
