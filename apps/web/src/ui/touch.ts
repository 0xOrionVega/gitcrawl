/** On-screen joystick and buttons for phones and tablets. */
import { h } from '../util/dom';
import { touchInput } from '../game/input';
import { audio } from '../audio/audio';

export class TouchControls {
  readonly el: HTMLElement;
  private nub: HTMLElement;
  private stick: HTMLElement;
  private stickId: number | null = null;

  constructor(parent: HTMLElement) {
    this.nub = h('div', { class: 'nub' });
    this.stick = h('div', { class: 'stick', 'aria-hidden': 'true' }, this.nub);
    const attack = h('button', { class: 'touch-btn attack', 'aria-label': 'Attack' }, 'HIT');
    const use = h('button', { class: 'touch-btn use', 'aria-label': 'Use' }, 'USE');
    const swap = h('button', { class: 'touch-btn swap', 'aria-label': 'Switch weapon' }, 'SWAP');
    this.el = h('div', { class: 'touch', hidden: true }, this.stick, attack, use, swap);
    parent.append(this.el);

    this.stick.addEventListener('pointerdown', (e) => {
      audio.unlock();
      this.stickId = e.pointerId;
      this.stick.setPointerCapture(e.pointerId);
      this.move(e);
    });
    this.stick.addEventListener('pointermove', (e) => {
      if (e.pointerId === this.stickId) this.move(e);
    });
    const end = (e: PointerEvent) => {
      if (e.pointerId !== this.stickId) return;
      this.stickId = null;
      touchInput.moveX = 0;
      touchInput.moveY = 0;
      this.nub.style.transform = '';
    };
    this.stick.addEventListener('pointerup', end);
    this.stick.addEventListener('pointercancel', end);

    attack.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      audio.unlock();
      touchInput.attack = true;
    });
    const stopAttack = () => (touchInput.attack = false);
    attack.addEventListener('pointerup', stopAttack);
    attack.addEventListener('pointercancel', stopAttack);
    attack.addEventListener('pointerleave', stopAttack);
    use.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      audio.unlock();
      touchInput.interactPressed = true;
    });
    swap.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      touchInput.weaponCyclePressed = true;
    });
  }

  private move(e: PointerEvent) {
    const r = this.stick.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    let dx = (e.clientX - cx) / (r.width / 2);
    let dy = (e.clientY - cy) / (r.height / 2);
    const len = Math.hypot(dx, dy);
    if (len > 1) {
      dx /= len;
      dy /= len;
    }
    touchInput.moveX = dx;
    touchInput.moveY = dy;
    this.nub.style.transform = `translate(${dx * 38}px, ${dy * 38}px)`;
  }

  show() {
    touchInput.enabled = true;
    this.el.hidden = false;
  }

  hide() {
    touchInput.enabled = false;
    touchInput.attack = false;
    touchInput.moveX = 0;
    touchInput.moveY = 0;
    this.el.hidden = true;
  }
}
