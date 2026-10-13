import type { AnnotationTextModel } from '@/blocks/annotation-anchor';

function nextPartId(prefix: string, index: number): string {
  return `${prefix}_${index + 1}`;
}

/**
 * Parse pasted poem/prose into structured stanzas.
 * Verse: blank line = new stanza, newline = new line.
 * Prose: each paragraph (blank-line separated) is one stanza with a single line.
 */
export function parseAnnotationSource(
  raw: string,
  kind: 'verse' | 'prose' = 'verse'
): AnnotationTextModel {
  const normalised = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  if (kind === 'prose') {
    const paragraphs = normalised
      .split(/\n\s*\n/)
      .map((p) => p.replace(/\n+/g, ' ').trim())
      .filter((p) => p.length > 0);
    if (paragraphs.length === 0) {
      return {
        kind: 'prose',
        stanzas: [{ id: 'stanza_1', lines: [{ id: 'line_1', text: '' }] }]
      };
    }
    return {
      kind: 'prose',
      stanzas: paragraphs.map((text, i) => ({
        id: nextPartId('stanza', i),
        lines: [{ id: nextPartId('line', i), text }]
      }))
    };
  }

  const chunks = normalised.split(/\n\s*\n/);
  const stanzas = chunks
    .map((chunk, i) => {
      const lines = trimBlankEdges(chunk.split('\n').map((line) => line.replace(/\s+$/u, '')));
      if (lines.length === 0) return null;
      return {
        id: nextPartId('stanza', i),
        lines: lines.map((text, j) => ({
          id: nextPartId(`s${i + 1}_line`, j),
          text
        }))
      };
    })
    .filter((s): s is NonNullable<typeof s> => s != null);

  if (stanzas.length === 0) {
    return {
      kind: 'verse',
      stanzas: [{ id: 'stanza_1', lines: [{ id: 'line_1', text: '' }] }]
    };
  }
  return { kind: 'verse', stanzas };
}

function trimBlankEdges(lines: string[]): string[] {
  let start = 0;
  let end = lines.length;
  while (start < end && lines[start]!.trim() === '') start += 1;
  while (end > start && lines[end - 1]!.trim() === '') end -= 1;
  return lines.slice(start, end);
}

/** Serialize structured text back to an editable source string. */
export function serializeAnnotationSource(text: AnnotationTextModel): string {
  if (text.kind === 'prose') {
    return text.stanzas.map((s) => s.lines.map((l) => l.text).join(' ')).join('\n\n');
  }
  return text.stanzas.map((s) => s.lines.map((l) => l.text).join('\n')).join('\n\n');
}

export function emptyAnnotationText(kind: 'verse' | 'prose' = 'verse'): AnnotationTextModel {
  return {
    kind,
    stanzas: [{ id: 'stanza_1', lines: [{ id: 'line_1', text: '' }] }]
  };
}
