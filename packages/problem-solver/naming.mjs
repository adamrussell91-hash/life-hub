// packages/problem-solver/naming.mjs
// The Correspond naming rules for a case file's name, in our words. Five are strict and
// checked here; three need judgement and are left to the coach (Adam, 20 October 2026).

export const NAME_MAX = 260;

/** In the book's order. `kind`: do (yellow dot) or dont (red dot). `check`: strict (here) or coach. */
export const NAMING_RULES = Object.freeze([
  { id: 'meaningful', label: 'A short name that says what it holds', kind: 'do', check: 'coach' },
  { id: 'private', label: 'No names or abbreviations only you would know', kind: 'dont', check: 'coach' },
  { id: 'consistent', label: 'Named the same way as related records', kind: 'do', check: 'coach' },
  { id: 'date', label: 'The date as YYYYMMDD', kind: 'do', check: 'strict' },
  { id: 'length', label: `No more than ${NAME_MAX} characters`, kind: 'dont', check: 'strict' },
  { id: 'version', label: 'A version, such as v1', kind: 'do', check: 'strict' },
  { id: 'final', label: '"Final" on the final version', kind: 'do', check: 'strict' },
  { id: 'characters', label: 'Letters, digits and spaces only', kind: 'dont', check: 'strict' }
].map((rule) => Object.freeze(rule)));

const MESSAGES = {
  date: 'add the date as YYYYMMDD, for example 20261020.',
  length: `keep it to ${NAME_MAX} characters or fewer.`,
  version: 'add a version, such as v1.',
  final: 'this is the final version, so include "Final".',
  characters: 'use letters, digits and spaces only.'
};

const words = (name) => String(name ?? '').trim().split(/\s+/).filter(Boolean);

function isRealDate(token) {
  if (!/^\d{8}$/.test(token)) return false;
  const iso = `${token.slice(0, 4)}-${token.slice(4, 6)}-${token.slice(6, 8)}`;
  const date = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === iso;
}

/** The name's YYYYMMDD date, or null. */
export function nameDate(name) {
  return words(name).find(isRealDate) ?? null;
}

/** The name's version number (`v2` → 2), or null. */
export function nameVersion(name) {
  const token = words(name).find((word) => /^v[1-9]\d*$/.test(word));
  return token ? Number(token.slice(1)) : null;
}

const STRICT = {
  date: (name) => nameDate(name) !== null,
  length: (name) => String(name ?? '').length <= NAME_MAX,
  version: (name) => nameVersion(name) !== null,
  final: (name, final) => !final || words(name).some((word) => word.toLowerCase() === 'final'),
  characters: (name) => /^[A-Za-z0-9 ]+$/.test(String(name ?? ''))
};

/**
 * Every rule with its result for `name`: true or false for strict rules, null for the
 * coach's. `final` says whether this is the final version (a case file always is).
 */
export function namingChecks(name, { final = true } = {}) {
  return NAMING_RULES.map((rule) => ({ ...rule, ok: rule.check === 'strict' ? STRICT[rule.id](name, final) : null }));
}

/** The first strict rule the name breaks, as advice, or null when it passes. */
export function namingProblem(name, options = {}) {
  const broken = namingChecks(name, options).find((rule) => rule.ok === false);
  return broken ? MESSAGES[broken.id] : null;
}

/** The name with its date and version replaced (added at the end when missing). */
export function reviseName(name, { version, date }) {
  let out = words(name);
  const swap = (test, value) => {
    const i = out.findIndex(test);
    if (i >= 0) out[i] = value;
    else out = [...out, value];
  };
  if (date) swap(isRealDate, date);
  if (version) swap((word) => /^v[1-9]\d*$/.test(word), `v${version}`);
  return out.join(' ').slice(0, NAME_MAX);
}
