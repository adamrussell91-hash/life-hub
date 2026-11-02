/** Server check for a scope's knowledge plan. Mirrors KnowledgePlanSchema in apps/teaching/src/schemas/scope-sequence.ts. */

const LIMITS = { target: 600, text: 300, word: 60, label: 40, units: 60, items: 30, words: 40, weeks: 24 };
const ITEM_ID = /^ki_[a-z0-9]{4,16}$/;
const WEEK_ID = /^kw_[a-z0-9]{4,16}$/;
const PIECE_ID = /^kp_[a-z0-9]{4,16}$/;

class Invalid extends Error {}

function text(value, max) {
  if (value === undefined) return '';
  if (typeof value !== 'string' || value.trim().length > max) throw new Invalid();
  return value.trim();
}

function list(value, max) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > max) throw new Invalid();
  return value;
}

function itemIds(value) {
  const ids = list(value, LIMITS.items);
  if (ids.some((id) => typeof id !== 'string' || !ITEM_ID.test(id))) throw new Invalid();
  return ids;
}

const words = (value) => list(value, LIMITS.words).map((w) => text(w, LIMITS.word));

function items(value) {
  return list(value, LIMITS.items).map((raw) => {
    if (typeof raw?.id !== 'string' || !ITEM_ID.test(raw.id)) throw new Invalid();
    if (raw.piece_id !== undefined && (typeof raw.piece_id !== 'string' || !PIECE_ID.test(raw.piece_id))) throw new Invalid();
    return { id: raw.id, text: text(raw.text, LIMITS.text), ...(raw.piece_id ? { piece_id: raw.piece_id } : {}) };
  });
}

function already(value) {
  return list(value, LIMITS.items).map((raw) => {
    if (raw?.from === 'plan') {
      if (typeof raw.item_id !== 'string' || !ITEM_ID.test(raw.item_id)) throw new Invalid();
      return { from: 'plan', item_id: raw.item_id };
    }
    if (raw?.from === 'before' || raw?.from === 'untaught') return { from: raw.from, text: text(raw.text, LIMITS.text) };
    throw new Invalid();
  });
}

function week(raw) {
  if (typeof raw?.id !== 'string' || !WEEK_ID.test(raw.id)) throw new Invalid();
  return {
    id: raw.id,
    label: text(raw.label, LIMITS.label),
    question: text(raw.question, LIMITS.text),
    already: already(raw.already),
    must_ids: itemIds(raw.must_ids),
    skill_ids: itemIds(raw.skill_ids),
    words: words(raw.words),
    check: text(raw.check, LIMITS.text)
  };
}

function unit(raw) {
  if (typeof raw?.unit_id !== 'string' || !raw.unit_id) throw new Invalid();
  return {
    unit_id: raw.unit_id,
    big_idea: text(raw.big_idea, LIMITS.text),
    already: already(raw.already),
    must: items(raw.must),
    words: words(raw.words),
    skills: items(raw.skills),
    assessed_by: text(raw.assessed_by, LIMITS.text),
    leads_on: text(raw.leads_on, LIMITS.text),
    weeks: list(raw.weeks, LIMITS.weeks).map(week)
  };
}

export function parseKnowledgePlan(raw) {
  try {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new Invalid();
    return { knowledge_plan: { year_target: text(raw.year_target, LIMITS.target), units: list(raw.units, LIMITS.units).map(unit) } };
  } catch (err) {
    if (err instanceof Invalid) return { error: 'knowledge_plan is invalid' };
    throw err;
  }
}
