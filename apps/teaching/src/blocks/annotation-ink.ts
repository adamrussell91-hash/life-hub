/**
 * Ruled "pen" ink for the annotation view: straight lines, right angles and
 * brackets drawn in one SVG layer over the poem. The anchor buttons stay the
 * click targets; the ink only shows where the notes are.
 *
 * - word    → a box round the word
 * - phrase  → a straight underline (fineliner) or a flat band (highlighter)
 * - line    → a square bracket in the line margin
 * - stanza  → a tall square bracket with a centre tick
 * - margin  → short handwritten labels in the right margin (fineliner, wide only)
 */
import type { AnnotationColour } from '@/schemas/block';

export type AnnotationInkStyle = 'fineliner' | 'highlighter';

export type InkRect = { x: number; y: number; w: number; h: number };

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Snap to half pixels so 1.5px strokes stay crisp. */
const snap = (n: number) => Math.round(n * 2) / 2;

export function boxPath(r: InkRect): string {
  const x1 = snap(r.x - 2);
  const x2 = snap(r.x + r.w + 2);
  const y1 = snap(r.y + 1);
  const y2 = snap(r.y + r.h - 1);
  return `M${x1} ${y1} H${x2} V${y2} H${x1} Z`;
}

export function underlinePath(r: InkRect): string {
  const y = snap(r.y + r.h - 1);
  return `M${snap(r.x - 1)} ${y} H${snap(r.x + r.w + 1)}`;
}

export function bandPath(r: InkRect): string {
  const x1 = snap(r.x - 2);
  const x2 = snap(r.x + r.w + 2);
  const y1 = snap(r.y + r.h * 0.2);
  const y2 = snap(r.y + r.h - 2);
  return `M${x1} ${y1} H${x2} V${y2} H${x1} Z`;
}

export function bracketPath(top: number, bottom: number, x: number, arm = 6): string {
  return `M${snap(x + arm)} ${snap(top)} H${snap(x)} V${snap(bottom)} H${snap(x + arm)}`;
}

export function stanzaBracketPath(top: number, bottom: number, x: number): string {
  const mid = snap((top + bottom) / 2);
  return `${bracketPath(top, bottom, x, 7)} M${snap(x)} ${mid} H${snap(x - 6)}`;
}

/** Spread labels down the margin so none overlap; keeps input order by y. */
export function stackLabels(
  wanted: Array<{ y: number; h: number }>,
  gap = 6
): number[] {
  const order = wanted.map((w, i) => ({ ...w, i })).sort((a, b) => a.y - b.y);
  const out = new Array<number>(wanted.length);
  let bottom = -Infinity;
  for (const row of order) {
    const y = Math.max(row.y, bottom + gap);
    out[row.i] = y;
    bottom = y + row.h;
  }
  return out;
}

export type InkMark = {
  annotationId: string;
  kind: 'word' | 'phrase' | 'line' | 'stanza';
  colour: AnnotationColour;
  el: HTMLElement;
  /** Short handwritten margin label (fineliner only); omitted = no label. */
  label?: string;
  onOpen: () => void;
};

function rel(rect: DOMRect, base: DOMRect): InkRect {
  return { x: rect.left - base.left, y: rect.top - base.top, w: rect.width, h: rect.height };
}

/** Width below which margin labels fold away (phone, narrow columns). */
export const MARGIN_LABEL_MIN_WIDTH = 640;

/**
 * Draw ink for `marks` into `host` (position: relative). Returns the ids drawn
 * so the caller can animate only marks that are new since the last paint.
 */
export function drawAnnotationInk(
  host: HTMLElement,
  marks: InkMark[],
  options: { style: AnnotationInkStyle; animateIds?: Set<string> }
): Set<string> {
  host.querySelectorAll(':scope > .block-annotation__ink, :scope > .block-annotation__margin-note').forEach((el) =>
    el.remove()
  );
  const drawn = new Set<string>();
  const base = host.getBoundingClientRect();
  if (base.width === 0 || marks.length === 0) return drawn;

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'block-annotation__ink');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('width', String(base.width));
  svg.setAttribute('height', String(base.height));
  svg.setAttribute('viewBox', `0 0 ${base.width} ${base.height}`);
  host.append(svg);

  const reduced =
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  let delay = 0;

  const add = (d: string, mark: InkMark, kind: 'stroke' | 'band') => {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', d);
    path.setAttribute('class', `block-annotation__ink-${kind} block-annotation__ink--${mark.colour}`);
    path.dataset.annotationId = mark.annotationId;
    if (kind === 'band') svg.prepend(path);
    else svg.append(path);
    const animate = !reduced && options.animateIds?.has(mark.annotationId);
    if (!animate) return;
    path.classList.add('is-drawing');
    path.style.setProperty('--ink-delay', `${delay}ms`);
    if (kind === 'stroke') {
      let len = 200;
      try {
        len = Math.ceil(path.getTotalLength()) || len;
      } catch {
        /* happy-dom and old engines lack getTotalLength */
      }
      path.style.setProperty('--ink-len', String(len));
    }
    delay += 90;
  };

  const labels: Array<{ mark: InkMark; y: number }> = [];

  for (const mark of marks) {
    const rects = Array.from(mark.el.getClientRects())
      .filter((r) => r.width > 1 && r.height > 1)
      .map((r) => rel(r, base));
    if (rects.length === 0) continue;
    drawn.add(mark.annotationId);

    if (mark.kind === 'line' || mark.kind === 'stanza') {
      const r = rects[0]!;
      const x = r.x + r.w / 2 - 2;
      add(
        mark.kind === 'stanza'
          ? stanzaBracketPath(r.y + 2, r.y + r.h - 2, x)
          : bracketPath(r.y + 2, r.y + r.h - 2, x),
        mark,
        'stroke'
      );
    } else {
      for (const r of rects) {
        if (mark.kind === 'word') add(boxPath(r), mark, 'stroke');
        else if (options.style === 'highlighter') add(bandPath(r), mark, 'band');
        else add(underlinePath(r), mark, 'stroke');
      }
    }
    if (mark.label) labels.push({ mark, y: rects[0]!.y });
  }

  if (options.style === 'fineliner' && base.width >= MARGIN_LABEL_MIN_WIDTH && labels.length > 0) {
    const buttons = labels.map(({ mark }) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `block-annotation__margin-note block-annotation__ink--${mark.colour}`;
      btn.dataset.annotationId = mark.annotationId;
      btn.textContent = mark.label!;
      btn.title = mark.label!;
      btn.setAttribute('aria-label', `Open note: ${mark.label}`);
      btn.addEventListener('click', mark.onOpen);
      if (!reduced && options.animateIds?.has(mark.annotationId)) btn.classList.add('is-drawing');
      host.append(btn);
      return btn;
    });
    const tops = stackLabels(
      labels.map((row, i) => ({ y: row.y, h: buttons[i]!.offsetHeight || 22 }))
    );
    // Labels sit a short gap after the longest line, not at the far edge.
    let textRight = 0;
    host.querySelectorAll<HTMLElement>('.block-annotation__line-text').forEach((line) => {
      const range = document.createRange();
      range.selectNodeContents(line);
      for (const r of Array.from(range.getClientRects())) {
        textRight = Math.max(textRight, r.right - base.left);
      }
    });
    const labelWidth = buttons[0]?.offsetWidth || 208;
    const left = Math.max(0, Math.min(textRight + 40, base.width - labelWidth));
    buttons.forEach((btn, i) => {
      btn.style.top = `${tops[i]}px`;
      btn.style.left = `${left}px`;
      btn.style.right = 'auto';
      const lead = document.createElementNS(SVG_NS, 'path');
      const y = snap(tops[i]! + 11);
      lead.setAttribute('d', `M${snap(left - 18)} ${y} H${snap(left - 6)}`);
      lead.setAttribute('class', `block-annotation__ink-lead block-annotation__ink--${labels[i]!.mark.colour}`);
      svg.append(lead);
    });
  }
  return drawn;
}
