/** Shared bits for the city scenes. A wheel with a hub and crossed spokes so
 * the spin reads; `dir` -1 for vehicles heading left. */
export function wheel(cx: number, cy: number, r: number, dir: 1 | -1 = 1, hub = '#b9bec4'): string {
  const s = r * 0.62;
  return `<g class="${dir > 0 ? 'a-wheel' : 'a-wheel-rev'}"><circle cx="${cx}" cy="${cy}" r="${r}" fill="#1b1b1b"/><circle cx="${cx}" cy="${cy}" r="${s}" fill="${hub}"/><path d="M${cx - s} ${cy}h${2 * s}M${cx} ${cy - s}v${2 * s}" stroke="#1b1b1b" stroke-width="${Math.max(1, r / 5)}"/><circle cx="${cx}" cy="${cy}" r="${r * 0.18}" fill="#1b1b1b"/></g>`;
}

/** Side-view airliner facing right, about 86 wide, origin at the tail.
 * `trail` adds a fading contrail behind it (needs a gTrail-style gradient id). */
export function plane(ink: string, trailId?: string): string {
  const trail = trailId
    ? `<rect x="-150" y="9" width="152" height="2.5" rx="1.25" fill="url(#${trailId})"/><rect x="-120" y="14" width="122" height="2" rx="1" fill="url(#${trailId})"/>`
    : '';
  return `${trail}<path d="M4 6l-6-16h9l14 16z" fill="#e9eef3"/>
      <path d="M2 12q0-7 9-7h54q12 0 19 7q-7 7-19 7H11q-9 0-9-7z" fill="#fff"/>
      <path d="M72 7q7 1 11 4h-10q-2-2-1-4z" fill="${ink}" opacity=".8"/>
      <g fill="${ink}" opacity=".6"><circle cx="22" cy="10.5" r="1.4"/><circle cx="29" cy="10.5" r="1.4"/><circle cx="36" cy="10.5" r="1.4"/><circle cx="43" cy="10.5" r="1.4"/><circle cx="50" cy="10.5" r="1.4"/><circle cx="57" cy="10.5" r="1.4"/><circle cx="64" cy="10.5" r="1.4"/></g>
      <path d="M34 14l-12 15h9l20-15z" fill="#d7dee6"/>
      <rect x="30" y="17" width="12" height="5" rx="2.5" fill="#c3ccd6"/>`;
}

/** A swaying pine with a leaning red-brown trunk. */
export function pine(x: number, base: number, h: number, delay = 0): string {
  const top = base - h;
  return `<g class="a-sway" style="animation-delay:${delay}s"><path d="M${x} ${base}q-4-${h * 0.5} 6-${h * 0.85}l3 1q-8 ${h * 0.4}-5 ${h * 0.84}z" fill="#7a3b22"/><g fill="#24503a"><ellipse cx="${x + 6}" cy="${top + 8}" rx="${h * 0.32}" ry="${h * 0.1}"/><ellipse cx="${x + 2}" cy="${top + h * 0.3}" rx="${h * 0.38}" ry="${h * 0.11}"/><ellipse cx="${x + 9}" cy="${top + h * 0.5}" rx="${h * 0.3}" ry="${h * 0.09}"/></g></g>`;
}
