/**
 * Field guide: what gitcrawl is, a legend of the dungeon map, who lives there
 * and what everything means in the real repo. Shown before the first run and
 * reachable from the landing page and the pause menu.
 */
import { h, clear } from '../util/dom';
import { textureUrl } from '../game/host';
import { icons, npcIcon } from './icons';
import { storage } from '../util/storage';

const SEEN_KEY = 'guideSeen';

export function guideSeen(): boolean {
  return storage.get(SEEN_KEY) === '1';
}

export function markGuideSeen() {
  storage.set(SEEN_KEY, '1');
}

interface Entry {
  icon: string;
  name: string;
  repo: string;
  text: string;
}

/** `icon:<name>` is a HUD icon, `npc` a contributor, anything else a game texture key. */
function iconSrc(key: string): string {
  if (key === 'npc') return npcIcon('#5b8bd9');
  if (key.startsWith('icon:')) return (icons() as Record<string, string>)[key.slice(5)] ?? '';
  return textureUrl(key);
}

function entries(list: Entry[]) {
  return h(
    'div',
    { class: 'guide-entries' },
    ...list.map((e) =>
      h(
        'div',
        { class: 'panel guide-entry' },
        h('div', { class: 'guide-icon' }, h('img', { class: 'px', src: iconSrc(e.icon), alt: '' })),
        h('div', {}, h('h3', {}, e.name), h('p', { class: 'guide-repo' }, e.repo), h('p', {}, e.text)),
      ),
    ),
  );
}

const MONSTERS: Entry[] = [
  { icon: 'goblin', name: 'Goblin', repo: 'A TODO, FIXME or HACK comment', text: 'Shouts its real comment text when it spots you. Hit it to resolve the TODO. The hammer squashes it in one blow.' },
  { icon: 'slime', name: 'Slime', repo: 'A big source file', text: 'Slow and tough. The bigger the file, the more hits it takes.' },
  { icon: 'miniboss', name: 'Mini-boss', repo: 'One of the largest files', text: 'A paper golem guarding its folder. Watch for the red flash: it charges.' },
  { icon: 'boss', name: 'The Boss', repo: 'The largest source file in the repo', text: 'Waits in the room farthest from the entrance. Its health is its line count, and it taunts you with its own code comments.' },
  { icon: 'ghost', name: 'Ghost', repo: 'An open issue', text: 'Drifts through walls and follows you from room to room. Its title is the issue title.' },
  { icon: 'skeleton', name: 'Skeleton', repo: 'A stale branch', text: 'No commits in over six months. They rattle around the crypt until you prune them.' },
];

const PEOPLE: Entry[] = [
  { icon: 'npc', name: 'Guardian', repo: 'A top contributor', text: 'Stands in the folder they commit to most (or own in CODEOWNERS). Talk to them for their latest commit message.' },
];

const THINGS: Entry[] = [
  { icon: 'tablet', name: 'Stone tablet', repo: 'The README', text: 'In the entrance hall. Read it for the first lines of the README.' },
  { icon: 'questboard', name: 'Quest board', repo: 'Good first issues and help wanted', text: 'Each quest points at a room. Reach it to get the link to the issue.' },
  { icon: 'crate', name: 'Crate', repo: 'A source file', text: 'Inspect it for the path, size and language. Barrels are the non-code files.' },
  { icon: 'shrine', name: 'Test shrine', repo: 'The tests folder', text: 'Pray to heal fully. No tests in the repo means no healing anywhere.' },
  { icon: 'chest', name: 'Chest', repo: 'Loot', text: 'Holds a power-up: a sharper blade, faster boots, a shield or a potion.' },
  { icon: 'gold', name: 'Gold', repo: 'Stars', text: 'Piled in the treasury. More stars, bigger pile.' },
  { icon: 'door-wooden-h', name: 'License door', repo: 'The LICENSE', text: 'Guards the treasury. Wooden for MIT and friends, iron for Apache, enchanted for GPL. No license: a cursed door that never opens.' },
  { icon: 'bones', name: 'Pit of Dependencies', repo: 'node_modules, vendor and lockfiles', text: 'A bottomless pit. Fall in and you wake up back at the entrance.' },
];

const GEAR: Entry[] = [
  { icon: 'icon:sword', name: 'Sword  (1)', repo: 'Quick swing', text: 'Fast, short range, hits everything in front of you.' },
  { icon: 'icon:bow', name: 'Bow  (2)', repo: 'Arrows', text: 'Hit from a distance. Good against ghosts and the boss.' },
  { icon: 'icon:hammer', name: 'Refactor hammer  (3)', repo: 'Slow and heavy', text: 'Triple damage in a ring around you. One-shots goblins.' },
];

/** The map legend: a schematic dungeon with each room labelled by what it is in the repo. */
function legendMap() {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 720 330');
  svg.setAttribute('class', 'guide-map');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'Example dungeon map: the entrance hall is the repo root, corridors lead to folder rooms, the crypt, the pit, the treasury behind the license door and the boss room.');
  const el = (tag: string, attrs: Record<string, string | number>, text?: string) => {
    const n = document.createElementNS(ns, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
    if (text) n.textContent = text;
    svg.append(n);
    return n;
  };
  const corridors: [number, number, number, number][] = [
    [150, 170, 250, 90],
    [150, 170, 250, 250],
    [150, 170, 300, 170],
    [380, 170, 470, 170],
    [380, 90, 470, 80],
    [380, 250, 470, 260],
    [560, 170, 600, 170],
  ];
  for (const [x1, y1, x2, y2] of corridors) el('line', { x1, y1, x2, y2, class: 'gm-corridor' });
  const room = (x: number, y: number, w: number, hgt: number, title: string, sub: string, icon: string, cls = '') => {
    el('rect', { x, y, width: w, height: hgt, class: `gm-room ${cls}` });
    el('text', { x: x + w / 2, y: y + 16, class: 'gm-title' }, title);
    el('text', { x: x + w / 2, y: y + hgt - 8, class: 'gm-sub' }, sub);
    const src = iconSrc(icon);
    if (src) el('image', { href: src, x: x + w / 2 - 14, y: y + hgt / 2 - 14, width: 28, height: 28, class: 'gm-icon' });
  };
  room(20, 120, 130, 100, 'Entrance', 'repo root + README', 'tablet', 'gm-start');
  room(250, 50, 130, 80, '/src', 'goblins = TODOs', 'goblin');
  room(300, 130, 80, 80, '/lib', 'big file', 'slime');
  room(250, 210, 130, 80, '/tests', 'healing shrine', 'shrine');
  room(470, 40, 110, 80, 'Crypt', 'stale branches', 'skeleton');
  room(470, 130, 90, 80, 'Treasury', 'stars = gold', 'gold');
  room(470, 220, 110, 80, 'The Pit', 'node_modules', 'bones', 'gm-pit');
  room(600, 110, 105, 120, 'Boss room', 'largest file', 'boss', 'gm-boss');
  el('rect', { x: 452, y: 158, width: 10, height: 24, class: 'gm-door' });
  el('text', { x: 457, y: 200, class: 'gm-sub gm-door-label' }, 'license');
  el('text', { x: 20, y: 320, class: 'gm-note' }, 'Every map is different: rooms are the real folders, sized by how many files they hold.');
  return svg;
}

export function renderGuide(root: HTMLElement, opts: { primary: string; onPrimary: () => void; onHome?: () => void }) {
  clear(root);
  const primary = () => {
    markGuideSeen();
    opts.onPrimary();
  };
  root.append(
    h(
      'div',
      { class: 'page-inner guide' },
      h(
        'div',
        { class: 'topbar' },
        opts.onHome ? h('button', { class: 'home', onclick: opts.onHome }, 'gitcrawl') : h('span', { class: 'home' }, 'gitcrawl'),
        h('button', { class: 'btn primary', onclick: primary }, opts.primary),
      ),
      h('h1', { class: 'victory-title' }, 'Field guide'),
      h(
        'p',
        { class: 'victory-sub' },
        'gitcrawl turns a GitHub repo into a dungeon you can play. Every monster, door and chest is something real in the code, so by the end of the run you know the repo, and you get a loot report of what to fix.',
      ),
      h('div', { class: 'section' }, h('h2', {}, 'The map'), h('p', {}, 'The repo root is the entrance hall. Every folder becomes a room, and corridors follow the folder tree. The boss always waits in the room farthest from the entrance.'), h('div', { class: 'panel guide-map-wrap' }, legendMap())),
      h('div', { class: 'section' }, h('h2', {}, 'Who lives here'), entries(MONSTERS)),
      h('div', { class: 'section' }, h('h2', {}, 'Who to ask'), entries(PEOPLE)),
      h('div', { class: 'section' }, h('h2', {}, 'What you will find'), entries(THINGS)),
      h('div', { class: 'section' }, h('h2', {}, 'Your gear'), entries(GEAR)),
      h(
        'div',
        { class: 'section' },
        h('h2', {}, 'Controls'),
        h(
          'ul',
          { class: 'panel guide-keys' },
          ...[
            ['WASD / arrows', 'Move'],
            ['Click / Space', 'Attack (aim with the mouse)'],
            ['1  2  3  /  Q', 'Switch weapon'],
            ['E', 'Talk, open, read'],
            ['Tab', 'Big map'],
            ['M', 'Mute'],
            ['Esc', 'Pause menu: explore mode, report, record a clip'],
          ].map(([k, v]) => h('li', {}, h('kbd', {}, k), h('span', {}, v))),
        ),
      ),
      h(
        'div',
        { class: 'section' },
        h('h2', {}, 'After the run'),
        h('p', {}, 'Beat the boss to get the loot report: the files to split, the oldest TODOs, branches to prune, issues where newcomers can start, and a 0–100 dungeon health score. Each item links to the exact file and line on GitHub.'),
        h('p', {}, 'Not here to fight? Switch to explore mode in the pause menu: monsters turn friendly and you can walk around and read.'),
      ),
      h('div', { class: 'section guide-cta' }, h('button', { class: 'btn primary', onclick: primary }, opts.primary)),
    ),
  );
  root.scrollTop = 0;
}
