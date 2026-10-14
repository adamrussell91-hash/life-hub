import type { AnnotationLineModel } from '@/blocks/annotation-anchor';

/**
 * Formatted poem lines. A line keeps plain `text` (anchors index into it) plus
 * optional inline `html` (strong / em / u only), `align` and `indent`. Every
 * renderer goes through runs so formatting and note highlights never disagree
 * about character offsets.
 */
export type LineRun = {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
};

type RunMarks = Omit<LineRun, 'text'>;

const BOLD_TAGS = new Set(['strong', 'b']);
const ITALIC_TAGS = new Set(['em', 'i']);
const UNDERLINE_TAGS = new Set(['u']);
const DROP_TAGS = new Set(['script', 'style', 'template']);

/** Max indent steps a line can carry (matches the schema). */
export const MAX_LINE_INDENT = 8;

function sameMarks(a: RunMarks, b: RunMarks): boolean {
  return (
    Boolean(a.bold) === Boolean(b.bold) &&
    Boolean(a.italic) === Boolean(b.italic) &&
    Boolean(a.underline) === Boolean(b.underline)
  );
}

function pushRun(runs: LineRun[], text: string, marks: RunMarks): void {
  if (!text) return;
  const last = runs[runs.length - 1];
  if (last && sameMarks(last, marks)) {
    last.text += text;
    return;
  }
  runs.push({
    text,
    ...(marks.bold ? { bold: true } : {}),
    ...(marks.italic ? { italic: true } : {}),
    ...(marks.underline ? { underline: true } : {})
  });
}

/** Walk inline DOM into runs. `<br>` is ignored here (callers split lines first). */
export function runsFromNodes(nodes: Iterable<Node>, inherited: RunMarks = {}): LineRun[] {
  const runs: LineRun[] = [];
  const walk = (node: Node, marks: RunMarks) => {
    if (node.nodeType === Node.TEXT_NODE) {
      pushRun(runs, (node.textContent ?? '').replace(/ /g, ' '), marks);
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as Element;
    const tag = el.tagName.toLowerCase();
    if (DROP_TAGS.has(tag) || tag === 'br') return;
    const style = (el as HTMLElement).style;
    const next: RunMarks = {
      bold:
        marks.bold ||
        BOLD_TAGS.has(tag) ||
        style?.fontWeight === 'bold' ||
        Number(style?.fontWeight) >= 600,
      italic: marks.italic || ITALIC_TAGS.has(tag) || style?.fontStyle === 'italic',
      underline:
        marks.underline ||
        UNDERLINE_TAGS.has(tag) ||
        (style?.textDecoration ?? '').includes('underline')
    };
    for (const child of Array.from(el.childNodes)) walk(child, next);
  };
  for (const node of nodes) walk(node, inherited);
  return runs;
}

function parseInline(html: string): Node[] {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  return Array.from(doc.body.childNodes);
}

function escapeText(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function runsToHtml(runs: LineRun[]): string {
  return runs
    .map((run) => {
      let out = escapeText(run.text);
      if (run.underline) out = `<u>${out}</u>`;
      if (run.italic) out = `<em>${out}</em>`;
      if (run.bold) out = `<strong>${out}</strong>`;
      return out;
    })
    .join('');
}

export function runsHaveFormatting(runs: LineRun[]): boolean {
  return runs.some((run) => run.bold || run.italic || run.underline);
}

/** Keep strong / em / u only; returns '' when nothing is formatted. */
export function sanitizeAnnotationLineHtml(html: string): string {
  const runs = runsFromNodes(parseInline(html));
  return runsHaveFormatting(runs) ? runsToHtml(runs) : '';
}

/**
 * Runs for a stored line. Falls back to plain text whenever the stored html
 * does not spell exactly `line.text`, so a stale html can never shift anchors.
 */
export function lineRuns(line: Pick<AnnotationLineModel, 'text' | 'html'>): LineRun[] {
  if (!line.html) return line.text ? [{ text: line.text }] : [];
  const runs = runsFromNodes(parseInline(line.html));
  const joined = runs.map((run) => run.text).join('');
  if (joined !== line.text) return line.text ? [{ text: line.text }] : [];
  return runs;
}

function wrapRun(run: LineRun, text: string): Node {
  let node: Node = document.createTextNode(text);
  if (run.underline) {
    const u = document.createElement('u');
    u.append(node);
    node = u;
  }
  if (run.italic) {
    const em = document.createElement('em');
    em.append(node);
    node = em;
  }
  if (run.bold) {
    const strong = document.createElement('strong');
    strong.append(node);
    node = strong;
  }
  return node;
}

/** Append the formatted slice [start, end) of the runs to `parent`. */
export function appendRunSlice(
  parent: Node,
  runs: LineRun[],
  start: number,
  end: number
): void {
  let offset = 0;
  for (const run of runs) {
    const runStart = offset;
    const runEnd = offset + run.text.length;
    offset = runEnd;
    const from = Math.max(start, runStart);
    const to = Math.min(end, runEnd);
    if (from >= to) continue;
    parent.appendChild(wrapRun(run, run.text.slice(from - runStart, to - runStart)));
  }
}

export type LineSpan = {
  start: number;
  end: number;
  /** Returns the element that wraps this span (button, mark, span). */
  wrap: () => HTMLElement;
};

/**
 * Render a formatted line with spans wrapped (note anchors, highlights).
 * Overlapping spans after the first are skipped, as before.
 */
export function renderFormattedLine(
  line: Pick<AnnotationLineModel, 'text' | 'html'>,
  spans: LineSpan[] = []
): DocumentFragment {
  const frag = document.createDocumentFragment();
  const runs = lineRuns(line);
  const total = line.text.length;
  const sorted = [...spans]
    .filter((span) => span.start < span.end && span.start >= 0 && span.end <= total)
    .sort((a, b) => a.start - b.start || b.end - a.end);
  let cursor = 0;
  for (const span of sorted) {
    if (span.start < cursor) continue;
    if (span.start > cursor) appendRunSlice(frag, runs, cursor, span.start);
    const wrapper = span.wrap();
    appendRunSlice(wrapper, runs, span.start, span.end);
    frag.append(wrapper);
    cursor = span.end;
  }
  if (cursor < total) appendRunSlice(frag, runs, cursor, total);
  if (total === 0) frag.append(document.createTextNode(' '));
  return frag;
}

/** Apply a line's alignment and indent to its text element. */
export function applyLineLayout(
  el: HTMLElement,
  line: Pick<AnnotationLineModel, 'align' | 'indent'>
): void {
  if (line.align && line.align !== 'left') el.style.textAlign = line.align;
  const indent = Math.max(0, Math.min(MAX_LINE_INDENT, line.indent ?? 0));
  if (indent > 0) {
    el.dataset.indent = String(indent);
    el.style.paddingInlineStart = `${indent * 2}em`;
  }
}

/**
 * Plain-text offset of (node, offset) inside `root`, counting only text nodes.
 * Used to turn a DOM selection on a formatted line back into `line.text` offsets.
 */
export function textOffsetWithin(root: Node, node: Node, offset: number): number | null {
  if (!root.contains(node)) return null;
  const range = document.createRange();
  range.setStart(root, 0);
  try {
    range.setEnd(node, offset);
  } catch {
    return null;
  }
  return range.toString().length;
}
