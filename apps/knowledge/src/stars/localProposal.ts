import type { PageManifestEntry } from "../domain/page";
import type { StarsProposal, StarsRelationType } from "./schema";
import { buildStarsLayout, STARS_TEMPLATE_LABELS, templateForQuery } from "./templates";

const STOP = new Set(["about", "and", "for", "from", "models", "of", "the", "with"]);

function terms(query: string) {
  return query.toLowerCase().match(/[a-z0-9]{3,}/g)?.filter(term => !STOP.has(term)) ?? [];
}

function score(entry: PageManifestEntry, queryTerms: string[]) {
  const title = entry.title.toLowerCase();
  const tags = entry.tags.join(" ").toLowerCase();
  const excerpt = entry.excerpt.toLowerCase();
  return queryTerms.reduce((total, term) => total + (title.includes(term) ? 5 : 0) + (tags.includes(term) ? 3 : 0) + (excerpt.includes(term) ? 1 : 0), 0);
}

function relationType(index: number): StarsRelationType {
  return (["supports", "extends", "builds_on", "complicates"] as const)[index % 4]!;
}

export function buildLocalStarsProposal(query: string, entries: PageManifestEntry[]): StarsProposal {
  const queryTerms = terms(query);
  const ranked = entries
    .map(entry => ({ entry, score: score(entry, queryTerms) }))
    .sort((left, right) => right.score - left.score || String(right.entry.created_at ?? "").localeCompare(String(left.entry.created_at ?? "")));
  const count = Math.min(8, ranked.length);
  if (count < 5) throw new Error("Stars needs at least five notes in the local archive.");
  const notes = ranked.slice(0, count).map(({ entry }, index) => ({
    pageId: entry.id,
    title: entry.title,
    excerpt: entry.excerpt,
    role: index === 0 ? "Starting point" : index === count - 1 ? "Implication" : "Connected perspective",
  }));
  const templateId = templateForQuery(query);
  const relations = buildStarsLayout(templateId, notes.length).segments.map((segment, index) => ({
    sourceId: notes[segment.source]!.pageId,
    targetId: notes[segment.target]!.pageId,
    type: relationType(index),
    explanation: `${notes[segment.source]!.title} connects with ${notes[segment.target]!.title} in this reading of the archive.`,
  }));
  return {
    version: 1,
    query,
    title: query.replace(/\b\w/g, letter => letter.toUpperCase()),
    symbol: {
      templateId,
      label: STARS_TEMPLATE_LABELS[templateId],
      meaning: `The ${STARS_TEMPLATE_LABELS[templateId].toLowerCase()} gives these notes a memorable shared shape.`,
    },
    notes,
    relations,
    synthesis: {
      summary: `Together, these notes frame ${query} as a connected problem rather than a single model. The strongest shared ideas sit across the selected sources, while the differences show where the archive still needs judgement.`,
      claims: [
        { text: `The archive treats ${query} as a relationship among several mechanisms.`, sourceIds: notes.slice(0, 3).map(note => note.pageId) },
        { text: "The selected accounts extend and complicate one another rather than forming one settled explanation.", sourceIds: notes.slice(3, 6).map(note => note.pageId) },
      ],
      tensions: ["The selected notes work at different explanatory levels."],
      gaps: ["Review the full notes before treating this constellation as a final account."],
    },
  };
}
