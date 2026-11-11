import type { PublicQuestion } from '../../../quiz/core';
import type { ItemKey } from '../../core/model';
import type { PublicItem } from '../../core/schema';

/**
 * Pieces Jeopardy and team match share: team names and colours as the
 * approved mockups draw them, and the right answer of an item in words
 * (shown only after a reveal). Pure, no DOM.
 */

/** Team names in the approved mockups (games.js, team-match.html). Team numbers are 0-based. */
export const TEAM_NAMES = ['Kestrels', 'Otters', 'Foxes', 'Herons', 'Wrens', 'Magpies'] as const;

export const teamName = (team: number): string => TEAM_NAMES[team % TEAM_NAMES.length] ?? `Team ${team + 1}`;
/** The team's colour token (games.css has 1–4; the kinds' CSS adds 5 and 6, proposed in team-match.html). */
export const teamColour = (team: number): string => `var(--game-team-${(team % 6) + 1})`;
export const teamSoft = (team: number): string => `var(--game-team-${(team % 6) + 1}-soft)`;

/** Rounded to the nearest 10 (spec §6.3: "rounded to 10"). */
export const round10 = (n: number): number => Math.round(n / 10) * 10 || 0;

type Choice = { id: string; text: string };
const choicesOf = (q: PublicQuestion): Choice[] => {
  const r = q as unknown as Record<string, unknown>;
  for (const k of ['options', 'segments', 'items', 'labels', 'right']) if (Array.isArray(r[k])) return r[k] as Choice[];
  return [];
};

/**
 * The right answer of an item, in words: the term, the speaker, the right
 * option(s) of a question. Server only until the item is revealed.
 */
export function answerText(item: PublicItem | undefined, key: ItemKey | undefined): string {
  if (!key) return '';
  if (key.shape === 'term') return key.label || key.answers[0] || '';
  if (key.shape === 'quote') return key.speaker_name || key.speaker;
  if (key.shape === 'wall') return key.label;
  const q = item?.shape === 'question' ? (item.question as unknown as PublicQuestion) : null;
  const a = key.key.answer;
  const opts = q ? choicesOf(q) : [];
  const text = (id: string) => opts.find((o) => o.id === id)?.text ?? '';
  switch (a.type) {
    case 'choice':
      return a.ids.map(text).filter(Boolean).join(' · ');
    case 'boolean':
      return a.value ? 'True' : 'False';
    case 'text':
      return a.accepted[0] ?? '';
    case 'gaps':
      return Object.values(a.gaps)
        .map((g) => g[0] ?? '')
        .join(' · ');
    case 'order':
      return a.ids.map(text).filter(Boolean).join(' → ');
    case 'map': {
      const all = q ? [...choicesOf(q), ...(((q as unknown as { left?: Choice[]; groups?: Choice[] }).left ?? []) as Choice[]), ...(((q as unknown as { groups?: Choice[] }).groups ?? []) as Choice[])] : [];
      const t = (id: string) => all.find((o) => o.id === id)?.text ?? id;
      return Object.entries(a.map)
        .map(([k, v]) => `${t(k)} → ${t(v)}`)
        .join(' · ');
    }
    case 'spots':
    {
      const words = a.passage.split(/\s+/).filter(Boolean);
      return a.targets.map((s) => words.slice(s.from, s.to + 1).join(' ')).join(' · ');
    }
    default:
      return '';
  }
}

/** The single right option of a choice question (team match needs exactly one), or null. */
export function singleChoice(item: PublicItem | undefined, key: ItemKey | undefined): { right: string; others: string[] } | null {
  if (!item || item.shape !== 'question' || key?.shape !== 'question' || key.key.answer.type !== 'choice' || key.key.answer.ids.length !== 1) return null;
  const opts = choicesOf(item.question as unknown as PublicQuestion);
  const rightId = key.key.answer.ids[0];
  const right = opts.find((o) => o.id === rightId)?.text;
  if (!right) return null;
  return { right, others: opts.filter((o) => o.id !== rightId).map((o) => o.text) };
}
