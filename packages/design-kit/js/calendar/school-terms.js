/**
 * Flatten school_terms from hub-prefs (year-nested) or flat visual/seed rows.
 * Same shape as netlify/functions/almanac.mjs parseSchoolTerms.
 */

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function asDate(value) {
  return typeof value === 'string' && DATE.test(value) ? value : null;
}

/**
 * @param {unknown} value
 * @returns {{ term: number | null, starts_on: string, ends_on: string }[]}
 */
export function parseSchoolTerms(value) {
  if (value == null) return [];
  if (!Array.isArray(value)) return [];
  const terms = [];
  const addTerm = (row) => {
    const starts_on = asDate(row?.starts_on);
    const ends_on = asDate(row?.ends_on);
    if (!starts_on || !ends_on || starts_on > ends_on) return;
    terms.push({
      term: Number.isInteger(row.term) ? row.term : null,
      starts_on,
      ends_on
    });
  };
  value.forEach((row) => {
    if (Array.isArray(row?.terms)) row.terms.forEach((term) => addTerm(term));
    else addTerm(row);
  });
  return terms.sort((a, b) => a.starts_on.localeCompare(b.starts_on));
}

/**
 * Precedence: hub-prefs → planning-profile → calendarVisual.
 * @param {{ hubPrefs?: unknown, planningProfile?: unknown, visual?: unknown }} sources
 */
export function resolveSchoolTerms(sources = {}) {
  const fromPrefs = parseSchoolTerms(sources.hubPrefs?.school_terms);
  if (fromPrefs.length) return fromPrefs;
  const fromProfile = parseSchoolTerms(sources.planningProfile?.school_terms);
  if (fromProfile.length) return fromProfile;
  return parseSchoolTerms(sources.visual?.school_terms);
}
