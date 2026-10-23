// apps/teaching/src/lecture/slide-import/pptx.ts
import { unzipSync, strFromU8 } from 'fflate';

/** What a lecture needs from one slide. The picture comes from the PDF export. */
export type PptxSlide = {
  /** 1-based position in the deck, hidden slides counted. */
  number: number;
  title: string;
  /** Every other line of text on the slide, for the picture's alt text. */
  text: string[];
  /** Speaker notes, paragraphs joined by blank lines. */
  notes: string;
  hidden: boolean;
};

const TITLE_TYPES = new Set(['title', 'ctrTitle']);
/** Notes placeholders that are PowerPoint furniture, not the teacher's words. */
const NOTES_SKIP = new Set(['sldImg', 'sldNum', 'dt', 'hdr', 'ftr']);

/**
 * Elements by local name. Office prefixes (`p:`, `a:`) are near-universal but
 * not guaranteed, and the test DOM has no namespace lookups, so match names.
 * The test DOM also chokes on the XML declaration, which is dropped.
 */
function byName(root: Document | Element, name: string): Element[] {
  return Array.from(root.getElementsByTagName('*')).filter((el) => el.localName === name);
}

function text(files: Record<string, Uint8Array>, path: string): string | null {
  const bytes = files[path];
  return bytes ? strFromU8(bytes).replace(/^\uFEFF?<\?xml[^>]*>/, '') : null;
}

function xml(files: Record<string, Uint8Array>, path: string): Document | null {
  const source = text(files, path);
  return source === null ? null : new DOMParser().parseFromString(source, 'application/xml');
}

/** `Id -> target path` for a part's relationships, targets resolved against the part's folder. */
function relationships(files: Record<string, Uint8Array>, part: string): Map<string, { target: string; type: string }> {
  const slash = part.lastIndexOf('/');
  const dir = part.slice(0, slash);
  const doc = xml(files, `${dir}/_rels/${part.slice(slash + 1)}.rels`);
  const out = new Map<string, { target: string; type: string }>();
  for (const rel of (doc ? byName(doc, 'Relationship') : [])) {
    out.set(rel.getAttribute('Id') ?? '', { target: resolve(dir, rel.getAttribute('Target') ?? ''), type: rel.getAttribute('Type') ?? '' });
  }
  return out;
}

function resolve(dir: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1);
  const parts = dir.split('/');
  for (const piece of target.split('/')) {
    if (piece === '..') parts.pop();
    else if (piece !== '.') parts.push(piece);
  }
  return parts.join('/');
}

/**
 * Relationship ids of the slides, in deck order. Read from the source: each
 * `sldId` has both `id` and `r:id`, and the test DOM keeps only one of them.
 */
function slideRelIds(source: string): string[] {
  return Array.from(source.matchAll(/<(?:\w+:)?sldId\b[^>]*?\s\w+:id="([^"]+)"/g), (match) => match[1]);
}

function placeholderType(shape: Element): string | null {
  const ph = byName(shape, 'ph')[0];
  if (!ph) return null;
  return ph.getAttribute('type') ?? 'body';
}

/** One string per paragraph, soft line breaks kept as spaces, empty paragraphs dropped. */
function paragraphs(shape: Element): string[] {
  return byName(shape, 'p')
    .map((p) =>
      Array.from(p.childNodes)
        .map((node) => {
          const el = node as Element;
          if (el.localName === 'br') return ' ';
          return el.localName === 'r' || el.localName === 'fld' ? (byName(el, 't')[0]?.textContent ?? '') : '';
        })
        .join('')
        .replace(/\s+/g, ' ')
        .trim()
    )
    .filter(Boolean);
}

function shapes(doc: Document): Element[] {
  return byName(doc, 'sp');
}

function readNotes(files: Record<string, Uint8Array>, path: string | undefined): string {
  const doc = path ? xml(files, path) : null;
  if (!doc) return '';
  return shapes(doc)
    .filter((shape) => !NOTES_SKIP.has(placeholderType(shape) ?? ''))
    .flatMap(paragraphs)
    .join('\n\n');
}

/** Reads titles, text, notes and hidden flags from a .pptx, in deck order. */
export function readPptx(bytes: Uint8Array): PptxSlide[] {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch {
    throw new Error('That file isn’t a PowerPoint (.pptx) file.');
  }
  const presentation = text(files, 'ppt/presentation.xml');
  if (!presentation) throw new Error('That file isn’t a PowerPoint (.pptx) file.');
  const rels = relationships(files, 'ppt/presentation.xml');
  const ids = slideRelIds(presentation);

  return ids.flatMap((id, i) => {
    const path = rels.get(id)?.target;
    const doc = path ? xml(files, path) : null;
    if (!path || !doc) return [];
    const all = shapes(doc);
    const titleShape = all.find((shape) => TITLE_TYPES.has(placeholderType(shape) ?? ''));
    const notesPath = Array.from(relationships(files, path).values()).find((rel) => rel.type.endsWith('/notesSlide'))?.target;
    return [
      {
        number: i + 1,
        title: titleShape ? paragraphs(titleShape).join(' ') : '',
        text: all.filter((shape) => shape !== titleShape && placeholderType(shape) !== 'sldNum').flatMap(paragraphs),
        notes: readNotes(files, notesPath),
        hidden: doc.documentElement.getAttribute('show') === '0'
      }
    ];
  });
}
