import {
  activeLayerIds,
  isAnnotationActive,
  stopsForMode,
  type AnnotationLayerState
} from '@/blocks/annotation-layers';
import {
  lineNumbers,
  threadStops,
  threadsOf,
  type ThreadStop
} from '@/blocks/annotation-thread';
import { sanitizeRichTextHtml } from '@/blocks/sanitize';
import type { AnnotationBlock, AnnotationItem, AnnotationLayer } from '@/schemas/block';

type RenderMode = 'teacher' | 'student' | 'print';
type AnnotationContent = AnnotationBlock['content'];

export function asAnnotationBlock(content: AnnotationContent): AnnotationBlock {
  return { content } as AnnotationBlock;
}

export function threadShortTitle(annotation: AnnotationItem): string {
  const title = annotation.thread?.title?.trim();
  if (title) return title;
  if (annotation.thread?.kind) {
    const label =
      annotation.thread.kind.charAt(0).toUpperCase() + annotation.thread.kind.slice(1);
    return label;
  }
  const plain = annotation.body.html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!plain) return 'Thread';
  return plain.length > 40 ? `${plain.slice(0, 39)}…` : plain;
}

export function placesLabel(count: number): string {
  return count === 1 ? '1 place' : `${count} places`;
}

/** Threads whose layer is currently revealed and not suppressed. */
export function visibleThreads(
  content: AnnotationContent,
  mode: RenderMode,
  state: AnnotationLayerState
): AnnotationItem[] {
  const stops = stopsForMode(content.layers, mode);
  const active = activeLayerIds(stops, state);
  return threadsOf(asAnnotationBlock(content)).filter((ann) =>
    isAnnotationActive(ann, active, state.suppressed)
  );
}

export function resolvedThreadStops(
  content: AnnotationContent,
  annotation: AnnotationItem
): ThreadStop[] {
  return threadStops(annotation, asAnnotationBlock(content)).stops;
}

/** Line ids covered by a thread's places (stanza places expand to every line). */
export function threadLineIds(
  content: AnnotationContent,
  annotation: AnnotationItem
): Set<string> {
  const lineIds = new Set<string>();
  for (const stop of resolvedThreadStops(content, annotation)) {
    if (stop.resolved.lineId) {
      lineIds.add(stop.resolved.lineId);
      continue;
    }
    const stanza = content.text.stanzas.find((s) => s.id === stop.resolved.stanzaId);
    for (const line of stanza?.lines ?? []) lineIds.add(line.id);
  }
  return lineIds;
}

export function isNarrowAnnotationViewport(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(max-width: 720px)').matches;
}

export function buildThreadChip(
  annotation: AnnotationItem,
  layer: AnnotationLayer | undefined,
  stopCount: number,
  focused: boolean,
  onSelect: () => void
): HTMLButtonElement {
  const chip = document.createElement('button');
  chip.type = 'button';
  chip.className = `block-annotation__thread-chip block-annotation__thread-chip--${layer?.colour ?? 'wave'}`;
  if (focused) chip.classList.add('is-focused');
  chip.dataset.threadId = annotation.id;
  chip.setAttribute('aria-pressed', focused ? 'true' : 'false');
  const short = threadShortTitle(annotation);
  chip.title = focused
    ? 'Stop following this thread'
    : `Follow this thread through ${placesLabel(stopCount)} in the text`;
  // A small joined-dots glyph: reads as "linked places", not as a layer toggle.
  const glyph = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  glyph.setAttribute('class', 'block-annotation__thread-glyph');
  glyph.setAttribute('viewBox', '0 0 12 20');
  glyph.setAttribute('aria-hidden', 'true');
  for (const [tag, attrs] of [
    ['path', { d: 'M6 3 V17' }],
    ['circle', { cx: '6', cy: '3', r: '2.4' }],
    ['circle', { cx: '6', cy: '10', r: '2.4' }],
    ['circle', { cx: '6', cy: '17', r: '2.4' }]
  ] as const) {
    const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    glyph.append(el);
  }
  const name = document.createElement('span');
  name.className = 'block-annotation__thread-chip-name';
  name.textContent = short;
  const count = document.createElement('span');
  count.className = 'block-annotation__thread-chip-count';
  count.textContent = placesLabel(stopCount);
  chip.append(glyph, name, count);
  chip.addEventListener('click', onSelect);
  return chip;
}

export function buildStopPip(
  stopIndex: number,
  colour: AnnotationLayer['colour'] | undefined,
  onClick: () => void
): HTMLButtonElement {
  const pip = document.createElement('button');
  pip.type = 'button';
  pip.className = `block-annotation__pip block-annotation__pip--${colour ?? 'wave'}`;
  pip.textContent = String(stopIndex + 1);
  pip.setAttribute('aria-label', `Thread place ${stopIndex + 1}`);
  pip.title = `Place ${stopIndex + 1} in this thread`;
  pip.addEventListener('click', onClick);
  return pip;
}

/**
 * Wrap plain-text offsets [start, end) of a rendered line in highlight spans.
 * Works across nested marks by wrapping each text-node piece on its own.
 */
export function highlightTextRange(
  root: HTMLElement,
  start: number,
  end: number,
  make: () => HTMLElement
): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const pieces: Array<{ node: Text; from: number; to: number }> = [];
  let offset = 0;
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    const len = node.data.length;
    const from = Math.max(start, offset);
    const to = Math.min(end, offset + len);
    if (from < to) pieces.push({ node, from: from - offset, to: to - offset });
    offset += len;
    if (offset >= end) break;
  }
  for (const { node, from, to } of pieces) {
    const target = from > 0 ? node.splitText(from) : node;
    if (to - from < target.data.length) target.splitText(to - from);
    const wrap = make();
    target.replaceWith(wrap);
    wrap.append(target);
  }
}

/**
 * Join the numbered pips of the followed thread with one line in the layer
 * colour, measured from where the pips actually sit so it always lines up.
 */
export function drawThreadLink(
  host: HTMLElement,
  colour: AnnotationLayer['colour'] | undefined
): void {
  host.querySelector(':scope > .block-annotation__thread-link')?.remove();
  const pips = [...host.querySelectorAll<HTMLElement>('.block-annotation__pip')];
  if (pips.length < 2) return;
  const base = host.getBoundingClientRect();
  const points = pips
    .map((pip) => pip.getBoundingClientRect())
    .filter((r) => r.width > 0 && r.height > 0)
    .map((r) => ({ x: r.left - base.left + r.width / 2, y: r.top - base.top + r.height / 2 }));
  if (points.length < 2) return;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'block-annotation__thread-link');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('width', String(base.width));
  svg.setAttribute('height', String(base.height));
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', points.map((p, i) => `${i ? 'L' : 'M'} ${p.x} ${p.y}`).join(' '));
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', `var(--${colour ?? 'wave'})`);
  path.setAttribute('stroke-width', '2.5');
  path.setAttribute('stroke-linecap', 'round');
  svg.append(path);
  host.prepend(svg);
}

/**
 * A place's own note, shown under its line while the thread is followed, so
 * every place can be read without stepping and the note never sits far above
 * the line it explains. The current place carries the step controls.
 */
export function buildStopNote(options: {
  stopIndex: number;
  stopCount: number;
  html?: string;
  colour: AnnotationLayer['colour'] | undefined;
  current: boolean;
  onStep: (delta: -1 | 1) => void;
}): HTMLElement | null {
  const { stopIndex, stopCount, current } = options;
  const html = options.html?.trim();
  if (!html && !current) return null;
  const note = document.createElement('div');
  note.className = `block-annotation__stop-note block-annotation__stop-note--${options.colour ?? 'wave'}`;
  note.dataset.stop = String(stopIndex + 1);
  if (current) note.classList.add('is-current');

  // The numbered pip just above already says which place this is.
  note.setAttribute('aria-label', `Note for place ${stopIndex + 1} of ${stopCount}`);
  note.setAttribute('role', 'group');

  const main = document.createElement('div');
  main.className = 'block-annotation__stop-main';
  if (html) {
    const body = document.createElement('div');
    body.className = 'block-annotation__body';
    body.innerHTML = sanitizeRichTextHtml(html);
    main.append(body);
  }
  if (current) {
    const nav = document.createElement('div');
    nav.className = 'block-annotation__stop-nav';
    const meta = document.createElement('span');
    meta.className = 'block-annotation__step-meta';
    meta.textContent = `Place ${stopIndex + 1} of ${stopCount}`;
    const prev = document.createElement('button');
    prev.type = 'button';
    prev.className = 'block-annotation__stop-step';
    prev.dataset.step = 'previous';
    prev.textContent = '‹ Previous';
    prev.disabled = stopIndex <= 0;
    prev.addEventListener('click', () => options.onStep(-1));
    const next = document.createElement('button');
    next.type = 'button';
    next.className = 'block-annotation__stop-step';
    next.dataset.step = 'next';
    next.textContent = 'Next ›';
    next.disabled = stopIndex >= stopCount - 1;
    next.addEventListener('click', () => options.onStep(1));
    nav.append(meta, prev, next);
    main.append(nav);
  }
  note.append(main);
  return note;
}

export function printThreadFootnoteLabel(
  content: AnnotationContent,
  annotation: AnnotationItem
): string {
  const numbers = lineNumbers(content.text);
  const lines = resolvedThreadStops(content, annotation)
    .map((stop) => (stop.resolved.lineId ? numbers.get(stop.resolved.lineId) : undefined))
    .filter((n): n is number => typeof n === 'number');
  const unique = [...new Set(lines)].sort((a, b) => a - b);
  return `Thread: lines ${unique.join(', ')}`;
}
