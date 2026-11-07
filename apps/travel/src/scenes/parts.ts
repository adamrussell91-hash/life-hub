/** Shared bits for the city scenes. A wheel with a hub and crossed spokes so
 * the spin reads; `dir` -1 for vehicles heading left. */
export function wheel(cx: number, cy: number, r: number, dir: 1 | -1 = 1, hub = '#b9bec4'): string {
  const s = r * 0.62;
  return `<g class="${dir > 0 ? 'a-wheel' : 'a-wheel-rev'}"><circle cx="${cx}" cy="${cy}" r="${r}" fill="#1b1b1b"/><circle cx="${cx}" cy="${cy}" r="${s}" fill="${hub}"/><path d="M${cx - s} ${cy}h${2 * s}M${cx} ${cy - s}v${2 * s}" stroke="#1b1b1b" stroke-width="${Math.max(1, r / 5)}"/><circle cx="${cx}" cy="${cy}" r="${r * 0.18}" fill="#1b1b1b"/></g>`;
}
