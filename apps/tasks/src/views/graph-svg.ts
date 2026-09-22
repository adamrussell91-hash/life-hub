export const SVG_NS = 'http://www.w3.org/2000/svg';

export function svgEl<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number | undefined> = {},
  parent?: Element | null
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value !== undefined) node.setAttribute(key, String(value));
  }
  parent?.append(node);
  return node;
}

export function token(name: string, fallback: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

export const EASE = 'cubic-bezier(.2,.8,.2,1)';
export const OVERSHOOT = 'cubic-bezier(.34,1.3,.64,1)';

export function drawIn(path: SVGPathElement, delay: number, duration: number, reduced: boolean): void {
  if (reduced) return;
  const length = typeof path.getTotalLength === 'function' ? path.getTotalLength() : 0;
  if (!length || typeof path.animate !== 'function') return;
  path.style.strokeDasharray = String(length);
  path.style.strokeDashoffset = String(length);
  const clear = () => {
    path.style.strokeDasharray = '';
    path.style.strokeDashoffset = '';
  };
  const anim = path.animate([{ strokeDashoffset: String(length) }, { strokeDashoffset: '0' }], {
    duration,
    delay,
    easing: EASE,
    fill: 'forwards'
  });
  anim.addEventListener?.('finish', clear);
  window.setTimeout(clear, delay + duration + 16);
}

export function popIn(
  el: Element,
  delay: number,
  kind: 'pop' | 'slide' | 'rise' | 'fade',
  reduced: boolean
): void {
  if (reduced) {
    if (kind === 'fade' || kind === 'rise') {
      (el as HTMLElement).style.opacity = '1';
    }
    return;
  }
  if (typeof el.animate !== 'function') return;
  const from =
    kind === 'slide'
      ? { opacity: 0, transform: 'translateX(-8px)' }
      : kind === 'rise'
        ? { opacity: 0, transform: 'translateY(8px)' }
        : kind === 'fade'
          ? { opacity: 0 }
          : { opacity: 0, transform: 'scale(.6)' };
  const duration = kind === 'slide' ? 260 : kind === 'pop' ? 320 : 260;
  el.animate([from, { opacity: 1, transform: 'none' }], {
    duration,
    delay,
    easing: kind === 'pop' ? OVERSHOOT : EASE,
    fill: 'backwards'
  });
}
