/**
 * The unit anthology as a Knowledge Hub "Show all" map: every tagged note is a dot, the theme,
 * concept or poem it belongs to is a hub, and notes that share hubs or wording link up.
 * The map itself lives in the Knowledge Hub; this file only turns anthology data into its input.
 */
import type { PageManifestEntry } from '../../../knowledge/src/domain/page';
import { KEYWORD_PALETTE, type ArchiveGraphModel } from '../../../knowledge/src/archive/keywordGraph';
import { buildShowAllGraph } from '../../../knowledge/src/archive/showAllGraph';
import type { AnthologyData, AnthologyItem } from '@/blocks/anthology-collect';
import { CLASS_KNOWLEDGE_TEXT, knowledgeNoteId, type KnowledgeItem } from '@/blocks/anthology-knowledge';

export type AnthologyGrouping = 'theme' | 'concept' | 'poem';

export const ANTHOLOGY_GROUPINGS: ReadonlyArray<{ id: AnthologyGrouping; label: string }> = [
  { id: 'theme', label: 'Themes' },
  { id: 'concept', label: 'Concepts' },
  { id: 'poem', label: 'Texts' }
];

/** One id per note across the whole unit: annotation ids are only unique inside their block. */
export function anthologyNoteId(item: Pick<AnthologyItem, 'block_id' | 'annotation_id'>): string {
  return `${item.block_id}::${item.annotation_id}`;
}

function textTitles(data: AnthologyData): Map<string, string> {
  return new Map(data.texts.map((text) => [text.block_id, text.title]));
}

export function anthologyLabelsFor(
  item: AnthologyItem,
  grouping: AnthologyGrouping,
  titles: Map<string, string>
): string[] {
  if (grouping === 'theme') return item.themes;
  if (grouping === 'concept') return item.concepts;
  return [titles.get(item.block_id) ?? item.lesson_title];
}

/**
 * The notes on the map. A whole-text tick brings every note on that text into the anthology;
 * only the ones a teacher tagged with a theme or concept carry the cross-text argument, so the
 * rest stay off the map unless nothing is tagged at all.
 */
export function anthologyMapItems(data: AnthologyData): AnthologyItem[] {
  const tagged = data.items.filter((item) => item.themes.length > 0 || item.concepts.length > 0);
  return tagged.length > 0 ? tagged : data.items;
}

/** Hub labels in a steady order (texts by unit order, the rest alphabetical), each with its own colour. */
export function anthologyHubColours(
  data: AnthologyData,
  grouping: AnthologyGrouping,
  knowledge: readonly KnowledgeItem[] = []
): Map<string, (typeof KEYWORD_PALETTE)[number]> {
  const titles = textTitles(data);
  const labels =
    grouping === 'poem'
      ? [...data.texts.map((text) => text.title), ...(knowledge.length ? [CLASS_KNOWLEDGE_TEXT] : [])]
      : [
          ...new Set([
            ...anthologyMapItems(data).flatMap((item) => anthologyLabelsFor(item, grouping, titles)),
            ...knowledge.flatMap((item) => (grouping === 'theme' ? item.themes : item.concepts))
          ])
        ].sort((a, b) => a.localeCompare(b));
  return new Map(labels.map((label, index) => [label, KEYWORD_PALETTE[index % KEYWORD_PALETTE.length]!]));
}

function shortQuote(quote: string): string {
  const flat = quote.replace(/\s+/g, ' ').trim();
  return flat.length > 64 ? `${flat.slice(0, 61).trimEnd()}…` : flat;
}

export function buildAnthologyGraph(
  data: AnthologyData,
  grouping: AnthologyGrouping,
  knowledge: readonly KnowledgeItem[] = []
): ArchiveGraphModel {
  const titles = textTitles(data);
  const items = anthologyMapItems(data);
  const labelsById = new Map<string, string[]>();
  const entries: PageManifestEntry[] = items.map((item) => {
    const id = anthologyNoteId(item);
    labelsById.set(id, anthologyLabelsFor(item, grouping, titles));
    return {
      id,
      title: `“${shortQuote(item.quote)}”`,
      area: 'notes',
      tags: [],
      excerpt: [item.note, titles.get(item.block_id) ?? item.lesson_title, ...item.themes, ...item.concepts]
        .filter(Boolean)
        .join(' · ')
    };
  });
  // The class's additions sit under the same hubs, so reading and poem lines meet on a shared theme.
  for (const item of knowledge) {
    const id = knowledgeNoteId(item.id);
    labelsById.set(id, grouping === 'poem' ? [CLASS_KNOWLEDGE_TEXT] : grouping === 'theme' ? item.themes : item.concepts);
    entries.push({
      id,
      title: item.title,
      area: 'notes',
      tags: [],
      excerpt: [item.quote, item.info, ...item.themes, ...item.concepts].filter(Boolean).join(' · ')
    });
  }
  const colours = anthologyHubColours(data, grouping, knowledge);
  return buildShowAllGraph(entries, 'tags', {
    labelsFor: (entry) => labelsById.get(entry.id) ?? [],
    colorFor: (label) => colours.get(label) ?? KEYWORD_PALETTE[0]!
  });
}
