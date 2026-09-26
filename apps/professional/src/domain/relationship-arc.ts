/**
 * Relationship arc SVG (Phase 1.5). Fixed 86px height; collision-checked labels.
 */

export interface ArcPoint {
  id: string;
  at: string;
  label: string;
}

export interface ArcRenderPoint {
  id: string;
  x: number;
  y: number;
  label: string;
  labelX: number;
  labelY: number;
  showLabel: boolean;
}

const WIDTH = 900;
const HEIGHT = 86;
const PAD_X = 24;
const PAD_TOP = 18;
const PAD_BOTTOM = 14;
const LABEL_H = 12;

function yForIndex(i: number, n: number): number {
  if (n <= 1) return HEIGHT - PAD_BOTTOM - 8;
  const t = i / (n - 1);
  return HEIGHT - PAD_BOTTOM - 8 - t * (HEIGHT - PAD_TOP - PAD_BOTTOM - 16);
}

/**
 * Place labels with a simple collision pass: flip above/below, then hide.
 */
export function layoutRelationshipArc(points: ArcPoint[]): {
  width: number;
  height: number;
  path: string;
  areaPath: string;
  points: ArcRenderPoint[];
} {
  const sorted = [...points].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const n = sorted.length;
  if (n === 0) {
    return { width: WIDTH, height: HEIGHT, path: '', areaPath: '', points: [] };
  }

  const placed: ArcRenderPoint[] = sorted.map((p, i) => {
    const x = PAD_X + (n === 1 ? (WIDTH - 2 * PAD_X) / 2 : (i / (n - 1)) * (WIDTH - 2 * PAD_X));
    const y = yForIndex(i, n);
    return {
      id: p.id,
      x,
      y,
      label: p.label,
      labelX: x,
      labelY: y - 10,
      showLabel: true
    };
  });

  // Collision: if two labels' approximate boxes overlap, flip then hide.
  const approxWidth = (label: string) => Math.min(160, 6 + label.length * 6.2);
  for (let i = 1; i < placed.length; i++) {
    const prev = placed[i - 1]!;
    const cur = placed[i]!;
    if (!prev.showLabel) continue;
    const overlap =
      Math.abs(cur.labelX - prev.labelX) < (approxWidth(prev.label) + approxWidth(cur.label)) / 2 &&
      Math.abs(cur.labelY - prev.labelY) < LABEL_H + 2;
    if (!overlap) continue;
    // Flip current below the point
    cur.labelY = cur.y + 14;
    const still =
      Math.abs(cur.labelX - prev.labelX) < (approxWidth(prev.label) + approxWidth(cur.label)) / 2 &&
      Math.abs(cur.labelY - prev.labelY) < LABEL_H + 2;
    if (still) cur.showLabel = false;
  }

  const path = placed.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const last = placed[placed.length - 1]!;
  const first = placed[0]!;
  const areaPath = `${path} L${last.x.toFixed(1)} ${HEIGHT} L${first.x.toFixed(1)} ${HEIGHT} Z`;

  return { width: WIDTH, height: HEIGHT, path, areaPath, points: placed };
}

export function renderRelationshipArcSvg(points: ArcPoint[]): SVGSVGElement {
  const layout = layoutRelationshipArc(points);
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${layout.width} ${layout.height}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', String(HEIGHT));
  svg.setAttribute('aria-hidden', 'true');
  svg.style.height = `${HEIGHT}px`;

  if (!layout.path) {
    return svg;
  }

  const area = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  area.setAttribute('d', layout.areaPath);
  area.setAttribute('fill', '#376fb7');
  area.setAttribute('fill-opacity', '0.08');
  area.setAttribute('stroke', 'none');
  svg.append(area);

  const line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  line.setAttribute('d', layout.path);
  line.setAttribute('fill', 'none');
  line.setAttribute('stroke', '#376fb7');
  line.setAttribute('stroke-width', '2.5');
  svg.append(line);

  for (const p of layout.points) {
    const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    c.setAttribute('cx', String(p.x));
    c.setAttribute('cy', String(p.y));
    c.setAttribute('r', '5');
    c.setAttribute('fill', '#17375e');
    svg.append(c);
    if (p.showLabel) {
      const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      t.setAttribute('x', String(p.labelX));
      t.setAttribute('y', String(p.labelY));
      t.setAttribute('text-anchor', 'middle');
      t.setAttribute('font-family', 'Inter, system-ui, sans-serif');
      t.setAttribute('font-size', '11');
      t.setAttribute('fill', '#6b7788');
      t.textContent = p.label;
      svg.append(t);
    }
  }

  return svg;
}

export const ARC_HEIGHT_PX = HEIGHT;
