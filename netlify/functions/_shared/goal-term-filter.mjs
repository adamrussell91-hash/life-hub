// netlify/functions/_shared/goal-term-filter.mjs
import { normalizeTerm } from './goal-record.mjs';

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
const TERM_QUERY = /^(\d{4})-([1-4])$/;

/** Like termsFromHubPrefs but keeps year for goal term matching. */
export function termRefsFromHubPrefs(prefs) {
  const rows = Array.isArray(prefs?.school_terms) ? prefs.school_terms : [];
  const out = [];
  for (const row of rows) {
    if (Array.isArray(row?.terms)) {
      const year = Number.isInteger(row.year) ? row.year : null;
      for (const t of row.terms) {
        if (!t || !DATE_KEY.test(t.starts_on ?? '') || !DATE_KEY.test(t.ends_on ?? '') || t.starts_on > t.ends_on) continue;
        out.push({
          year: year ?? Number(t.starts_on.slice(0, 4)),
          term: Number.isInteger(t.term) ? t.term : null,
          starts_on: t.starts_on,
          ends_on: t.ends_on
        });
      }
    } else if (row && DATE_KEY.test(row.starts_on ?? '') && DATE_KEY.test(row.ends_on ?? '') && row.starts_on <= row.ends_on) {
      out.push({
        year: Number.isInteger(row.year) ? row.year : Number(row.starts_on.slice(0, 4)),
        term: Number.isInteger(row.term) ? row.term : null,
        starts_on: row.starts_on,
        ends_on: row.ends_on
      });
    }
  }
  return out
    .filter(t => t.term >= 1 && t.term <= 4)
    .sort((a, b) => a.starts_on.localeCompare(b.starts_on));
}

export function parseTermQuery(value) {
  if (typeof value !== 'string') return null;
  const match = TERM_QUERY.exec(value.trim());
  if (!match) return null;
  return { year: Number(match[1]), term: Number(match[2]) };
}

export function currentTermRef(refs, today) {
  if (!Array.isArray(refs) || !refs.length || typeof today !== 'string') return null;
  const current = refs.find(t => today >= t.starts_on && today <= t.ends_on);
  if (current) return { year: current.year, term: current.term };
  const next = refs.find(t => t.starts_on > today);
  const last = refs[refs.length - 1];
  const pick = next ?? last;
  return pick ? { year: pick.year, term: pick.term } : null;
}

export function goalMatchesTermFilter(goal, selected, { includeOngoing = false } = {}) {
  const goalTerm = normalizeTerm(goal?.term);
  if (!goalTerm) return includeOngoing;
  if (!selected) return includeOngoing;
  return goalTerm.year === selected.year && goalTerm.term === selected.term;
}
