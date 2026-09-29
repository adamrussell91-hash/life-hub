// Clare / Hammond: narrow Confirm patch for Tasks meta/hub_prefs.
// Constraints / About Me stay on existing propose_central_node_patch (CN).
// Sleep wall / lights-out: prefer propose_calendar_ghost kind bedtime — not prefs.

export const HUB_PREFS_PATH = 'tasks:meta:hub_prefs';
export const HUB_PREFS_KEY = 'meta/hub_prefs';
const DEFAULT_TZ = 'Australia/Sydney';
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
const NSW_2026_TERMS = [
  { term: 1, starts_on: '2026-02-02', ends_on: '2026-04-02' },
  { term: 2, starts_on: '2026-04-22', ends_on: '2026-07-03' },
  { term: 3, starts_on: '2026-07-21', ends_on: '2026-09-25' },
  { term: 4, starts_on: '2026-10-13', ends_on: '2026-12-17' }
];

function clean(value, max = 200) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

function parseTerm(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const term = raw.term;
  if (term !== 1 && term !== 2 && term !== 3 && term !== 4) return null;
  const starts = typeof raw.starts_on === 'string' ? raw.starts_on : '';
  const ends = typeof raw.ends_on === 'string' ? raw.ends_on : '';
  if (!DATE_KEY.test(starts) || !DATE_KEY.test(ends) || ends < starts) return null;
  return { term, starts_on: starts, ends_on: ends };
}

function parseSchoolTerms(raw) {
  if (!Array.isArray(raw)) return [{ year: 2026, terms: NSW_2026_TERMS.map(term => ({ ...term })) }];
  const years = [];
  const seenYears = new Set();
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const year = row.year;
    if (typeof year !== 'number' || !Number.isInteger(year) || year < 2000 || year > 2100) continue;
    if (seenYears.has(year)) continue;
    seenYears.add(year);
    const terms = [];
    const seenTerms = new Set();
    if (Array.isArray(row.terms)) {
      for (const item of row.terms) {
        const term = parseTerm(item);
        if (!term || seenTerms.has(term.term)) continue;
        seenTerms.add(term.term);
        terms.push(term);
      }
    }
    terms.sort((a, b) => a.term - b.term);
    years.push({ year, terms });
  }
  return years;
}

function parseMarkingMinutes(raw) {
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0 || raw > 24 * 60) return 10;
  return Math.round(raw);
}

export function parseHubPrefsRecord(raw) {
  const body = raw && typeof raw === 'object' ? raw : {};
  const dismissed = Array.isArray(body.dismissed_insight_ids)
    ? body.dismissed_insight_ids
      .map(row => {
        if (!row || typeof row !== 'object') return null;
        const id = String(row.id ?? '').trim();
        const fingerprint = String(row.fingerprint ?? '').trim();
        return id && fingerprint ? { id, fingerprint } : null;
      })
      .filter(Boolean)
    : [];
  return {
    schema_version: 1,
    timezone: typeof body.timezone === 'string' && body.timezone.trim() ? body.timezone : DEFAULT_TZ,
    updated_at: typeof body.updated_at === 'string' ? body.updated_at : null,
    dismissed_insight_ids: dismissed,
    school_terms: parseSchoolTerms(body.school_terms),
    marking_default_minutes_per_script: parseMarkingMinutes(body.marking_default_minutes_per_script)
  };
}

export function proposeHubPrefsSchema() {
  return {
    name: 'propose_hub_prefs',
    description:
      'Propose a narrow patch to hub preferences (timezone, school_terms, marking_default_minutes_per_script). Nothing is saved until Adam taps Confirm. For Constraints or About Me lines use propose_central_node_patch. For bedtime / lights-out use propose_calendar_ghost kind bedtime — do not put sleep walls in hub prefs.',
    input_schema: {
      type: 'object',
      properties: {
        summary: { type: 'string' },
        timezone: { type: 'string' },
        school_terms: { type: 'array' },
        marking_default_minutes_per_script: { type: 'number' }
      },
      required: ['summary'],
      additionalProperties: false
    }
  };
}

export function buildHubPrefsProposal(input) {
  if (!input || typeof input !== 'object') return { ok: false, error: 'invalid_input' };
  const summary = clean(input.summary, 160);
  if (!summary) return { ok: false, error: 'summary_required' };

  const patch = {};
  const bits = [];
  if (typeof input.timezone === 'string' && input.timezone.trim()) {
    patch.timezone = input.timezone.trim();
    bits.push(`timezone → ${patch.timezone}`);
  }
  if (input.school_terms !== undefined) {
    if (!Array.isArray(input.school_terms)) return { ok: false, error: 'invalid_school_terms' };
    patch.school_terms = parseSchoolTerms(input.school_terms);
    bits.push('school_terms updated');
  }
  if (input.marking_default_minutes_per_script !== undefined) {
    if (typeof input.marking_default_minutes_per_script !== 'number'
      || !Number.isFinite(input.marking_default_minutes_per_script)
      || input.marking_default_minutes_per_script <= 0
      || input.marking_default_minutes_per_script > 24 * 60) {
      return { ok: false, error: 'invalid_marking_minutes' };
    }
    patch.marking_default_minutes_per_script = Math.round(input.marking_default_minutes_per_script);
    bits.push(`marking minutes → ${patch.marking_default_minutes_per_script}`);
  }
  if (!bits.length) {
    return {
      ok: false,
      error: 'no_prefs_fields',
      detail: 'Pass timezone, school_terms, and/or marking_default_minutes_per_script. Constraints use CN patch; bedtime uses calendar ghost.'
    };
  }

  return {
    ok: true,
    proposal: {
      intent: summary,
      reads: [HUB_PREFS_PATH],
      writes: [{
        path: HUB_PREFS_PATH,
        mode: 'append',
        content: JSON.stringify(patch),
        diff: `Hub prefs: ${bits.join('; ')}`
      }],
      surfaces: ['confirm_card', 'governance_log']
    },
    notes: {
      constraints: 'Use propose_central_node_patch for Constraints / About Me (section constraints or about_me).',
      bedtime: 'Use propose_calendar_ghost kind bedtime with date, time, reason — not hub prefs.'
    }
  };
}

/** Merge a Confirm patch into the stored hub_prefs record. */
export function mergeHubPrefsPatch(existing, patch, { nowIso = () => new Date().toISOString() } = {}) {
  const current = parseHubPrefsRecord(existing);
  const incoming = patch && typeof patch === 'object' ? patch : {};
  return parseHubPrefsRecord({
    ...current,
    ...incoming,
    updated_at: nowIso()
  });
}
