import { h } from '../util/dom';

let root: HTMLElement | null = null;

export function mountToasts(parent: HTMLElement) {
  root = h('div', { class: 'toasts', 'aria-live': 'polite' });
  parent.append(root);
}

export function toast(text: string, tone: 'good' | 'bad' | 'info' | 'gold' = 'info', action?: { label: string; href?: string; download?: string; onClick?: () => void }) {
  if (!root) return;
  const el = h('div', { class: `panel toast ${tone}` }, text);
  if (action) {
    const a = action.href
      ? h('a', { class: 'btn small', href: action.href, download: action.download ?? null, style: 'margin-left:10px;pointer-events:auto' }, action.label)
      : h('button', { class: 'btn small', style: 'margin-left:10px;pointer-events:auto', onclick: () => action.onClick?.() }, action.label);
    el.append(a);
    el.style.animation = 'toastIn 160ms ease-out, toastOut 400ms ease-in 9s forwards';
  }
  root.append(el);
  while (root.childElementCount > 3) root.firstElementChild?.remove();
  window.setTimeout(() => el.remove(), action ? 9600 : 4000);
}
