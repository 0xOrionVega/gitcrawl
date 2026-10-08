/**
 * Paints the DOM overlays that sit on top of the game canvas (HUD, dialog,
 * toasts) into a 2D context, so recorded clips show what the player sees.
 *
 * This is a small DOM-to-canvas painter, not a general renderer: it covers
 * what the HUD uses (solid and gradient backgrounds, borders, inset shadows,
 * images, canvases and text) and skips the rest.
 */

/** Overlay roots, in paint order. The game, page screens and menu are left out. */
const ROOTS = ['.hud', '.dialog', '.toasts'];
/** Left out of clips: the controls help sits where the watermark goes. */
const SKIP = '.controls-help';

interface Mapping {
  ox: number;
  oy: number;
  s: number;
}

const TRANSPARENT = /^(transparent|rgba\(0, 0, 0, 0\))$/;
const COLOR = /(rgba?\([^)]*\)|#[0-9a-f]{3,8})/i;

export function paintOverlays(ctx: CanvasRenderingContext2D, game: HTMLCanvasElement, outW: number) {
  const gr = game.getBoundingClientRect();
  if (gr.width === 0) return;
  const m: Mapping = { ox: gr.left, oy: gr.top, s: outW / gr.width };
  for (const sel of ROOTS) {
    const el = document.querySelector<HTMLElement>(sel);
    if (el) paintElement(ctx, el, m, 1);
  }
}

function paintElement(ctx: CanvasRenderingContext2D, el: Element, m: Mapping, alpha: number) {
  if ((el instanceof HTMLElement && el.hidden) || el.matches(SKIP)) return;
  const cs = getComputedStyle(el);
  if (cs.display === 'none' || cs.visibility === 'hidden') return;
  const a = alpha * parseFloat(cs.opacity || '1');
  if (a <= 0.01) return;
  const r = el.getBoundingClientRect();
  if (r.width === 0 || r.height === 0) return;
  const x = (r.left - m.ox) * m.s;
  const y = (r.top - m.oy) * m.s;
  const w = r.width * m.s;
  const h = r.height * m.s;
  ctx.globalAlpha = a;

  // Background: solid colour, or the first stop of a gradient.
  if (!TRANSPARENT.test(cs.backgroundColor)) {
    ctx.fillStyle = cs.backgroundColor;
    ctx.fillRect(x, y, w, h);
  }
  if (cs.backgroundImage.includes('gradient')) {
    const c = cs.backgroundImage.match(COLOR);
    if (c) {
      ctx.fillStyle = c[1];
      ctx.fillRect(x, y, w, h);
    }
  }

  // Borders, drawn per side so a left-only border (the feed) works.
  const sides: [string, number, number, number, number][] = [
    ['Top', x, y, w, 0],
    ['Bottom', x, y + h, w, 0],
    ['Left', x, y, 0, h],
    ['Right', x + w, y, 0, h],
  ];
  for (const [side, sx, sy, sw, sh] of sides) {
    const bw = parseFloat(cs.getPropertyValue(`border-${side.toLowerCase()}-width`)) * m.s;
    const style = cs.getPropertyValue(`border-${side.toLowerCase()}-style`);
    if (!bw || style === 'none') continue;
    ctx.fillStyle = cs.getPropertyValue(`border-${side.toLowerCase()}-color`);
    if (sh === 0) ctx.fillRect(sx, side === 'Top' ? sy : sy - bw, sw, bw);
    else ctx.fillRect(side === 'Left' ? sx : sx - bw, sy, bw, sh);
  }

  // Inset box-shadow ring (the panel's inner mortar line).
  for (const part of cs.boxShadow.split(/,(?![^(]*\))/)) {
    if (!part.includes('inset')) continue;
    const c = part.match(COLOR);
    const nums = part.replace(COLOR, '').match(/-?[\d.]+px/g)?.map(parseFloat) ?? [];
    const spread = (nums[3] ?? 0) * m.s;
    if (!c || spread <= 0) continue;
    const bl = parseFloat(cs.borderLeftWidth) * m.s;
    const bt = parseFloat(cs.borderTopWidth) * m.s;
    ctx.strokeStyle = c[1];
    ctx.lineWidth = spread;
    ctx.strokeRect(x + bl + spread / 2, y + bt + spread / 2, w - bl * 2 - spread, h - bt * 2 - spread);
  }

  if (el instanceof HTMLImageElement) {
    if (el.complete && el.naturalWidth > 0) ctx.drawImage(el, x, y, w, h);
    return;
  }
  if (el instanceof HTMLCanvasElement) {
    if (el.width > 0 && el.height > 0) ctx.drawImage(el, x, y, w, h);
    return;
  }

  for (const child of el.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) paintText(ctx, child as Text, cs, m, a);
    else if (child instanceof Element) paintElement(ctx, child, m, a);
  }
  ctx.globalAlpha = 1;
}

const range = document.createRange();

function paintText(ctx: CanvasRenderingContext2D, node: Text, cs: CSSStyleDeclaration, m: Mapping, alpha: number) {
  const text = node.data;
  if (!text.trim()) return;
  ctx.globalAlpha = alpha;
  ctx.fillStyle = cs.color;
  const size = parseFloat(cs.fontSize) * m.s;
  ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${size}px ${cs.fontFamily}`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  range.selectNodeContents(node);
  const rects = range.getClientRects();
  if (rects.length <= 1) {
    const r = rects[0] ?? range.getBoundingClientRect();
    ctx.fillText(text.trim(), (r.left - m.ox) * m.s, (r.top + r.height / 2 - m.oy) * m.s);
    return;
  }
  // Wrapped text: place each word where the browser laid it out.
  const re = /\S+/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    range.setStart(node, match.index);
    range.setEnd(node, match.index + match[0].length);
    const r = range.getBoundingClientRect();
    ctx.fillText(match[0], (r.left - m.ox) * m.s, (r.top + r.height / 2 - m.oy) * m.s);
  }
}
