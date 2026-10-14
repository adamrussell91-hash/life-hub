import type { AnnotationLineModel, AnnotationTextModel } from '@/blocks/annotation-anchor';
import {
  lineRuns,
  MAX_LINE_INDENT,
  runsFromNodes,
  runsHaveFormatting,
  runsToHtml
} from '@/blocks/annotation-line-format';
import type { AnnotationLineAlign } from '@/schemas/block';

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

type DraftLine = {
  text: string;
  html?: string;
  align?: AnnotationLineAlign;
  indent?: number;
};

function readAlign(el: Element): AnnotationLineAlign | undefined {
  const raw = ((el as HTMLElement).style?.textAlign || el.getAttribute('align') || '').toLowerCase();
  if (raw === 'center' || raw === 'right') return raw;
  return undefined;
}

function readIndent(el: Element): number | undefined {
  const raw = Number(el.getAttribute('data-indent'));
  if (!Number.isFinite(raw) || raw <= 0) return undefined;
  return Math.min(MAX_LINE_INDENT, Math.round(raw));
}

/** Split one block element into lines at each `<br>`. */
function blockToLines(el: Element): DraftLine[] {
  const align = readAlign(el);
  const indent = readIndent(el);
  const groups: Node[][] = [[]];
  const collect = (node: Node, path: Element[]) => {
    if (node.nodeType === Node.ELEMENT_NODE && (node as Element).tagName.toLowerCase() === 'br') {
      groups.push([]);
      return;
    }
    if (node.nodeType === Node.ELEMENT_NODE && (node as Element).querySelector('br')) {
      // Re-wrap children so marks survive the split: <em>a<br>b</em> → <em>a</em> | <em>b</em>.
      for (const child of Array.from(node.childNodes)) collect(child, [...path, node as Element]);
      return;
    }
    let wrapped: Node = node.cloneNode(true);
    for (let i = path.length - 1; i >= 0; i -= 1) {
      const shell = path[i]!.cloneNode(false);
      shell.appendChild(wrapped);
      wrapped = shell;
    }
    groups[groups.length - 1]!.push(wrapped);
  };
  for (const child of Array.from(el.childNodes)) collect(child, []);
  return groups.map((nodes) => {
    const runs = runsFromNodes(nodes);
    const text = runs.map((run) => run.text).join('');
    return {
      text,
      ...(runsHaveFormatting(runs) ? { html: runsToHtml(runs) } : {}),
      ...(align ? { align } : {}),
      ...(indent ? { indent } : {})
    };
  });
}

const BLOCK_TAGS = new Set(['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'blockquote', 'pre']);

/** Top-level blocks of pasted / editor HTML; loose inline content becomes one block. */
function topBlocks(body: HTMLElement): Element[] {
  const out: Element[] = [];
  let loose: HTMLElement | null = null;
  for (const node of Array.from(body.childNodes)) {
    const isBlock =
      node.nodeType === Node.ELEMENT_NODE && BLOCK_TAGS.has((node as Element).tagName.toLowerCase());
    if (isBlock) {
      const el = node as Element;
      const tag = el.tagName.toLowerCase();
      const nested = Array.from(el.children).filter((c) => BLOCK_TAGS.has(c.tagName.toLowerCase()));
      if ((tag === 'div' || tag === 'blockquote' || tag === 'li') && nested.length > 0) {
        const inner = body.ownerDocument.createElement('body');
        inner.append(...Array.from(el.childNodes).map((n) => n.cloneNode(true)));
        out.push(...topBlocks(inner));
      } else {
        out.push(el);
      }
      loose = null;
      continue;
    }
    if (node.nodeType === Node.TEXT_NODE && !(node.textContent ?? '').trim() && !loose) continue;
    if (!loose) {
      loose = body.ownerDocument.createElement('p');
      out.push(loose);
    }
    loose.append(node.cloneNode(true));
  }
  return out;
}

/**
 * Editor HTML → structured text.
 * Verse: each paragraph (or `<br>` segment) is a line; an empty paragraph is a stanza break.
 * Prose: each non-empty paragraph is a stanza with one line.
 */
export function annotationTextFromHtml(
  html: string,
  kind: 'verse' | 'prose' = 'verse'
): AnnotationTextModel {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  const blocks = topBlocks(doc.body);

  if (kind === 'prose') {
    const paragraphs: DraftLine[] = [];
    for (const block of blocks) {
      const parts = blockToLines(block).filter((line) => line.text.trim().length > 0);
      if (parts.length === 0) continue;
      if (parts.length === 1) {
        paragraphs.push(parts[0]!);
        continue;
      }
      const runs = parts.flatMap((part, i) => {
        const r = lineRuns(part);
        return i === 0 ? r : [{ text: ' ' }, ...r];
      });
      paragraphs.push({
        text: runs.map((run) => run.text).join(''),
        ...(runsHaveFormatting(runs) ? { html: runsToHtml(runs) } : {}),
        ...(parts[0]!.align ? { align: parts[0]!.align } : {})
      });
    }
    if (paragraphs.length === 0) return emptyAnnotationText('prose');
    return {
      kind: 'prose',
      stanzas: paragraphs.map((line, i) => ({
        id: nextPartId('stanza', i),
        lines: [{ id: nextPartId('line', i), ...line }]
      }))
    };
  }

  const stanzaDrafts: DraftLine[][] = [];
  let current: DraftLine[] = [];
  const flush = () => {
    if (current.length > 0) stanzaDrafts.push(current);
    current = [];
  };
  for (const block of blocks) {
    const lines = blockToLines(block);
    const blank = lines.every((line) => line.text.trim() === '');
    if (blank) {
      flush();
      continue;
    }
    for (const line of lines) {
      if (line.text.trim() === '') {
        // A blank <br> segment inside a paragraph is also a stanza break.
        flush();
        continue;
      }
      current.push(line);
    }
  }
  flush();

  if (stanzaDrafts.length === 0) return emptyAnnotationText('verse');
  return {
    kind: 'verse',
    stanzas: stanzaDrafts.map((lines, i) => ({
      id: nextPartId('stanza', i),
      lines: lines.map((line, j) => ({ id: nextPartId(`s${i + 1}_line`, j), ...line }))
    }))
  };
}

function lineToParagraph(line: AnnotationLineModel): string {
  const attrs: string[] = [];
  if (line.align && line.align !== 'left') attrs.push(`style="text-align: ${line.align}"`);
  if (line.indent && line.indent > 0) attrs.push(`data-indent="${Math.min(MAX_LINE_INDENT, line.indent)}"`);
  const inner = runsToHtml(lineRuns(line));
  return `<p${attrs.length ? ` ${attrs.join(' ')}` : ''}>${inner}</p>`;
}

/** Structured text → editor HTML (inverse of `annotationTextFromHtml`). */
export function annotationTextToHtml(text: AnnotationTextModel): string {
  const hasText = text.stanzas.some((s) => s.lines.some((l) => l.text.length > 0));
  if (!hasText) return '<p></p>';
  if (text.kind === 'prose') {
    return text.stanzas.map((s) => s.lines.map(lineToParagraph).join('')).join('');
  }
  return text.stanzas.map((s) => s.lines.map(lineToParagraph).join('')).join('<p></p>');
}
