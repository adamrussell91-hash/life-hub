import { lineNumbers } from '@/blocks/annotation-thread';
import { htmlToPlainText } from '@/blocks/search-text';
import type { AnnotationBlock, AnnotationFamilyKey, Block } from '@/schemas/block';

export type AnthologyItem = {
  lesson_id: string;
  lesson_title: string;
  block_id: string;
  annotation_id: string;
  quote: string;
  line_number: number;
  layer_name: string;
  technique_id?: string;
  themes: string[];
  concepts: string[];
  published?: boolean;
};

export type AnthologyText = {
  lesson_id: string;
  block_id: string;
  title: string;
  attribution?: string;
  fingerprint: Partial<Record<AnnotationFamilyKey, number>>;
  text_included: boolean;
  /** Present only when `text_included` — enough for theme foldRows. */
  poem?: AnnotationBlock['content']['text'];
  /** annotation_id → line id for fold stops (when poem is present). */
  stop_lines?: Record<string, string>;
  published?: boolean;
};

export type AnthologyData = { items: AnthologyItem[]; texts: AnthologyText[] };

export type AnthologySnapshot = {
  lesson_id: string;
  lesson_title: string;
  published: boolean;
  blocks: Block[];
};

export type CollectAnthologyContext = {
  lessonOrder?: string[];
  includeUnpublished?: boolean;
};

const FAMILY_KEYS: AnnotationFamilyKey[] = [
  'Descriptive',
  'Repetitive',
  'Comparative',
  'Structural',
  'Intertextual'
];

export function normaliseTag(raw: string, seen: Map<string, string>): string | null {
  const collapsed = raw.trim().replace(/\s+/g, ' ');
  if (!collapsed) return null;
  const key = collapsed.toLowerCase();
  const existing = seen.get(key);
  if (existing) return existing;
  seen.set(key, collapsed);
  return collapsed;
}

function normaliseTagList(tags: string[] | undefined, seen: Map<string, string>): string[] {
  const out: string[] = [];
  for (const tag of tags ?? []) {
    const n = normaliseTag(tag, seen);
    if (n && !out.includes(n)) out.push(n);
  }
  return out;
}

function walkAnnotationBlocks(blocks: Block[], visit: (block: AnnotationBlock) => void): void {
  for (const block of blocks) {
    if (block.block_type === 'annotation') {
      visit(block);
      continue;
    }
    if (block.block_type === 'section') walkAnnotationBlocks(block.content.blocks as Block[], visit);
    else if (block.block_type === 'columns') {
      for (const col of block.content.columns) walkAnnotationBlocks(col.blocks as Block[], visit);
    } else if (block.block_type === 'tabs') {
      for (const panel of block.content.tabs) walkAnnotationBlocks(panel.blocks as Block[], visit);
    }
  }
}

export function collectAnthology(
  snapshots: AnthologySnapshot[],
  ctx: CollectAnthologyContext = {}
): AnthologyData {
  const includeUnpublished = ctx.includeUnpublished === true;
  const themeSeen = new Map<string, string>();
  const conceptSeen = new Map<string, string>();
  const items: AnthologyItem[] = [];
  const texts: AnthologyText[] = [];

  for (const snap of snapshots) {
    if (!snap.published && !includeUnpublished) continue;

    walkAnnotationBlocks(snap.blocks, (block) => {
      const layersById = new Map(block.content.layers.map((layer) => [layer.id, layer]));
      const numbers = lineNumbers(block.content.text);
      const fingerprint: Partial<Record<AnnotationFamilyKey, number>> = {};
      let includedCount = 0;

      for (const ann of block.content.annotations) {
        const layer = layersById.get(ann.layer_id);
        if (!layer || layer.kind === 'teacher' || layer.kind === 'voice') continue;

        const tag = ann.anthology;
        const blockTag = block.content.anthology;
        if (!(tag?.include === true || blockTag?.include === true)) continue;

        const themes = normaliseTagList(
          [...(tag?.themes ?? []), ...(blockTag?.themes ?? [])],
          themeSeen
        );
        const concepts = normaliseTagList(
          [...(tag?.concepts ?? []), ...(blockTag?.concepts ?? [])],
          conceptSeen
        );
        const lineId =
          'line' in ann.anchor && typeof ann.anchor.line === 'string' ? ann.anchor.line : undefined;

        items.push({
          lesson_id: snap.lesson_id,
          lesson_title: snap.lesson_title,
          block_id: block.id,
          annotation_id: ann.id,
          quote: ann.anchor.quote.exact,
          line_number: lineId ? (numbers.get(lineId) ?? 0) : 0,
          layer_name: layer.name,
          technique_id: ann.technique?.id,
          themes,
          concepts,
          ...(includeUnpublished ? { published: snap.published } : {})
        });
        includedCount += 1;

        if (
          ann.technique?.id &&
          layer.kind === 'family' &&
          layer.family &&
          FAMILY_KEYS.includes(layer.family)
        ) {
          fingerprint[layer.family] = (fingerprint[layer.family] ?? 0) + 1;
        }
      }

      if (includedCount === 0 && block.content.anthology?.include !== true) return;

      const textIncluded = block.content.anthology?.include === true;
      const stop_lines: Record<string, string> = {};
      if (textIncluded) {
        for (const ann of block.content.annotations) {
          const layer = layersById.get(ann.layer_id);
          if (!layer || layer.kind === 'teacher' || layer.kind === 'voice') continue;
          const lineId =
            'line' in ann.anchor && typeof ann.anchor.line === 'string'
              ? ann.anchor.line
              : undefined;
          if (lineId) stop_lines[ann.id] = lineId;
        }
      }

      texts.push({
        lesson_id: snap.lesson_id,
        block_id: block.id,
        title: block.content.title?.trim() || snap.lesson_title,
        attribution: block.content.attribution?.trim() || undefined,
        fingerprint,
        text_included: textIncluded,
        ...(textIncluded
          ? { poem: structuredClone(block.content.text), stop_lines }
          : {}),
        ...(includeUnpublished ? { published: snap.published } : {})
      });
    });
  }

  const orderIndex = new Map((ctx.lessonOrder ?? []).map((id, i) => [id, i]));
  texts.sort((a, b) => {
    const ai = orderIndex.get(a.lesson_id) ?? Number.MAX_SAFE_INTEGER;
    const bi = orderIndex.get(b.lesson_id) ?? Number.MAX_SAFE_INTEGER;
    return ai - bi || a.title.localeCompare(b.title) || a.block_id.localeCompare(b.block_id);
  });
  items.sort((a, b) => {
    const ai = orderIndex.get(a.lesson_id) ?? Number.MAX_SAFE_INTEGER;
    const bi = orderIndex.get(b.lesson_id) ?? Number.MAX_SAFE_INTEGER;
    return (
      ai - bi ||
      a.block_id.localeCompare(b.block_id) ||
      a.line_number - b.line_number ||
      a.annotation_id.localeCompare(b.annotation_id)
    );
  });

  return { items, texts };
}

export function annotationNotePlain(html: string): string {
  return htmlToPlainText(html).trim();
}
