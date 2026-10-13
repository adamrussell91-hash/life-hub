import type {
  AnnotationAnchor,
  AnnotationBlock,
  AnnotationGranularity,
  AnnotationItem
} from '@/schemas/block';

export type AnnotationTextModel = AnnotationBlock['content']['text'];
export type AnnotationLineModel = AnnotationTextModel['stanzas'][number]['lines'][number];
export type AnnotationStanzaModel = AnnotationTextModel['stanzas'][number];

export type ResolvedAnchor = {
  status: 'ok';
  stanzaId: string;
  lineId?: string;
  start?: number;
  end?: number;
  exact: string;
  granularity: AnnotationGranularity;
};

export type OrphanAnchor = {
  status: 'orphan';
  annotationId: string;
};

export type AnchorResolveResult = ResolvedAnchor | OrphanAnchor;

export type BuildAnchorSelection = {
  stanzaId: string;
  lineId?: string;
  /** Inclusive start / exclusive end into the line text when granularity is word or phrase. */
  start?: number;
  end?: number;
  /** When true (or when start/end omitted on a line), treat the whole line as the span. */
  wholeLine?: boolean;
  /** When true (or when lineId omitted), treat the whole stanza as the span. */
  wholeStanza?: boolean;
};

function findStanza(
  text: AnnotationTextModel,
  stanzaId: string
): AnnotationStanzaModel | undefined {
  return text.stanzas.find((s) => s.id === stanzaId);
}

function findLine(
  stanza: AnnotationStanzaModel,
  lineId: string
): AnnotationLineModel | undefined {
  return stanza.lines.find((l) => l.id === lineId);
}

function wordBounds(text: string, start: number, end: number): boolean {
  if (start < 0 || end > text.length || start >= end) return false;
  const slice = text.slice(start, end);
  if (!/^\S+$/.test(slice)) return false;
  const beforeOk = start === 0 || /\s/.test(text[start - 1]!);
  const afterOk = end === text.length || /\s/.test(text[end]!);
  return beforeOk && afterOk;
}

/** Derive stored granularity from the selected span. */
export function granularityOf(
  text: AnnotationTextModel,
  selection: BuildAnchorSelection
): AnnotationGranularity {
  if (selection.wholeStanza || !selection.lineId) return 'stanza';
  const stanza = findStanza(text, selection.stanzaId);
  const line = stanza ? findLine(stanza, selection.lineId) : undefined;
  if (!line) return 'stanza';
  if (
    selection.wholeLine ||
    selection.start == null ||
    selection.end == null ||
    (selection.start === 0 && selection.end === line.text.length)
  ) {
    return 'line';
  }
  if (wordBounds(line.text, selection.start, selection.end)) return 'word';
  return 'phrase';
}

function contextQuote(
  lineText: string,
  start: number,
  end: number
): { exact: string; prefix?: string; suffix?: string } {
  const exact = lineText.slice(start, end);
  const prefix = lineText.slice(Math.max(0, start - 24), start);
  const suffix = lineText.slice(end, Math.min(lineText.length, end + 24));
  return {
    exact,
    ...(prefix ? { prefix } : {}),
    ...(suffix ? { suffix } : {})
  };
}

/** Build a stored anchor from a teacher selection. No DOM. */
export function buildAnchor(
  text: AnnotationTextModel,
  selection: BuildAnchorSelection
): AnnotationAnchor | null {
  const stanza = findStanza(text, selection.stanzaId);
  if (!stanza) return null;

  const granularity = granularityOf(text, selection);

  if (granularity === 'stanza') {
    const exact = stanza.lines.map((l) => l.text).join('\n');
    if (!exact.trim()) return null;
    return {
      granularity: 'stanza',
      stanza: stanza.id,
      quote: { exact }
    };
  }

  if (!selection.lineId) return null;
  const line = findLine(stanza, selection.lineId);
  if (!line) return null;

  if (granularity === 'line') {
    if (!line.text.trim()) return null;
    return {
      granularity: 'line',
      stanza: stanza.id,
      line: line.id,
      quote: { exact: line.text }
    };
  }

  const start = selection.start ?? 0;
  const end = selection.end ?? line.text.length;
  if (start < 0 || end > line.text.length || start >= end) return null;
  const quote = contextQuote(line.text, start, end);
  if (!quote.exact) return null;
  return {
    granularity,
    stanza: stanza.id,
    line: line.id,
    start,
    end,
    quote
  };
}

function matchQuoteInLine(
  lineText: string,
  quote: AnnotationAnchor['quote']
): { start: number; end: number } | null {
  const exact = quote.exact;
  if (!exact) return null;
  let from = 0;
  while (from <= lineText.length) {
    const idx = lineText.indexOf(exact, from);
    if (idx < 0) return null;
    const end = idx + exact.length;
    const prefixOk =
      !quote.prefix ||
      lineText.slice(Math.max(0, idx - quote.prefix.length), idx) === quote.prefix ||
      lineText.slice(0, idx).endsWith(quote.prefix);
    const suffixOk =
      !quote.suffix ||
      lineText.slice(end, end + quote.suffix.length) === quote.suffix ||
      lineText.slice(end).startsWith(quote.suffix);
    if (prefixOk && suffixOk) return { start: idx, end };
    from = idx + 1;
  }
  return null;
}

/**
 * Resolve an anchor against the current text.
 * Prefer stored offsets when they still match `quote.exact`; otherwise fall back
 * to quote search (stanza, then whole text). Never invent a wrong placement.
 */
export function resolveAnchor(
  text: AnnotationTextModel,
  anchor: AnnotationAnchor
): AnchorResolveResult {
  const stanza = findStanza(text, anchor.stanza);

  if (anchor.granularity === 'stanza') {
    if (stanza) {
      const exact = stanza.lines.map((l) => l.text).join('\n');
      if (exact === anchor.quote.exact) {
        return {
          status: 'ok',
          stanzaId: stanza.id,
          exact,
          granularity: 'stanza'
        };
      }
    }
    for (const s of text.stanzas) {
      const exact = s.lines.map((l) => l.text).join('\n');
      if (exact === anchor.quote.exact) {
        return {
          status: 'ok',
          stanzaId: s.id,
          exact,
          granularity: 'stanza'
        };
      }
    }
    return { status: 'orphan', annotationId: '' };
  }

  if (anchor.line && stanza) {
    const line = findLine(stanza, anchor.line);
    if (line) {
      const start = anchor.start;
      const end = anchor.end;
      if (
        anchor.granularity !== 'line' &&
        typeof start === 'number' &&
        typeof end === 'number' &&
        start >= 0 &&
        end <= line.text.length &&
        start < end &&
        line.text.slice(start, end) === anchor.quote.exact
      ) {
        return {
          status: 'ok',
          stanzaId: stanza.id,
          lineId: line.id,
          start,
          end,
          exact: anchor.quote.exact,
          granularity: anchor.granularity
        };
      }
      if (anchor.granularity === 'line' && line.text === anchor.quote.exact) {
        return {
          status: 'ok',
          stanzaId: stanza.id,
          lineId: line.id,
          exact: line.text,
          granularity: 'line'
        };
      }
      const hit = matchQuoteInLine(line.text, anchor.quote);
      if (hit) {
        return {
          status: 'ok',
          stanzaId: stanza.id,
          lineId: line.id,
          start: hit.start,
          end: hit.end,
          exact: anchor.quote.exact,
          granularity: anchor.granularity === 'line' ? 'line' : granularityOf(text, {
            stanzaId: stanza.id,
            lineId: line.id,
            start: hit.start,
            end: hit.end
          })
        };
      }
    }
  }

  // Search the named stanza, then the whole text.
  const searchStanzas = stanza ? [stanza, ...text.stanzas.filter((s) => s.id !== stanza.id)] : text.stanzas;
  for (const s of searchStanzas) {
    for (const line of s.lines) {
      if (anchor.granularity === 'line' && line.text === anchor.quote.exact) {
        return {
          status: 'ok',
          stanzaId: s.id,
          lineId: line.id,
          exact: line.text,
          granularity: 'line'
        };
      }
      const hit = matchQuoteInLine(line.text, anchor.quote);
      if (hit) {
        return {
          status: 'ok',
          stanzaId: s.id,
          lineId: line.id,
          start: hit.start,
          end: hit.end,
          exact: anchor.quote.exact,
          granularity:
            anchor.granularity === 'line'
              ? 'line'
              : granularityOf(text, {
                  stanzaId: s.id,
                  lineId: line.id,
                  start: hit.start,
                  end: hit.end
                })
        };
      }
    }
  }

  return { status: 'orphan', annotationId: '' };
}

/** Annotations whose anchors no longer resolve in the current text. */
export function orphans(block: AnnotationBlock | AnnotationBlock['content']): AnnotationItem[] {
  const content = 'block_type' in block ? block.content : block;
  return content.annotations.filter((ann) => {
    const result = resolveAnchor(content.text, ann.anchor);
    return result.status === 'orphan';
  });
}

export function resolveAnnotation(
  text: AnnotationTextModel,
  annotation: AnnotationItem
): AnchorResolveResult {
  const result = resolveAnchor(text, annotation.anchor);
  if (result.status === 'orphan') {
    return { status: 'orphan', annotationId: annotation.id };
  }
  return result;
}
