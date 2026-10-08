/** Shared input state written by the on-screen touch controls, read by the scene. */
export const touchInput = {
  enabled: false,
  moveX: 0,
  moveY: 0,
  attack: false,
  interactPressed: false,
  weaponCyclePressed: false,
};

/** Keys the DOM layer wants the game to ignore while typing in inputs. */
export function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable;
}
