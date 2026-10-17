/**
 * Ruled "pen" ink for the annotation view: straight lines, right angles and
 * brackets drawn in one SVG layer over the poem. The anchor buttons stay the
 * click targets; the ink only shows where the notes are.
 *
 * - word    → a box round the word
 * - phrase  → a straight underline (fineliner) or a flat band (highlighter)
 * - line    → a square bracket in the line margin
 * - stanza  → a tall square bracket with a centre tick
 * - margin  → short notes in the right margin (fineliner, wide only). An opened
 *              note's card joins the same column at its line, any ink style. When the
 *             notes crowd each other they fold to one-line previews; the
 *             selected note opens in full and the other marks fade back.
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
  /** Margin note (fineliner, wide only); omitted = no note. */
  label?: string;
  /** Clicking the margin note runs this (selects the note, or opens the reader). */
  onOpen?: () => void;
};

function rel(rect: DOMRect, base: DOMRect): InkRect {
  return { x: rect.left - base.left, y: rect.top - base.top, w: rect.width, h: rect.height };
}

/** Width below which margin labels fold away (phone, narrow columns). */
export const MARGIN_LABEL_MIN_WIDTH = 640;

/** Margin notes grow into free space beside the poem, between these widths. */
const MARGIN_NOTE_MIN_WIDTH = 208;
const MARGIN_NOTE_MAX_WIDTH = 320;

/** An opened note joins the margin stack as a wider card. */
const MARGIN_PANEL_MIN_WIDTH = 288;
const MARGIN_PANEL_MAX_WIDTH = 400;

/** The open note's card, when the view has parked it in this poem's margin. */
export function marginPanelOf(host: HTMLElement): HTMLElement | null {
  for (const child of Array.from(host.children)) {
    if (child instanceof HTMLElement && child.classList.contains('block-annotation__panel') && !child.hidden) {
      return child;
    }
  }
  return null;
}

/**
 * Draw ink for `marks` into `host` (position: relative). Returns the ids drawn
 * so the caller can animate only marks that are new since the last paint.
 */
export function drawAnnotationInk(
  host: HTMLElement,
  marks: InkMark[],
  options: { style: AnnotationInkStyle; animateIds?: Set<string>; activeId?: string | null }
): Set<string> {
  host.querySelectorAll(':scope > .block-annotation__ink, :scope > .block-annotation__margin-note').forEach((el) =>
    el.remove()
  );
  host.classList.remove('has-active-note');
  const drawn = new Set<string>();
  const panel = marginPanelOf(host);
  const panelId = panel?.dataset.annotationId;
  const base = host.getBoundingClientRect();
  if (base.width === 0 || marks.length === 0) return drawn;
  const activeId = options.activeId ?? null;

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
    if (mark.annotationId === activeId) path.classList.add('is-active');
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
    if (mark.label && mark.annotationId !== panelId) labels.push({ mark, y: rects[0]!.y });
  }

  const showLabels = options.style === 'fineliner' && labels.length > 0;
  if (!showLabels) labels.length = 0;
  const openAnchor = panel
    ? host.querySelector<HTMLElement>('.block-annotation__anchor.is-open')
    : null;
  const panelY = openAnchor ? rel(openAnchor.getBoundingClientRect(), base).y : 0;

  if (base.width >= MARGIN_LABEL_MIN_WIDTH && (labels.length > 0 || panel)) {
    const notes = labels.map(({ mark }) => {
      const opens = Boolean(mark.onOpen);
      const note = document.createElement(opens ? 'button' : 'span');
      note.className = `block-annotation__margin-note block-annotation__ink--${mark.colour}`;
      note.dataset.annotationId = mark.annotationId;
      note.textContent = mark.label!;
      if (opens) {
        const btn = note as HTMLButtonElement;
        btn.type = 'button';
        btn.title = mark.label!;
        btn.addEventListener('click', mark.onOpen!);
      }
      if (mark.annotationId === activeId) note.classList.add('is-active');
      if (!reduced && options.animateIds?.has(mark.annotationId)) note.classList.add('is-drawing');
      host.append(note);
      return note;
    });
    // Labels sit a short gap after the longest line, not at the far edge, and
    // use the free width beside the poem so previews show more of each note.
    let textRight = 0;
    host.querySelectorAll<HTMLElement>('.block-annotation__line-text').forEach((line) => {
      const range = document.createRange();
      range.selectNodeContents(line);
      for (const r of Array.from(range.getClientRects())) {
        textRight = Math.max(textRight, r.right - base.left);
      }
    });
    const minWidth = panel ? MARGIN_PANEL_MIN_WIDTH : MARGIN_NOTE_MIN_WIDTH;
    const left = Math.max(0, Math.min(textRight + 40, base.width - minWidth - 8));
    const width = Math.max(MARGIN_NOTE_MIN_WIDTH, Math.min(MARGIN_NOTE_MAX_WIDTH, base.width - left - 8));
    notes.forEach((note) => {
      note.style.width = `${width}px`;
      note.style.maxWidth = `${width}px`;
    });
    if (panel) {
      const panelWidth = Math.max(minWidth, Math.min(MARGIN_PANEL_MAX_WIDTH, base.width - left - 8));
      panel.style.width = `${panelWidth}px`;
      panel.style.left = `${left}px`;
    }
    // The open note takes its place in line order; the notes below it move down.
    const stack = () => {
      const rows = labels.map((row, i) => ({ y: row.y, h: notes[i]!.offsetHeight || 20 }));
      if (panel) rows.push({ y: panelY, h: panel.offsetHeight || 120 });
      return stackLabels(rows);
    };
    let tops = stack();
    // Crowded notes run together: fold all but the selected one to a single line.
    const crowded = labels.some((row, i) => tops[i]! > row.y + 2);
    if (crowded) {
      notes.forEach((note) => {
        if (!note.classList.contains('is-active')) note.classList.add('is-collapsed');
      });
      tops = stack();
    }
    notes.forEach((note) => {
      if (note.tagName !== 'BUTTON') return;
      const collapsed = note.classList.contains('is-collapsed');
      note.setAttribute('aria-expanded', crowded ? String(!collapsed) : 'true');
      note.setAttribute('aria-label', `${collapsed ? 'Show' : 'Note'}: ${note.textContent}`);
    });
    notes.forEach((note, i) => {
      note.style.top = `${tops[i]}px`;
      note.style.left = `${left}px`;
      note.style.right = 'auto';
      const lead = document.createElementNS(SVG_NS, 'path');
      const y = snap(tops[i]! + 10);
      lead.setAttribute('d', `M${snap(left - 18)} ${y} H${snap(left - 6)}`);
      lead.setAttribute('class', `block-annotation__ink-lead block-annotation__ink--${labels[i]!.mark.colour}`);
      lead.dataset.annotationId = labels[i]!.mark.annotationId;
      if (labels[i]!.mark.annotationId === activeId) lead.classList.add('is-active');
      svg.append(lead);
    });
    let lowest = Math.max(0, ...notes.map((note, i) => tops[i]! + note.offsetHeight));
    if (panel) {
      const top = tops[labels.length]!;
      panel.style.top = `${top}px`;
      const lead = document.createElementNS(SVG_NS, 'path');
      const y = snap(top + 18);
      lead.setAttribute('d', `M${snap(left - 18)} ${y} H${snap(left - 6)}`);
      lead.setAttribute('class', `block-annotation__ink-lead block-annotation__ink--${panel.dataset.colour ?? 'wave'} is-active`);
      svg.append(lead);
      lowest = Math.max(lowest, top + (panel.offsetHeight || 120));
    }
    fitMarginNotes(host, lowest);
  } else {
    fitMarginNotes(host, 0);
  }
  if (activeId && drawn.has(activeId)) host.classList.add('has-active-note');
  return drawn;
}

/** Notes are absolute, so a wrapped note must lengthen the poem or it falls into the next row. */
function fitMarginNotes(host: HTMLElement, lowest: number): void {
  const stanzas = host.querySelector('.block-annotation__stanzas');
  const top = host.getBoundingClientRect().top;
  const contentBottom = stanzas ? stanzas.getBoundingClientRect().bottom - top : 0;
  const extra = Math.ceil(lowest - contentBottom);
  const next = extra > 0 ? `${extra + 8}px` : '';
  if (host.style.paddingBottom !== next) host.style.paddingBottom = next;
}
