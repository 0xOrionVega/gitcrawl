import { h, clear } from '../util/dom';

export function renderLoading(root: HTMLElement, title: string): { step: (text: string) => void; fail: (message: string, actions: { label: string; run: () => void }[]) => void } {
  clear(root);
  const step = h('div', { class: 'step', role: 'status', 'aria-live': 'polite' }, 'Lighting the torches…');
  const bar = h('div', { class: 'torchbar' }, h('span'));
  const box = h('div', {}, h('h2', {}, title), step, bar);
  root.append(box);
  return {
    step: (text) => (step.textContent = text),
    fail: (message, actions) => {
      clear(box);
      box.append(h('h2', {}, title), h('p', { class: 'error' }, message), h('div', { class: 'button-row', style: 'justify-content:center' }, ...actions.map((a, i) => h('button', { class: i === 0 ? 'btn primary' : 'btn', onclick: a.run }, a.label))));
    },
  };
}
