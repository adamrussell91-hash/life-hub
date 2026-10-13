import {
  activeLayerIds,
  isAnnotationActive,
  stopsForMode,
  type AnnotationLayerState
} from '@/blocks/annotation-layers';
import {
  arcLanes,
  foldRows,
  lineNumbers,
  threadStops,
  threadsOf,
  type ArcSpan,
  type FoldRow,
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
  return plain.length > 28 ? `${plain.slice(0, 27)}…` : plain;
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

/** Line ids covered by a thread stop (stanza stops expand to every line). */
function lineIdsForStops(
  content: AnnotationContent,
  stops: ThreadStop[]
): Set<string> {
  const lineIds = new Set<string>();
  for (const stop of stops) {
    if (stop.resolved.lineId) {
      lineIds.add(stop.resolved.lineId);
      continue;
    }
    const stanza = content.text.stanzas.find((s) => s.id === stop.resolved.stanzaId);
    for (const line of stanza?.lines ?? []) lineIds.add(line.id);
  }
  return lineIds;
}

function lineNumberForStop(
  content: AnnotationContent,
  stop: ThreadStop,
  numbers: Map<string, number>
): number | undefined {
  if (stop.resolved.lineId) return numbers.get(stop.resolved.lineId);
  const stanza = content.text.stanzas.find((s) => s.id === stop.resolved.stanzaId);
  const first = stanza?.lines[0]?.id;
  return first ? numbers.get(first) : undefined;
}

export function foldRowsForThread(
  content: AnnotationContent,
  annotation: AnnotationItem,
  state: AnnotationLayerState
): FoldRow[] {
  const stops = resolvedThreadStops(content, annotation);
  return foldRows(content.text, lineIdsForStops(content, stops), {
    context: state.context,
    expanded: state.expandedFolds
  });
}

export function threadArcSpans(
  content: AnnotationContent,
  annotation: AnnotationItem
): ArcSpan[] {
  const numbers = lineNumbers(content.text);
  const lineNums = resolvedThreadStops(content, annotation)
    .map((stop) => lineNumberForStop(content, stop, numbers))
    .filter((n): n is number => typeof n === 'number');
  if (lineNums.length < 2) return [];
  return [{ id: annotation.id, start: Math.min(...lineNums), end: Math.max(...lineNums) }];
}

export function lanesForVisibleThreads(
  content: AnnotationContent,
  threads: AnnotationItem[]
): Map<string, number> {
  return arcLanes(threads.flatMap((ann) => threadArcSpans(content, ann)));
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
  chip.className = `block-annotation__thread-chip block-annotation__chip--${layer?.colour ?? 'wave'}`;
  if (focused) chip.classList.add('is-focused');
  chip.dataset.threadId = annotation.id;
  chip.setAttribute('aria-pressed', focused ? 'true' : 'false');
  const short = threadShortTitle(annotation);
  chip.title = `${short} · ${stopCount} stops`;
  chip.textContent = `${short} · ${stopCount}`;
  chip.addEventListener('click', onSelect);
  return chip;
}

export function buildFoldButton(
  fold: Extract<FoldRow, { kind: 'fold' }>,
  expanded: boolean,
  onToggle: () => void
): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'block-annotation__fold';
  btn.dataset.foldId = fold.id;
  btn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
  const label = expanded
    ? `Hide ${fold.count} lines`
    : `Show ${fold.count} hidden lines`;
  btn.setAttribute('aria-label', label);
  btn.textContent = expanded ? `▾ ${fold.count} lines` : `⋯ ${fold.count} lines`;
  btn.addEventListener('click', onToggle);
  return btn;
}

export function buildArcSvg(
  content: AnnotationContent,
  threads: AnnotationItem[],
  layerById: (id: string) => AnnotationLayer | undefined,
  focusedId: string | null
): SVGSVGElement | null {
  const numbers = lineNumbers(content.text);
  const totalLines = [...numbers.values()].reduce((max, n) => Math.max(max, n), 0);
  if (totalLines === 0 || threads.length === 0) return null;

  const lanes = lanesForVisibleThreads(content, threads);
  const laneCount = Math.max(1, new Set(lanes.values()).size);
  const width = 12 + laneCount * 14;
  const lineH = 1.55 * 16; // matches ~text-base line-height
  const height = totalLines * lineH;

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'block-annotation__arcs');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('width', String(width));
  svg.setAttribute('aria-hidden', 'true');
  svg.style.height = `${height}px`;

  for (const ann of threads) {
    const stops = resolvedThreadStops(content, ann);
    if (stops.length === 0) continue;
    const lane = lanes.get(ann.id) ?? 0;
    const x = 8 + lane * 14;
    const colourVar = `--${layerById(ann.layer_id)?.colour ?? 'wave'}`;
    const focused = focusedId === ann.id;

    const points = stops
      .map((stop, index) => {
        const num = lineNumberForStop(content, stop, numbers);
        if (num == null) return null;
        return { x, y: (num - 0.5) * lineH, index };
      })
      .filter((p): p is { x: number; y: number; index: number } => p != null);

    for (let i = 0; i < points.length - 1; i += 1) {
      const a = points[i]!;
      const b = points[i + 1]!;
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute(
        'd',
        `M ${a.x} ${a.y} Q ${x + 10} ${(a.y + b.y) / 2} ${b.x} ${b.y}`
      );
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', `var(${colourVar})`);
      path.setAttribute('stroke-width', focused ? '2' : '1.25');
      path.setAttribute('opacity', focused ? '0.95' : '0.55');
      svg.append(path);
    }

    for (const point of points) {
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', String(point.x));
      circle.setAttribute('cy', String(point.y));
      circle.setAttribute('r', focused ? '5' : '4');
      circle.setAttribute('fill', `var(${colourVar})`);
      svg.append(circle);
      const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      label.setAttribute('x', String(point.x));
      label.setAttribute('y', String(point.y + 3));
      label.setAttribute('text-anchor', 'middle');
      label.setAttribute('class', 'block-annotation__arc-num');
      label.textContent = String(point.index + 1);
      svg.append(label);
    }
  }

  return svg;
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
  pip.setAttribute('aria-label', `Thread stop ${stopIndex + 1}`);
  pip.addEventListener('click', onClick);
  return pip;
}

export function fillStepCaption(
  host: HTMLElement,
  annotation: AnnotationItem,
  stops: ThreadStop[],
  stepIndex: number
): void {
  host.replaceChildren();
  const stop = stops[stepIndex];
  if (!stop) return;
  const meta = document.createElement('p');
  meta.className = 'block-annotation__step-meta';
  meta.textContent = `Stop ${stepIndex + 1} of ${stops.length}`;
  host.append(meta);
  const body = document.createElement('div');
  body.className = 'block-annotation__body';
  const html =
    stop.note_html?.trim() ||
    (stop.isPrimary ? annotation.body.html : '') ||
    annotation.body.html;
  body.innerHTML = sanitizeRichTextHtml(html);
  host.append(body);
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
