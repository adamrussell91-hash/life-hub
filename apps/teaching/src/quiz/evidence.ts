import { matchSpots, norm, passageWords, spotList, type PublicQuestion, type QuestionKey } from './core';

/**
 * Evidence: what one marked answer says about each thing it tests. One
 * adapter per answer type, so every insight view reads the same records
 * whatever the quiz kind. Shared with the server (quiz-evidence.mjs).
 */

export type Why =
  | { type: 'option'; id: string; text: string }
  | { type: 'named'; as: string; target: string }
  | { type: 'not_found'; target: string }
  | { type: 'placement'; id: string; text: string }
  | { type: 'code'; id: string };

/** One thing an answer tells us: tags, share of marks (null while waiting to be marked), and why marks were lost. */
export type EvidenceItem = { item: string; tags: string[]; share: number | null; why: Why[] };

export type AnswerInput = {
  question: PublicQuestion;
  key: QuestionKey;
  response: unknown;
  /** Marks after hints and teacher marking; null while waiting. */
  awarded: number | null;
  /** Teacher feedback-code ids on this answer. */
  codes?: string[];
  /** The lesson's outcomes, for questions without their own. */
  fallbackOutcomes?: string[];
};

/** A technique tag: the catalogue id when known, else the normalised name for the browser to resolve. */
export function techTag(id: string | undefined, text: string): string {
  return id ? `tech:${id}` : `tech:~${norm(text)}`;
}

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
const unique = (xs: string[]): string[] => [...new Set(xs)];

/** The text of a public option, segment, item, label or left-hand side. */
function textOf(question: PublicQuestion, id: string): string {
  const q = question as unknown as Record<string, unknown>;
  for (const field of ['options', 'segments', 'items', 'labels', 'left', 'right', 'groups']) {
    const list = q[field];
    if (!Array.isArray(list)) continue;
    const hit = (list as Array<{ id?: string; text?: string }>).find((o) => o?.id === id);
    if (hit) return String(hit.text ?? '');
  }
  if (question.kind === 'label_image') {
    const pin = question.pins.find((p) => p.id === id);
    if (pin) return `Pin ${pin.n}`;
  }
  return '';
}

/** The technique tag of a public option, on technique kinds only. */
function techOf(question: PublicQuestion, key: QuestionKey, optionId: string): string | null {
  if (question.kind !== 'quote_technique' && question.kind !== 'spot_technique') return null;
  const id = key.techniques?.[optionId];
  const text = textOf(question, optionId);
  if (!id && !text.trim()) return null;
  return techTag(id || undefined, text);
}

export function answerEvidence(input: AnswerInput): EvidenceItem[] {
  const { question, key } = input;
  const base = [
    ...(key.outcomes?.length ? key.outcomes : input.fallbackOutcomes ?? []).map((o) => `out:${o}`),
    ...(key.skills ?? []).map((s) => `skill:${s}`),
    ...(key.pieces ?? []).map((p) => `kp:${p}`)
  ];
  const codes: Why[] = (input.codes ?? []).map((id) => ({ type: 'code', id }));
  const share = input.awarded === null ? null : key.marks > 0 ? Math.min(1, Math.max(0, input.awarded / key.marks)) : null;
  const r = isRecord(input.response) ? input.response : {};
  const a = key.answer;
  const one = (tags: string[], why: Why[]): EvidenceItem[] => [
    { item: key.id, tags: unique([...base, ...tags]), share, why: share === null || share >= 1 ? [] : [...why, ...codes] }
  ];

  switch (a.type) {
    case 'spots':
      return spotEvidence(input, a, base, codes);
    case 'choice': {
      const right = new Set(a.ids);
      const targets = a.ids.map((id) => techOf(question, key, id)).filter((t): t is string => !!t);
      const why = strings(r.selected)
        .filter((id) => !right.has(id))
        .map((id): Why => {
          const as = techOf(question, key, id);
          return as && targets[0] ? { type: 'named', as, target: targets[0] } : { type: 'option', id, text: textOf(question, id) };
        });
      return one(targets, why);
    }
    case 'map': {
      const given = isRecord(r.map) ? r.map : {};
      const why = Object.entries(a.map)
        .filter(([from, to]) => given[from] !== to)
        .map(([from]): Why => ({ type: 'placement', id: from, text: textOf(question, from) }));
      return one([], why);
    }
    case 'order': {
      const given = strings(r.order);
      const why = a.ids.filter((id, i) => given[i] !== id).map((id): Why => ({ type: 'placement', id, text: textOf(question, id) }));
      return one([], why);
    }
    default:
      return one([], []);
  }
}

/**
 * One item per target, so a passage testing a simile and a metaphor counts
 * towards each. Right words, right name: 1. Right words, wrong name: 0.5.
 * Missed: 0, but only when students had to find every target; with
 * "find any N", targets nobody was asked to find aren't counted.
 * The per-target shares follow the automatic marking, not a teacher override.
 */
function spotEvidence(input: AnswerInput, a: Extract<QuestionKey['answer'], { type: 'spots' }>, base: string[], codes: Why[]): EvidenceItem[] {
  const { question, key } = input;
  const r = isRecord(input.response) ? input.response : {};
  const spots = spotList(r.spots).slice(0, a.pick);
  const found = matchSpots(passageWords(a.passage), spots, a.targets);
  const every = a.pick >= a.targets.length;
  const out: EvidenceItem[] = [];
  a.targets.forEach((target, t) => {
    const techs = target.ids.map((id) => techOf(question, key, id)).filter((x): x is string => !!x);
    const tags = unique([...base, ...techs]);
    const first = techs[0];
    const item = `${key.id}#${t}`;
    const at = found.findIndex((f) => f === t);
    if (at === -1) {
      if (every) out.push({ item, tags, share: 0, why: [...(first ? [{ type: 'not_found', target: first } as Why] : []), ...codes] });
      return;
    }
    const spot = spots[at] as (typeof spots)[number];
    const named = target.ids.includes(spot.option);
    const as = techOf(question, key, spot.option);
    out.push({ item, tags, share: named ? 1 : 0.5, why: named ? [] : [...(as && first ? [{ type: 'named', as, target: first } as Why] : []), ...codes] });
  });
  return out;
}
