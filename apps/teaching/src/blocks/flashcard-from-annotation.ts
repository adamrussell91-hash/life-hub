import type { AnthologyItem } from '@/blocks/anthology-collect';
import { annotationNotePlain } from '@/blocks/anthology-collect';
import {
  loadLiteraryElements,
  lookupTechnique,
  type LiteraryElementsTable
} from '@/blocks/literary-elements';
import type { AnnotationBlock, AnnotationItem, Block } from '@/schemas/block';

export type FlashcardKind = 'quote_to_technique' | 'find_it' | 'line_recall';
export type FlashcardItem = Extract<
  Block,
  { block_type: 'flashcards' }
>['content']['cards'][number];

export type ComposeCardInput = {
  annotation: AnnotationItem;
  block: AnnotationBlock;
  lessonId: string;
  kind: FlashcardKind;
  fadeLevel?: 1 | 2;
  table: LiteraryElementsTable;
  cardId: string;
};

export function fadeText(text: string, level: 1 | 2): string {
  const tokens = text.split(/(\s+)/);
  const wordIndexes: number[] = [];
  for (let i = 0; i < tokens.length; i += 1) {
    if (!/^\s+$/.test(tokens[i]!) && tokens[i]!.length > 0) wordIndexes.push(i);
  }

  const fadeWord = (word: string): string =>
    word
      .split(/(-)/)
      .map((part) => {
        if (part === '-' || part.length === 0) return part;
        let seenLetter = false;
        return [...part]
          .map((ch) => {
            if (/[A-Za-z]/.test(ch)) {
              if (!seenLetter) {
                seenLetter = true;
                return ch;
              }
              return '_';
            }
            return ch;
          })
          .join('');
      })
      .join('');

  if (level === 1) {
    return tokens
      .map((token, i) => (wordIndexes.includes(i) ? fadeWord(token) : token))
      .join('');
  }

  if (wordIndexes.length <= 2) return tokens.join('');
  const first = wordIndexes[0]!;
  const last = wordIndexes[wordIndexes.length - 1]!;
  return tokens
    .map((token, i) => {
      if (!wordIndexes.includes(i)) return token;
      if (i === first || i === last) return token;
      return fadeWord(token);
    })
    .join('');
}

export function sourceHash(
  quote: string,
  techniqueId: string | undefined,
  notePlain: string
): string {
  const raw = `${quote}\n${techniqueId ?? ''}\n${notePlain}`;
  let h = 2166136261;
  for (let i = 0; i < raw.length; i += 1) {
    h ^= raw.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export function lineLabel(annotation: AnnotationItem, block: AnnotationBlock): string {
  const lineId =
    'line' in annotation.anchor && typeof annotation.anchor.line === 'string'
      ? annotation.anchor.line
      : undefined;
  if (!lineId) return annotation.anchor.quote.exact;
  let n = 0;
  for (const stanza of block.content.text.stanzas) {
    for (const line of stanza.lines) {
      n += 1;
      if (line.id === lineId) return `l.${n} ${annotation.anchor.quote.exact}`;
    }
  }
  return annotation.anchor.quote.exact;
}

export function composeCardFromAnnotation(input: ComposeCardInput): FlashcardItem | null {
  const { annotation, block, lessonId, kind, table, cardId } = input;
  const quote = annotation.anchor.quote.exact;
  const note = annotationNotePlain(annotation.body.html);
  const techniqueId = annotation.technique?.id;
  const technique = techniqueId ? lookupTechnique(table, techniqueId) : undefined;
  const labelled = lineLabel(annotation, block);
  const title = block.content.title?.trim() || 'this text';
  const hash = sourceHash(quote, techniqueId, note);
  const source = {
    block_id: block.id,
    annotation_id: annotation.id,
    lesson_id: lessonId,
    kind,
    source_hash: hash
  };

  if (kind === 'quote_to_technique') {
    if (!technique) return null;
    const effect = technique.effect?.trim() ? ` — ${technique.effect.trim()}` : '';
    const noteBit = note ? `\n${note}` : '';
    return {
      id: cardId,
      front: labelled,
      back: `${technique.name}${effect}${noteBit}`.trim(),
      source
    };
  }

  if (kind === 'find_it') {
    if (!technique) return null;
    return {
      id: cardId,
      front: `Where is the ${technique.name} in “${title}”?`,
      back: labelled,
      source
    };
  }

  return {
    id: cardId,
    front: fadeText(quote, input.fadeLevel ?? 1),
    back: quote,
    source
  };
}

export function cardKindsForAnnotation(annotation: AnnotationItem): FlashcardKind[] {
  const kinds: FlashcardKind[] = ['line_recall'];
  if (annotation.technique?.id) kinds.unshift('quote_to_technique', 'find_it');
  return kinds;
}

export function currentSourceHash(annotation: AnnotationItem): string {
  return sourceHash(
    annotation.anchor.quote.exact,
    annotation.technique?.id,
    annotationNotePlain(annotation.body.html)
  );
}

export function cardNeedsRefresh(
  card: FlashcardItem,
  annotation: AnnotationItem | undefined
): 'ok' | 'changed' | 'removed' {
  if (!card.source) return 'ok';
  if (!annotation) return 'removed';
  return currentSourceHash(annotation) === card.source.source_hash ? 'ok' : 'changed';
}

export const FLASHCARDS_CAP = 20;

export function chunkItems<T>(items: T[], size = FLASHCARDS_CAP): T[][] {
  if (size <= 0) return [items];
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export async function composeQuoteToTechniqueCards(
  items: AnthologyItem[],
  resolveAnnotation: (
    item: AnthologyItem
  ) => { annotation: AnnotationItem; block: AnnotationBlock } | null,
  nextCardId: () => string
): Promise<FlashcardItem[]> {
  const table = await loadLiteraryElements();
  const cards: FlashcardItem[] = [];
  for (const item of items) {
    const resolved = resolveAnnotation(item);
    if (!resolved?.annotation.technique?.id) continue;
    const card = composeCardFromAnnotation({
      annotation: resolved.annotation,
      block: resolved.block,
      lessonId: item.lesson_id,
      kind: 'quote_to_technique',
      table,
      cardId: nextCardId()
    });
    if (card) cards.push(card);
  }
  return cards;
}

export function findAnnotationInBlocks(
  blocks: Block[],
  blockId: string,
  annotationId: string
): { annotation: AnnotationItem; block: AnnotationBlock } | null {
  for (const block of blocks) {
    if (block.id === blockId && block.block_type === 'annotation') {
      const annotation = block.content.annotations.find((row) => row.id === annotationId);
      return annotation ? { annotation, block } : null;
    }
    if (block.block_type === 'section') {
      const hit = findAnnotationInBlocks(block.content.blocks as Block[], blockId, annotationId);
      if (hit) return hit;
    } else if (block.block_type === 'columns') {
      for (const col of block.content.columns) {
        const hit = findAnnotationInBlocks(col.blocks as Block[], blockId, annotationId);
        if (hit) return hit;
      }
    } else if (block.block_type === 'tabs') {
      for (const panel of block.content.tabs) {
        const hit = findAnnotationInBlocks(panel.blocks as Block[], blockId, annotationId);
        if (hit) return hit;
      }
    }
  }
  return null;
}

export function listFlashcardTargets(blocks: Block[]): Array<{
  id: string;
  label: string;
  count: number;
  full: boolean;
}> {
  const out: Array<{ id: string; label: string; count: number; full: boolean }> = [];
  const walk = (list: Block[]) => {
    for (const block of list) {
      if (block.block_type === 'flashcards') {
        const count = block.content.cards.length;
        out.push({
          id: block.id,
          label:
            count >= FLASHCARDS_CAP
              ? `Flashcards (${block.id}) — Full (20)`
              : `Flashcards (${block.id}) — ${count}/20`,
          count,
          full: count >= FLASHCARDS_CAP
        });
      } else if (block.block_type === 'section') walk(block.content.blocks as Block[]);
      else if (block.block_type === 'columns') {
        for (const col of block.content.columns) walk(col.blocks as Block[]);
      } else if (block.block_type === 'tabs') {
        for (const panel of block.content.tabs) walk(panel.blocks as Block[]);
      }
    }
  };
  walk(blocks);
  return out;
}
