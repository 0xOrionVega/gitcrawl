/** Bottom dialog box for NPCs, tablets, quest boards, doors and files. */
import { h, clear } from '../util/dom';
import type { DialogPayload } from '../game/types';
import { icons } from './icons';

export class Dialog {
  readonly el: HTMLElement;
  private onClose: () => void = () => {};

  constructor(parent: HTMLElement) {
    this.el = h('div', { class: 'panel dialog', hidden: true, role: 'dialog', 'aria-live': 'polite' });
    parent.append(this.el);
  }

  setOnClose(fn: () => void) {
    this.onClose = fn;
  }

  get open() {
    return !this.el.hidden;
  }

  show(p: DialogPayload) {
    clear(this.el);
    const portrait = h('div', { class: 'portrait' });
    const ic = icons() as Record<string, string>;
    if (p.avatar) {
      const img = h('img', { src: p.avatar, alt: '', referrerpolicy: 'no-referrer' });
      img.addEventListener('error', () => {
        img.replaceWith(h('img', { class: 'px', src: ic.hero, alt: '' }));
      });
      portrait.append(img);
    } else {
      const key = p.sprite && ic[p.sprite] ? p.sprite : p.kind === 'npc' ? 'hero' : p.kind === 'door' ? 'chest' : p.kind === 'pit' ? 'ghost' : 'tablet';
      portrait.append(h('img', { class: 'px', src: ic[key] ?? ic.tablet, alt: '' }));
    }
    const body = h('div', { class: 'body' }, h('h3', {}, p.title));
    if (p.text) body.append(h('p', {}, p.text));
    if (p.lines && p.lines.length > 0) {
      const ul = h('ul');
      for (const line of p.lines) {
        ul.append(
          h(
            'li',
            {},
            line.url ? h('a', { href: line.url, target: '_blank', rel: 'noopener' }, line.text) : line.text,
            line.sub ? h('small', {}, line.sub) : null,
          ),
        );
      }
      body.append(ul);
    }
    const actions = h('div', { class: 'actions' });
    if (p.url) actions.append(h('a', { class: 'btn small', href: p.url, target: '_blank', rel: 'noopener' }, p.urlLabel ?? 'Open on GitHub'));
    actions.append(h('button', { class: 'btn small ghost', onclick: () => this.hide() }, 'Close'));
    body.append(actions);
    this.el.append(portrait, body);
    this.el.hidden = false;
  }

  hide() {
    if (this.el.hidden) return;
    this.el.hidden = true;
    this.onClose();
  }
}
