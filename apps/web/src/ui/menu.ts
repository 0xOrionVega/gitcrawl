/** Pause menu. */
import { h, clear } from '../util/dom';

export interface MenuActions {
  resume: () => void;
  toggleExplore: () => void;
  report: () => void;
  record: () => void;
  restart: () => void;
  leave: () => void;
  map: () => void;
}

export function renderMenu(root: HTMLElement, state: { explore: boolean; muted: boolean; canRecord: boolean }, a: MenuActions) {
  clear(root);
  root.append(
    h(
      'div',
      { class: 'panel', role: 'dialog', 'aria-label': 'Menu' },
      h('h2', {}, 'Paused'),
      h('button', { class: 'btn primary', onclick: a.resume }, 'Resume'),
      h('button', { class: 'btn', onclick: a.map }, 'Open the map'),
      h('button', { class: 'btn', onclick: a.toggleExplore }, state.explore ? 'Switch to fight mode' : 'Switch to explore mode'),
      h('button', { class: 'btn', onclick: a.report }, 'Skip to the loot report'),
      state.canRecord ? h('button', { class: 'btn', onclick: a.record }, 'Record a 10 second clip') : null,
      h('button', { class: 'btn', onclick: a.restart }, 'Restart the run'),
      h('button', { class: 'btn ghost', onclick: a.leave }, 'Leave the dungeon'),
      h('p', { class: 'keys' }, 'WASD or arrows to move. Click or Space to attack. 1, 2, 3 or Q to switch weapons. E to talk, open and read. M to mute. Esc to pause.'),
    ),
  );
  (root.querySelector('.btn.primary') as HTMLButtonElement | null)?.focus();
}
