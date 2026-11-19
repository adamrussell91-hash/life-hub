import type { Lesson } from '@/schemas/lesson';
import { FLEET_BRIEF_HEAD, type FleetGridDraft } from '@/ai/fleet-grid-draft';
import { TEACHING_AI_MODELS, estimateCostUsd, usdToAud } from '@/ai/job-runner';
import { FLEET_SIZE, GameLessonSchema, type GameOf, type QuestionItem } from '../../core/schema';
import { newGameId } from '../../seed';
import type { UnitSources } from '../../api';
import { placeInFleet, shortAnswer } from './editor';

/**
 * Ann drafts a Fleet week grid (spec 2026-11-19, Out of scope and §5). The
 * editor sends a brief built from the unit only (organiser lines, short-answer
 * quiz questions, quotes) with a price; Ann replies with a priced plan; once
 * the teacher answers it she proposes `fleet_grid_draft`, and Accept puts it
 * into blank slots only. Nothing publishes on its own.
 */

type Fleet = GameOf<'fleet_week'>;

/** The job API refuses messages longer than this. */
const BRIEF_MAX = 8000;
const LINE_MAX = 240;

const clip = (text: string, max = LINE_MAX) => {
  const one = text.replace(/\s+/g, ' ').trim();
  return one.length > max ? `${one.slice(0, max - 1)}…` : one;
};

/**
 * The unit pack: what the unit already teaches, as plain lines. Only item
 * text goes in (no lesson ids, students or results), so Ann drafts from the
 * unit and nothing else.
 */
export function fleetDraftPack(sources: UnitSources): { organiser: string[]; questions: string[]; quotes: string[] } {
  const organiser = sources.terms.flatMap((t) => {
    const clue = (t.item.clues.find((c) => c.kind === 'definition') ?? t.item.clues[0])?.text?.trim();
    return t.item.term.trim() ? [clip(`${t.item.term.trim()}${clue ? `: ${clue}` : ''}`)] : [];
  });
  const questions = sources.questions.flatMap((s) => {
    const q = s.item.question as unknown as { kind?: string; prompt?: string; accepted?: string[] };
    if (q.kind !== 'short_answer' || !q.prompt?.trim()) return [];
    const answers = (q.accepted ?? []).map((a) => a.trim()).filter(Boolean);
    return [clip(`${q.prompt.trim()}${answers.length ? ` → ${answers.join(' / ')}` : ''}`)];
  });
  const quotes = sources.quotes.flatMap((u) => (u.item.text.trim() ? [clip(`“${u.item.text.trim()}”${u.attribution.trim() ? ` (${u.attribution.trim()})` : ''}`)] : []));
  return { organiser, questions, quotes };
}

export const isPackEmpty = (pack: ReturnType<typeof fleetDraftPack>) => !pack.organiser.length && !pack.questions.length && !pack.quotes.length;

/** About four characters a token. Rough: the usage log holds what was spent. */
const tokens = (chars: number) => Math.ceil(chars / 4);
/** Ann's static prompt (persona, recipes, examples) runs to about this many tokens. */
const STATIC_TOKENS = 26_000;
/** A plan, then 50 short answers, 4 recall lines and 10 labels with her note. */
const PLAN_OUT = 900;
const DRAFT_OUT = 7_000;

/** The price shown before Ann starts and repeated in her plan: a plan turn and a build turn on the standard model, uncached. */
export function estimateFleetDraft(input: { briefChars: number; lessonChars: number }): { cost_usd: number; cost_aud: number } {
  const model = TEACHING_AI_MODELS.standard;
  const turnIn = STATIC_TOKENS + tokens(input.briefChars + input.lessonChars);
  const usd =
    estimateCostUsd(model, { input_tokens: turnIn, output_tokens: PLAN_OUT }) +
    estimateCostUsd(model, { input_tokens: turnIn + PLAN_OUT, output_tokens: DRAFT_OUT });
  const cost_usd = Math.round(usd * 1_000_000) / 1_000_000;
  return { cost_usd, cost_aud: usdToAud(cost_usd) };
}

export const audText = (aud: number) => `about A$${Math.max(0.01, aud).toFixed(2)}`;

/** What Ann is told. Starts with FLEET_BRIEF_HEAD so the runner holds the draft behind a confirmed, priced plan and keeps her to the unit pack. */
export function fleetDraftBrief(input: { gameId: string; gameTitle: string; pack: ReturnType<typeof fleetDraftPack>; lessonChars: number }): { brief: string; cost_aud: number } {
  const lists = { organiser: [...input.pack.organiser], questions: [...input.pack.questions], quotes: [...input.pack.quotes] };
  const section = (title: string, lines: string[]) => (lines.length ? `${title}:\n${lines.map((l) => `- ${l}`).join('\n')}` : '');
  const build = (price: string) =>
    [
      `${FLEET_BRIEF_HEAD} for "${clip(input.gameTitle || 'Fleet week', 80)}" (game_id ${input.gameId}).`,
      'Draft the whole grid with propose_fleet_grid_draft: five column labels and five row labels (at most 40 characters each), two short-answer variants on the same idea for each of the 25 squares (1 to 10 accepted answers each), and four recall lines (a key quote or term to complete).',
      'Use only the unit material below. Do not use notes, other lessons, the web or anything about real people beyond what the unit material says. Keep every prompt short and every accepted answer a word or short phrase.',
      `First reply with a short plan headed "Plan to confirm": your labels, which material each row draws on, and the price, ${price}. Do not propose the grid until I answer the plan. The editor puts the draft into blank slots only.`,
      section('Unit organiser lines', lists.organiser),
      section('Unit quiz questions', lists.questions),
      section('Unit quotes', lists.quotes)
    ]
      .filter(Boolean)
      .join('\n\n');
  // Trim the longest list until the brief fits, then price what is sent.
  let brief = build(audText(9.99));
  while (brief.length > BRIEF_MAX) {
    const longest = [lists.organiser, lists.questions, lists.quotes].sort((a, b) => b.length - a.length)[0]!;
    if (!longest.length) break;
    longest.pop();
    brief = build(audText(9.99));
  }
  const { cost_aud } = estimateFleetDraft({ briefChars: brief.length, lessonChars: input.lessonChars });
  brief = build(audText(cost_aud));
  return { brief: brief.slice(0, BRIEF_MAX), cost_aud };
}

const isBlankLabel = (s: string | undefined) => !s?.trim();

/**
 * Accept: the draft goes into the named game's blank slots only. A label the
 * teacher wrote, or a variant or recall line with any text, is kept as it is.
 */
export function applyFleetGridDraft(
  lesson: Lesson,
  draft: FleetGridDraft,
  nextId: () => string = () => newGameId('i')
): { ok: boolean; message?: string; lesson: Lesson; added: number } {
  const gameLesson = lesson.game ? GameLessonSchema.parse(lesson.game) : null;
  const found = gameLesson?.games.find((g) => g.id === draft.game_id);
  if (!gameLesson || !found) return { ok: false, message: 'That Fleet week game is no longer in this lesson.', lesson, added: 0 };
  if (found.kind !== 'fleet_week') return { ok: false, message: 'That game is not a Fleet week game.', lesson, added: 0 };
  const tags = { pieces: [], outcomes: [], skills: [], tech: [] };
  const item = (q: { prompt: string; accepted: string[] }): QuestionItem => shortAnswer(nextId(), q.prompt, q.accepted, tags);

  let game: Fleet = found;
  let added = 0;
  const labels = (axis: 'columns' | 'rows') =>
    Array.from({ length: FLEET_SIZE }, (_, i) => {
      const have = game[axis][i];
      if (!isBlankLabel(have)) return have!;
      added++;
      return draft[axis][i]!.trim();
    });
  game = { ...game, columns: labels('columns'), rows: labels('rows') };
  draft.squares.forEach((square, i) => {
    const placed = placeInFleet(game, i, square.variants.map(item));
    game = placed.game;
    added += placed.added;
  });
  const recall = placeInFleet(game, 'recall', draft.recall.map(item));
  game = recall.game;
  added += recall.added;

  const games = gameLesson.games.map((g) => (g.id === draft.game_id ? game : g));
  return {
    ok: true,
    message: added ? `Ann’s draft filled ${added} blank ${added === 1 ? 'slot' : 'slots'}.` : 'Every slot already had content, so nothing changed.',
    lesson: { ...lesson, game: { ...gameLesson, games } },
    added
  };
}
