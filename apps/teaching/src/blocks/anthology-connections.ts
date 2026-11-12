/**
 * What a note on the unit Anthology map links to, shaped like the students' anatomy table:
 * Poem · Technique · Quotation · Effect, then the class facts that answer "So… why?",
 * the same technique in other poems (is the pattern kept or changed?) and the same idea elsewhere.
 * Links come from shared themes and concepts, and from a shared technique tag. No AI.
 */
import type { AnthologyData, AnthologyItem } from '@/blocks/anthology-collect';
import { anthologyMapItems } from '@/blocks/anthology-graph';
import type { KnowledgeItem } from '@/blocks/anthology-knowledge';

export type TechniqueNamer = (id: string) => string | undefined;

export type AnatomyRow = {
  poem: string;
  technique: string;
  quote: string;
  line: number;
  effect: string;
};

export type LinkedFact = { item: KnowledgeItem; shared: string[] };
export type LinkedNote = { item: AnthologyItem; poem: string; technique: string; shared: string[] };

export type NoteConnections = {
  row: AnatomyRow;
  /** Class facts that share a theme or concept: the "So… why?" column. */
  facts: LinkedFact[];
  /** The same technique in other poems. */
  sameTechnique: LinkedNote[];
  /** Other poems' notes on the same theme or concept (not already under same technique). */
  sameIdea: LinkedNote[];
};

export type FactConnections = {
  /** Notes on poems that share a theme or concept with the fact, most shared first. */
  notes: LinkedNote[];
  /** Other class facts on the same tags. */
  facts: LinkedFact[];
};

const key = (tag: string) => tag.trim().toLowerCase();

function tagsOf(row: { themes: string[]; concepts: string[] }): string[] {
  return [...row.themes, ...row.concepts];
}

/** The tags `b` shares with `a`, spelled as `a` has them. */
export function sharedTags(
  a: { themes: string[]; concepts: string[] },
  b: { themes: string[]; concepts: string[] }
): string[] {
  const theirs = new Set(tagsOf(b).map(key));
  return [...new Set(tagsOf(a))].filter((tag) => theirs.has(key(tag)));
}

export function flatQuote(quote: string): string {
  return quote.replace(/\s+/g, ' ').trim();
}

function poemTitles(data: AnthologyData): Map<string, string> {
  return new Map(data.texts.map((text) => [text.block_id, text.title]));
}

function techniqueOf(item: AnthologyItem, nameOf: TechniqueNamer): string {
  return (item.technique_id && nameOf(item.technique_id)) || '';
}

/** Facts shown to everyone: a class addition with no status yet is shown. */
function shownFacts(knowledge: readonly KnowledgeItem[]): KnowledgeItem[] {
  return knowledge.filter((fact) => !fact.status || fact.status === 'shown');
}

const byMostShared = <T extends { shared: string[] }>(a: T, b: T) => b.shared.length - a.shared.length;

export function noteConnections(
  item: AnthologyItem,
  data: AnthologyData,
  knowledge: readonly KnowledgeItem[],
  nameOf: TechniqueNamer
): NoteConnections {
  const titles = poemTitles(data);
  const poemOf = (row: AnthologyItem) => titles.get(row.block_id) ?? row.lesson_title;
  const linked = (row: AnthologyItem, shared: string[]): LinkedNote => ({
    item: row,
    poem: poemOf(row),
    technique: techniqueOf(row, nameOf),
    shared
  });
  const others = anthologyMapItems(data).filter((row) => row.block_id !== item.block_id);

  const sameTechnique = item.technique_id
    ? others.filter((row) => row.technique_id === item.technique_id).map((row) => linked(row, sharedTags(row, item)))
    : [];
  const techniqueIds = new Set(sameTechnique.map((row) => `${row.item.block_id}::${row.item.annotation_id}`));
  const sameIdea = others
    .filter((row) => !techniqueIds.has(`${row.block_id}::${row.annotation_id}`))
    .map((row) => linked(row, sharedTags(row, item)))
    .filter((row) => row.shared.length > 0)
    .sort(byMostShared);
  const facts = shownFacts(knowledge)
    .map((fact) => ({ item: fact, shared: sharedTags(fact, item) }))
    .filter((fact) => fact.shared.length > 0)
    .sort(byMostShared);

  return {
    row: {
      poem: poemOf(item),
      technique: techniqueOf(item, nameOf),
      quote: flatQuote(item.quote),
      line: item.line_number,
      effect: item.note.trim()
    },
    facts,
    sameTechnique,
    sameIdea
  };
}

export function factConnections(
  fact: KnowledgeItem,
  data: AnthologyData,
  knowledge: readonly KnowledgeItem[],
  nameOf: TechniqueNamer
): FactConnections {
  const titles = poemTitles(data);
  const notes = anthologyMapItems(data)
    .map((row) => ({
      item: row,
      poem: titles.get(row.block_id) ?? row.lesson_title,
      technique: techniqueOf(row, nameOf),
      shared: sharedTags(row, fact)
    }))
    .filter((row) => row.shared.length > 0)
    .sort(byMostShared);
  const facts = shownFacts(knowledge)
    .filter((other) => other.id !== fact.id)
    .map((other) => ({ item: other, shared: sharedTags(other, fact) }))
    .filter((other) => other.shared.length > 0)
    .sort(byMostShared);
  return { notes, facts };
}

export type SearchHit =
  | { kind: 'note'; item: AnthologyItem; poem: string; technique: string }
  | { kind: 'fact'; item: KnowledgeItem };

/** Every note and class fact whose words, poem, technique or tags hold all the words of `query`. */
export function searchAnthology(
  query: string,
  data: AnthologyData,
  knowledge: readonly KnowledgeItem[],
  nameOf: TechniqueNamer
): SearchHit[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const hits = (hay: string) => {
    const lower = hay.toLowerCase();
    return words.every((word) => lower.includes(word));
  };
  const titles = poemTitles(data);
  const out: SearchHit[] = [];
  for (const item of anthologyMapItems(data)) {
    const poem = titles.get(item.block_id) ?? item.lesson_title;
    const technique = techniqueOf(item, nameOf);
    if (hits([item.quote, item.note, poem, technique, ...tagsOf(item)].join(' '))) {
      out.push({ kind: 'note', item, poem, technique });
    }
  }
  for (const fact of shownFacts(knowledge)) {
    if (hits([fact.title, fact.quote, fact.info, ...tagsOf(fact)].join(' '))) out.push({ kind: 'fact', item: fact });
  }
  return out;
}
