/**
 * How a returned piece went against the student's own last piece of the same kind.
 * Worked out from where the teacher placed it; nothing extra is marked and no mark leaves.
 */
import { rankOf } from './progress-steps.mjs';

/** The three kinds a student is told apart by: written, spoken, short answer. */
export const kindGroup = (kind) => (kind === 'viva' ? 'spoken' : kind === 'quiz' || kind === 'answer' ? 'short' : 'written');

const DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney', year: 'numeric', month: '2-digit', day: '2-digit' });
/** YYYY-MM-DD in Sydney, so pieces returned on one day sit together. */
export const sydneyDayOf = (iso) => {
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? '' : DAY.format(at);
};

/** The code ids marked as strengths and as things to work on. */
export function codeSides(tags) {
  const good = new Set();
  const work = new Set();
  for (const t of tags ?? []) (t.positive ? good : work).add(t.code_id);
  return { good: [...good], work: [...work] };
}

/**
 * `first`: nothing earlier of this kind. `better` / `same` / `mixed` / `lower`: the places both
 * pieces share, compared. `counts`: no shared place, so how many things were done well and how
 * many to work on. Null when the piece has neither places nor codes.
 */
export function verdictOf(piece, earlier) {
  const { good, work } = codeSides(piece.tags);
  const counts = () => (good.length + work.length ? { kind: 'counts', good: good.length, work: work.length } : null);
  const places = piece.places ?? {};
  const keys = Object.keys(places);
  if (!keys.length) return counts();
  if (!earlier) return { kind: 'first', up: [], same: [], down: [] };
  const shared = keys.filter((k) => earlier.places?.[k]);
  if (!shared.length) return counts();
  const up = [];
  const same = [];
  const down = [];
  for (const k of shared) {
    const move = rankOf(places[k]) - rankOf(earlier.places[k]);
    (move > 0 ? up : move < 0 ? down : same).push(k);
  }
  const kind = up.length > down.length ? 'better' : down.length > up.length ? 'lower' : up.length ? 'mixed' : 'same';
  return { kind, up, same, down };
}

/** The earlier piece of the same kind, from a list sorted oldest first. */
export const earlierOf = (pieces, piece) => pieces.filter((p) => p.at < piece.at && p.kind === piece.kind).at(-1) ?? null;
