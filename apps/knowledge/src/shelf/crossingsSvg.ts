/**
 * Bridges and border roads between linked books, as SVG for a map's screen-space line
 * layer. `w` is the deck's half-width in screen pixels, so callers scale it with zoom;
 * `extra` adds state classes (" is-on", " is-dim").
 */
type Pt = { x: number; y: number };
const f = (n: number) => n.toFixed(1);

export function bridgeSvg(kind: "rope" | "stone", a: Pt, b: Pt, w: number, extra = ""): string {
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const ux = (b.x - a.x) / len;
  const uy = (b.y - a.y) / len;
  const nx = -uy;
  const ny = ux;
  // Each end runs a little onto land so the bridge sits on the shore.
  const A = { x: a.x - ux * w * 1.5, y: a.y - uy * w * 1.5 };
  const B = { x: b.x + ux * w * 1.5, y: b.y + uy * w * 1.5 };
  const L = len + w * 3;
  const at = (t: number, side: number) => ({ x: A.x + (B.x - A.x) * t + nx * w * side, y: A.y + (B.y - A.y) * t + ny * w * side });
  let svg = "";
  if (kind === "stone") {
    const [p1, p2, p3, p4] = [at(0, 1), at(1, 1), at(1, -1), at(0, -1)];
    svg += `<path class="map-bridge__deck" d="M${f(p1.x)},${f(p1.y)}L${f(p2.x)},${f(p2.y)}L${f(p3.x)},${f(p3.y)}L${f(p4.x)},${f(p4.y)}Z"/>`;
    const arches = Math.max(2, Math.round(L / (w * 4.5)));
    for (let i = 0; i < arches; i += 1) {
      const s = at((i + 0.15) / arches, -1);
      const e = at((i + 0.85) / arches, -1);
      const m = { x: (s.x + e.x) / 2 - nx * w, y: (s.y + e.y) / 2 - ny * w };
      svg += `<path class="map-bridge__arch" d="M${f(s.x)},${f(s.y)}Q${f(m.x)},${f(m.y)} ${f(e.x)},${f(e.y)}"/>`;
    }
  } else {
    // A rope bridge sags; planks hang between its two ropes.
    const sag = { x: (A.x + B.x) / 2 - nx * w, y: (A.y + B.y) / 2 - ny * w };
    const point = (t: number) => {
      const s = 1 - t;
      return { x: s * s * A.x + 2 * s * t * sag.x + t * t * B.x, y: s * s * A.y + 2 * s * t * sag.y + t * t * B.y };
    };
    for (const side of [-0.45, 0.45]) {
      const o = { x: nx * w * side, y: ny * w * side };
      svg += `<path class="map-bridge__rope" d="M${f(A.x + o.x)},${f(A.y + o.y)}Q${f(sag.x + o.x)},${f(sag.y + o.y)} ${f(B.x + o.x)},${f(B.y + o.y)}"/>`;
    }
    const planks = Math.max(3, Math.round(L / Math.max(3, w * 1.1)));
    for (let i = 1; i < planks; i += 1) {
      const p = point(i / planks);
      svg += `<path class="map-bridge__plank" d="M${f(p.x + nx * w * 0.55)},${f(p.y + ny * w * 0.55)}L${f(p.x - nx * w * 0.55)},${f(p.y - ny * w * 0.55)}"/>`;
    }
  }
  return `<g class="map-bridge map-bridge--${kind}${extra}">${svg}</g>`;
}

/** The road over the border between two joined books: a paper casing under a dashed ink line, a town at each end. */
export function borderRoadSvg(a: Pt, b: Pt, w: number, extra = ""): string {
  const c = { x: (a.x + b.x) / 2 + (b.y - a.y) * 0.08, y: (a.y + b.y) / 2 - (b.x - a.x) * 0.08 };
  const d = `M${f(a.x)},${f(a.y)}Q${f(c.x)},${f(c.y)} ${f(b.x)},${f(b.y)}`;
  const towns = [a, b].map(p => `<circle class="map-road__town" cx="${f(p.x)}" cy="${f(p.y)}" r="${f(Math.max(2, w * 0.7))}"/>`).join("");
  return `<g class="map-road${extra}"><path class="map-road__casing" d="${d}" style="stroke-width:${f(w * 1.6)}px"/><path class="map-road__line" d="${d}"/>${towns}</g>`;
}
