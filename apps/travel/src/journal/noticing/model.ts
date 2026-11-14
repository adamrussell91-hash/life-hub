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
  /** Replaces the usual source line ("From your dreams jar"). */
  sourceLabel?: string;
  /** The owner's own words that show it: an itinerary item or a moment. */
  evidence?: { label: string; text: string };
  /** A bucket-list or dreams-jar item in Tasks that this day fulfilled. */
  wish?: { taskId: string; list: string };
  /** The owner ticked that item off in Tasks from this card. */
  ticked?: boolean;
  /** Higher shows first. */
  score: number;
}

export const NOTICING_PREF_KEY = 'journal_noticing_v1';
export const NOTICES_PER_DAY = 5;

/** Requests that go to the server once per trip day. */
export type AskKind = 'wishes' | 'photos';
export const ASK_TRIES = 2;

export interface NoticingState {
  seen: string[];
  dismissed: string[];
  kept: Record<string, NoticeCard>;
  /** Cards the server made that are still waiting to be looked at or acted on. */
  made: Record<string, NoticeCard>;
  /** Days already asked about, by kind, so each day costs one request. */
  asked: Partial<Record<AskKind, string[]>>;
  /** Failed requests, by "kind:day". After two the day is left alone. */
  tries: Record<string, number>;
}

const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];

function isCard(value: unknown): value is NoticeCard {
  const c = value as NoticeCard | null;
  return Boolean(c && typeof c === 'object' && typeof c.key === 'string' && typeof c.headline === 'string' && typeof c.basis === 'string' && typeof c.day === 'string');
}

function cardMap(value: unknown): Record<string, NoticeCard> {
  const out: Record<string, NoticeCard> = {};
  if (value && typeof value === 'object') {
    for (const [key, card] of Object.entries(value)) if (isCard(card)) out[key] = card;
  }
  return out;
}

export function readNoticingState(journal: JournalDocument): NoticingState {
  const raw = journal.preferences?.[NOTICING_PREF_KEY] as Partial<NoticingState> | undefined;
  const tries: Record<string, number> = {};
  if (raw?.tries && typeof raw.tries === 'object') {
    for (const [key, n] of Object.entries(raw.tries)) if (typeof n === 'number' && Number.isFinite(n)) tries[key] = n;
  }
  return {
    seen: strings(raw?.seen),
    dismissed: strings(raw?.dismissed),
    kept: cardMap(raw?.kept),
    made: cardMap(raw?.made),
    asked: { wishes: strings(raw?.asked?.wishes), photos: strings(raw?.asked?.photos) },
    tries,
  };
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
  const { [card.key]: _made, ...made } = state.made;
  return writeNoticingState(journal, { ...state, made, seen: add(state.seen, [card.key]), kept: { ...state.kept, [card.key]: card } });
}

/** Should this trip day be asked about? Once per day, and a failing day is left after two tries. */
export function shouldAsk(state: NoticingState, kind: AskKind, day: string): boolean {
  return !(state.asked[kind] ?? []).includes(day) && (state.tries[`${kind}:${day}`] ?? 0) < ASK_TRIES;
}

/** The server answered for this day: keep its cards until they are dealt with, and do not ask again. */
export function recordAsked(journal: JournalDocument, kind: AskKind, day: string, cards: NoticeCard[]): JournalDocument {
  const state = readNoticingState(journal);
  const hidden = new Set([...state.dismissed, ...Object.keys(state.kept)]);
  const made = { ...state.made };
  for (const card of cards) if (isCard(card) && !hidden.has(card.key)) made[card.key] = card;
  return writeNoticingState(journal, { ...state, made, asked: { ...state.asked, [kind]: add(state.asked[kind] ?? [], [day]) } });
}

/** The request failed: count it, so a day that keeps failing is left alone. */
export function recordTry(journal: JournalDocument, kind: AskKind, day: string): JournalDocument {
  const state = readNoticingState(journal);
  const key = `${kind}:${day}`;
  return writeNoticingState(journal, { ...state, tries: { ...state.tries, [key]: (state.tries[key] ?? 0) + 1 } });
}

/** A card that waits until the owner acts on it, rather than going once looked at. */
export const waitsForAnswer = (card: NoticeCard): boolean => Boolean(card.wish);

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
  const { [key]: _made, ...made } = state.made;
  return writeNoticingState(journal, { ...state, seen: add(state.seen, [key]), dismissed: add(state.dismissed, [key]), kept, made });
}

/** The cards to offer now: unseen, best first, never more than five. Cards the server made wait here too. */
export function cardsToOffer(cards: NoticeCard[], state: NoticingState): NoticeCard[] {
  const hidden = new Set([...state.seen, ...state.dismissed, ...Object.keys(state.kept)]);
  const seenKeys = new Set<string>();
  return [...Object.values(state.made), ...cards]
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
