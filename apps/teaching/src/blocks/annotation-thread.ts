import { resolveAnnotation, type ResolvedAnchor } from '@/blocks/annotation-anchor';
import type {
  AnnotationAnchor,
  AnnotationBlock,
  AnnotationItem
} from '@/schemas/block';

type AnnotationText = AnnotationBlock['content']['text'];

export type ThreadStop = {
  anchorId: string;
  anchor: AnnotationAnchor;
  resolved: ResolvedAnchor;
  note_html?: string;
  isPrimary: boolean;
};

export type ThreadOrphan = {
  anchorId: string;
  annotationId: string;
  isPrimary: boolean;
};

export type FoldLineRow = {
  kind: 'line';
  lineId: string;
  stanzaId: string;
  number: number;
};

export type FoldBarRow = {
  kind: 'fold';
  id: string;
  count: number;
  lineIds: string[];
  stanzaId: string;
};

export type FoldRow = FoldLineRow | FoldBarRow;

export type ArcSpan = {
  id: string;
  /** Inclusive start line number (1-based). */
  start: number;
  /** Inclusive end line number (1-based). */
  end: number;
};

/** Annotations that are threads (have at least one also_anchor). */
export function threadsOf(block: AnnotationBlock): AnnotationItem[] {
  return block.content.annotations.filter(
    (ann) => (ann.also_anchors?.length ?? 0) > 0
  );
}

function allAnchors(annotation: AnnotationItem): Array<{
  anchor: AnnotationAnchor;
  isPrimary: boolean;
}> {
  return [
    { anchor: annotation.anchor, isPrimary: true },
    ...(annotation.also_anchors ?? []).map((anchor) => ({
      anchor,
      isPrimary: false
    }))
  ];
}

/** 1-based line numbers across the whole text, derived, never stored. */
export function lineNumbers(text: AnnotationText): Map<string, number> {
  const map = new Map<string, number>();
  let n = 1;
  for (const stanza of text.stanzas) {
    for (const line of stanza.lines) {
      map.set(line.id, n);
      n += 1;
    }
  }
  return map;
}

function stanzaFirstLineNumber(
  text: AnnotationText,
  stanzaId: string,
  numbers: Map<string, number>
): number {
  const stanza = text.stanzas.find((row) => row.id === stanzaId);
  const first = stanza?.lines[0]?.id;
  return first ? (numbers.get(first) ?? Number.MAX_SAFE_INTEGER) : Number.MAX_SAFE_INTEGER;
}

function stopLineNumber(
  stop: ThreadStop,
  text: AnnotationText,
  numbers: Map<string, number>
): number {
  if (stop.resolved.lineId != null) {
    return (
      numbers.get(stop.resolved.lineId) ??
      stanzaFirstLineNumber(text, stop.resolved.stanzaId, numbers)
    );
  }
  return stanzaFirstLineNumber(text, stop.resolved.stanzaId, numbers);
}

/**
 * Resolved thread stops in text or custom order. Orphaned anchors are listed
 * separately; good stops still draw.
 */
export function threadStops(
  annotation: AnnotationItem,
  block: AnnotationBlock
): { stops: ThreadStop[]; orphans: ThreadOrphan[] } {
  const text = block.content.text;
  const numbers = lineNumbers(text);
  const stops: ThreadStop[] = [];
  const orphans: ThreadOrphan[] = [];

  for (const { anchor, isPrimary } of allAnchors(annotation)) {
    const anchorId = anchor.id ?? (isPrimary ? `${annotation.id}:primary` : '');
    const fake: AnnotationItem = {
      ...annotation,
      anchor,
      also_anchors: undefined,
      thread: undefined
    };
    const resolved = resolveAnnotation(text, fake);
    if (resolved.status !== 'ok') {
      orphans.push({
        anchorId: anchorId || annotation.id,
        annotationId: annotation.id,
        isPrimary
      });
      continue;
    }
    stops.push({
      anchorId: anchorId || `${annotation.id}:${stops.length}`,
      anchor,
      resolved,
      note_html: anchor.note_html,
      isPrimary
    });
  }

  const order = annotation.thread?.order ?? 'text';
  if (order === 'custom' && annotation.thread?.anchor_order?.length) {
    const byId = new Map(stops.map((stop) => [stop.anchorId, stop]));
    const ordered: ThreadStop[] = [];
    const seen = new Set<string>();
    for (const id of annotation.thread.anchor_order) {
      const stop = byId.get(id);
      if (!stop || seen.has(stop.anchorId)) continue;
      ordered.push(stop);
      seen.add(stop.anchorId);
    }
    for (const stop of stops) {
      if (!seen.has(stop.anchorId)) ordered.push(stop);
    }
    return { stops: ordered, orphans };
  }

  stops.sort((a, b) => {
    const lineDiff = stopLineNumber(a, text, numbers) - stopLineNumber(b, text, numbers);
    if (lineDiff !== 0) return lineDiff;
    return (a.resolved.start ?? 0) - (b.resolved.start ?? 0);
  });

  return { stops, orphans };
}

/**
 * Fold non-stop lines into bars. `context` keeps ±N lines around each stop.
 * Never emits a "⋯ 0 lines" bar. Folds do not cross stanza boundaries.
 */
export function foldRows(
  text: AnnotationText,
  stopLineIds: Set<string>,
  options: { context: 0 | 1; expanded: Set<string> }
): FoldRow[] {
  const numbers = lineNumbers(text);
  const keep = new Set(stopLineIds);

  if (options.context > 0) {
    const byStanza = text.stanzas.map((stanza) => stanza.lines.map((line) => line.id));
    for (const lineIds of byStanza) {
      for (let i = 0; i < lineIds.length; i += 1) {
        const id = lineIds[i]!;
        if (!stopLineIds.has(id)) continue;
        for (let d = -options.context; d <= options.context; d += 1) {
          const neighbour = lineIds[i + d];
          if (neighbour) keep.add(neighbour);
        }
      }
    }
  }

  const rows: FoldRow[] = [];
  let foldIndex = 0;

  for (const stanza of text.stanzas) {
    let hidden: string[] = [];
    const flush = () => {
      if (hidden.length === 0) return;
      const id = `fold_${foldIndex++}`;
      if (options.expanded.has(id)) {
        for (const lineId of hidden) {
          rows.push({
            kind: 'line',
            lineId,
            stanzaId: stanza.id,
            number: numbers.get(lineId) ?? 0
          });
        }
      } else {
        rows.push({
          kind: 'fold',
          id,
          count: hidden.length,
          lineIds: [...hidden],
          stanzaId: stanza.id
        });
      }
      hidden = [];
    };

    for (const line of stanza.lines) {
      if (keep.has(line.id)) {
        flush();
        rows.push({
          kind: 'line',
          lineId: line.id,
          stanzaId: stanza.id,
          number: numbers.get(line.id) ?? 0
        });
      } else {
        hidden.push(line.id);
      }
    }
    flush();
  }

  return rows;
}

/**
 * Assign each arc a lane so none overlap. Spans are inclusive line ranges.
 */
export function arcLanes(spans: ArcSpan[]): Map<string, number> {
  const sorted = [...spans].sort(
    (a, b) => a.start - b.start || a.end - b.end || a.id.localeCompare(b.id)
  );
  const laneEnds: number[] = [];
  const out = new Map<string, number>();

  for (const span of sorted) {
    let lane = laneEnds.findIndex((end) => end < span.start);
    if (lane < 0) {
      lane = laneEnds.length;
      laneEnds.push(span.end);
    } else {
      laneEnds[lane] = span.end;
    }
    out.set(span.id, lane);
  }
  return out;
}
