import { blocksToSearchText, snippetAround } from '../blocks/search-text';
import type { Block } from '../schemas';
import type { ContentSearchHit } from '../teacher/search/types';

export interface ContentSearchCorpus {
  lessons: Array<{ id: string; blocks?: Block[] }>;
  units: Array<{ id: string; blocks?: Block[] }>;
  compositions: Array<{ id: string; blocks?: Block[] }>;
}

export function runContentSearch(query: string, corpus: ContentSearchCorpus): ContentSearchHit[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const hits: ContentSearchHit[] = [];

  const scan = (type: ContentSearchHit['type'], id: string, blocks: Block[]) => {
    const text = blocksToSearchText(blocks);
    if (text.toLowerCase().includes(q)) {
      hits.push({ type, id, snippet: snippetAround(text, q) });
    }
  };

  for (const lesson of corpus.lessons) scan('lesson', lesson.id, lesson.blocks ?? []);
  for (const unit of corpus.units) scan('unit', unit.id, unit.blocks ?? []);
  for (const composition of corpus.compositions) {
    scan('composition', composition.id, composition.blocks ?? []);
  }
  return hits;
}
