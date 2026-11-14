import type { JournalDocument } from '@/api/journal';

/** Where a noticing came from. Shown on the card, so the reader knows what it rests on. */
export type NoticeSource = 'trip' | 'past' | 'food' | 'diary' | 'wishes' | 'photos' | 'books';

export const SOURCE_LINE: Record<NoticeSource, string> = {
  trip: 'From this trip',
  past: 'From your past trips',
  food: 'From your food journal',
  diary: 'From your diary',
  wishes: 'From your bucket list',
  photos: 'Claude noticed in today’s photos',
  books: 'From your bookshelf',
};

export interface NoticePhoto {
  tripId: string;
  mediaId: string;
}

export interface NoticeStat {
  value: string;
  label: string;
}

/** One true thing about the trip, with what it is based on. */
export interface NoticeCard {
  /** Stable for the same noticing, so it is never shown twice. */
  key: string;
  kind: string;
  source: NoticeSource;
  /** The trip day it is about. */
  day: string;
  headline: string;
  body?: string;
  stats?: NoticeStat[];
  photos?: NoticePhoto[];
  /** One small line: what this was worked out from. */
  basis: string;
  /** Where it pins when kept. */
  momentId?: string;
  /** Higher shows first. */
  score: number;
}

export const NOTICING_PREF_KEY = 'journal_noticing_v1';
export const NOTICES_PER_DAY = 5;

export interface NoticingState {
  seen: string[];
  dismissed: string[];
  kept: Record<string, NoticeCard>;
}

const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];

function isCard(value: unknown): value is NoticeCard {
  const c = value as NoticeCard | null;
  return Boolean(c && typeof c === 'object' && typeof c.key === 'string' && typeof c.headline === 'string' && typeof c.basis === 'string' && typeof c.day === 'string');
}

export function readNoticingState(journal: JournalDocument): NoticingState {
  const raw = journal.preferences?.[NOTICING_PREF_KEY] as Partial<NoticingState> | undefined;
  const kept: Record<string, NoticeCard> = {};
  if (raw?.kept && typeof raw.kept === 'object') {
    for (const [key, card] of Object.entries(raw.kept)) if (isCard(card)) kept[key] = card;
  }
  return { seen: strings(raw?.seen), dismissed: strings(raw?.dismissed), kept };
}

function writeNoticingState(journal: JournalDocument, state: NoticingState): JournalDocument {
  return {
    ...journal,
    revision: journal.revision + 1,
    preferences: { ...(journal.preferences ?? {}), [NOTICING_PREF_KEY]: state },
  };
}

const add = (list: string[], keys: string[]): string[] => [...new Set([...list, ...keys])];

/** The cards were looked at: they are not offered again. */
export function markSeen(journal: JournalDocument, keys: string[]): JournalDocument {
  const state = readNoticingState(journal);
  if (keys.every((k) => state.seen.includes(k))) return journal;
  return writeNoticingState(journal, { ...state, seen: add(state.seen, keys) });
}

/** "Keep in the story": the card is stored whole, so it reads the same long after the trip. */
export function keepCard(journal: JournalDocument, card: NoticeCard): JournalDocument {
  const state = readNoticingState(journal);
  return writeNoticingState(journal, { ...state, seen: add(state.seen, [card.key]), kept: { ...state.kept, [card.key]: card } });
}

/** Take a kept card back out of the story. It is not offered again. */
export function unkeepCard(journal: JournalDocument, key: string): JournalDocument {
  const state = readNoticingState(journal);
  if (!state.kept[key]) return journal;
  const { [key]: _gone, ...kept } = state.kept;
  return writeNoticingState(journal, { ...state, kept });
}

/** "Not right": gone, and that noticing is not made again. */
export function dismissCard(journal: JournalDocument, key: string): JournalDocument {
  const state = readNoticingState(journal);
  const { [key]: _gone, ...kept } = state.kept;
  return writeNoticingState(journal, { seen: add(state.seen, [key]), dismissed: add(state.dismissed, [key]), kept });
}

/** The cards to offer now: unseen, best first, never more than five. */
export function cardsToOffer(cards: NoticeCard[], state: NoticingState): NoticeCard[] {
  const hidden = new Set([...state.seen, ...state.dismissed, ...Object.keys(state.kept)]);
  const seenKeys = new Set<string>();
  return cards
    .filter((card) => {
      if (hidden.has(card.key) || seenKeys.has(card.key)) return false;
      seenKeys.add(card.key);
      return true;
    })
    .sort((a, b) => b.score - a.score || a.key.localeCompare(b.key))
    .slice(0, NOTICES_PER_DAY);
}

/** Kept cards for one day of the story, best first. */
export function keptForDay(state: NoticingState, day: string): NoticeCard[] {
  return Object.values(state.kept)
    .filter((card) => card.day === day)
    .sort((a, b) => b.score - a.score || a.key.localeCompare(b.key));
}

/** Words that would make a card sound like a reproach. A test holds every card to this. */
export const UNKIND_WORDING = /\b(you asked|you said you wanted|finally|at last|about time)\b/i;
