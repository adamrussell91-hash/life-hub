import type { ShelfKind } from "./schema";

/**
 * How every Bookshelf view names and colours a note's kind (failure register V4:
 * one source). Crystallised kinds (person, idea, case) are calm inks; fluid kinds
 * (debate, bridge) are the bright ones, because they're where thinking moves.
 */

/** Legend and picker order: crystallised first, then fluid. */
export const KIND_ORDER: readonly ShelfKind[] = ["idea", "person", "case", "debate", "bridge"];

export const KIND_WORD: Record<ShelfKind, string> = {
  person: "person",
  idea: "idea",
  case: "case",
  debate: "debate",
  bridge: "bridge",
};

/** Plain description for the legend and the picker's tooltip. */
export const KIND_MEANING: Record<ShelfKind, string> = {
  person: "Who someone is and what they contributed",
  idea: "A concept, term or mechanism, explained",
  case: "A specific event, study or example",
  debate: "Where knowledge isn't settled",
  bridge: "Where the idea leads out of the book",
};

/** Mark colour: spine ticks, card rails, threads. */
export const KIND_COLOUR: Record<ShelfKind, string> = {
  person: "var(--pastel-lilac-ink)",
  idea: "var(--pastel-blue-ink)",
  case: "var(--pastel-gold-ink)",
  // Not --high-sea: that orange already means "matches your search" on the shelf.
  debate: "#c4472c",
  bridge: "#3f8a63",
};

/** Text colour: the bright fluid marks are too light to read as words on paper. */
export const KIND_INK: Record<ShelfKind, string> = { ...KIND_COLOUR, debate: "#9e3820", bridge: "#2f6e4e" };

export const KIND_UNKNOWN = "var(--shallow)";

export function kindColour(kind?: ShelfKind) {
  return kind ? KIND_COLOUR[kind] : KIND_UNKNOWN;
}

/** "debate", or "bridge?" when Claude's grade is a guess. */
export function kindLabel(note: { kind?: ShelfKind; kindGuessed?: boolean }) {
  if (!note.kind) return "";
  return `${KIND_WORD[note.kind]}${note.kindGuessed ? "?" : ""}`;
}

/** Counts per kind, in legend order, leaving out kinds with none. */
export function kindTally(notes: Array<{ kind?: ShelfKind }>) {
  const counts = new Map<ShelfKind, number>();
  for (const note of notes) if (note.kind) counts.set(note.kind, (counts.get(note.kind) ?? 0) + 1);
  return KIND_ORDER.filter(kind => counts.get(kind)).map(kind => ({ kind, count: counts.get(kind)! }));
}
