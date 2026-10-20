/**
 * LinkedIn paste reading for the People page.
 *
 * Adam pastes the text of a LinkedIn profile; nothing is fetched or scraped.
 * One Claude call extracts it against a strict JSON schema, then organisation
 * names are matched to existing Organisations exactly (case, accents and
 * punctuation aside, display name or alias) — never fuzzily, so there are no
 * silent wrong matches. With a person, rows are compared with their links.
 *
 * The pasted text is never stored or logged.
 */

export const LINKEDIN_TEXT_CAP = 30_000;
export const LINKEDIN_MODEL = 'claude-sonnet-5-5';
export const LINKEDIN_MAX_TOKENS = 2000;
const MAX_ROWS = 40;

const nullableString = { type: ['string', 'null'] };
const date = { type: ['string', 'null'], description: 'YYYY or YYYY-MM, or null when the text gives none.' };

export const LINKEDIN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['name', 'headline', 'about', 'positions', 'education'],
  properties: {
    name: nullableString,
    headline: nullableString,
    about: { type: ['string', 'null'], description: 'At most 280 characters, in the profile’s own words.' },
    positions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'organisation', 'start', 'end', 'current', 'kind'],
        properties: {
          title: nullableString,
          organisation: { type: 'string' },
          start: date,
          end: date,
          current: { type: 'boolean' },
          kind: { type: 'string', enum: ['employee', 'member'] }
        }
      }
    },
    education: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['qualification', 'institution', 'start', 'end'],
        properties: {
          qualification: nullableString,
          institution: { type: 'string' },
          start: date,
          end: date
        }
      }
    }
  }
};

export const LINKEDIN_SYSTEM = `You read the text of a LinkedIn profile that someone copied and pasted, and extract it into the given JSON schema.

Extract only what the text states. Never invent, infer or complete anything: if a field isn't in the text, use null (or an empty list).
- positions: each job or role. kind is "member" for boards, councils, committees, associations, volunteer roles and memberships; otherwise "employee". current is true only when the text says the role continues ("Present", "now", no end date shown beside a start date in the Experience list).
- One organisation with several roles listed under it gives one position per role.
- education: each school, university or course, with the qualification as written.
- Dates are "YYYY" or "YYYY-MM" (convert "Mar 2016" to "2016-03"). Durations such as "3 yrs 2 mos" are not dates.
- about: the About section shortened to at most 280 characters, using its own words.
- Ignore page chrome: buttons, "Show all", connection counts, endorsements, recommendations, ads, "People also viewed".`;

function parseError(message) {
  return Object.assign(new Error(message), { status: 502, code: 'linkedin_parse_failed' });
}

/** The default `complete`: one Messages call; returns the parsed JSON object. */
export async function completeLinkedInParse({ env, text, fetchImpl = fetch, signal }) {
  const response = await fetchImpl('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    signal,
    headers: {
      'content-type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'server-side-fallback-2026-07-01'
    },
    body: JSON.stringify({
      model: env.LINKEDIN_PARSE_MODEL || LINKEDIN_MODEL,
      max_tokens: LINKEDIN_MAX_TOKENS,
      // Straight extraction: keep thinking light so the 2,000-token cap holds the JSON.
      output_config: { effort: 'low', format: { type: 'json_schema', schema: LINKEDIN_SCHEMA } },
      fallbacks: 'default',
      system: LINKEDIN_SYSTEM,
      messages: [{ role: 'user', content: `<profile>\n${text}\n</profile>` }]
    })
  });
  if (!response.ok) throw parseError(`Claude request failed (${response.status}).`);
  const json = await response.json();
  if (json?.stop_reason === 'refusal' || json?.stop_reason === 'max_tokens') {
    throw parseError(`Claude stopped (${json.stop_reason}).`);
  }
  const textBlock = (json?.content ?? []).find((b) => b?.type === 'text');
  try {
    return JSON.parse(textBlock?.text ?? '');
  } catch {
    throw parseError('Claude returned unreadable JSON.');
  }
}

function cleanText(value, max = 200) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().replace(/\s+/g, ' ');
  return trimmed ? trimmed.slice(0, max) : null;
}

function cleanDate(value) {
  if (typeof value !== 'string') return null;
  const m = value.trim().match(/^(\d{4})(?:-(\d{1,2}))?$/);
  if (!m) return null;
  const year = Number(m[1]);
  const month = m[2] ? Number(m[2]) : null;
  if (year < 1900 || year > 2100 || (month !== null && (month < 1 || month > 12))) return null;
  return month ? `${year}-${String(month).padStart(2, '0')}` : String(year);
}

/** Validates model output into a clean profile, or throws linkedin_parse_failed. */
export function normaliseParsedProfile(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.positions) || !Array.isArray(raw.education)) {
    throw parseError('Claude output did not match the schema.');
  }
  const positions = raw.positions
    .map((p) => ({
      title: cleanText(p?.title),
      organisation: cleanText(p?.organisation),
      start: cleanDate(p?.start),
      end: p?.current ? null : cleanDate(p?.end),
      current: p?.current === true,
      kind: p?.kind === 'member' ? 'member' : 'employee'
    }))
    .filter((p) => p.organisation)
    .slice(0, MAX_ROWS);
  const education = raw.education
    .map((e) => ({
      qualification: cleanText(e?.qualification),
      institution: cleanText(e?.institution),
      start: cleanDate(e?.start),
      end: cleanDate(e?.end)
    }))
    .filter((e) => e.institution)
    .slice(0, MAX_ROWS);
  return {
    name: cleanText(raw.name, 160),
    headline: cleanText(raw.headline, 220),
    about: cleanText(raw.about, 280),
    positions,
    education
  };
}

/** "St Mary's College, Inc." → "st marys college inc". */
export function normaliseOrgName(name) {
  return String(name ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * name → organisation, by display name and aliases. A name two organisations
 * share matches neither: better a "new organisation" pill than a wrong crest.
 */
export function buildOrganisationIndex(organisations) {
  const index = new Map();
  for (const org of organisations ?? []) {
    if (!org?.ref) continue;
    for (const name of [org.display_label, ...(org.aliases ?? [])]) {
      const key = normaliseOrgName(name);
      if (!key) continue;
      const seen = index.get(key);
      if (seen === undefined) index.set(key, { ref: org.ref, display_label: org.display_label });
      else if (seen && seen.ref !== org.ref) index.set(key, null);
    }
  }
  return index;
}

export function matchOrganisation(index, name) {
  return index.get(normaliseOrgName(name)) ?? null;
}

/** "2016" → 2016-01-01, "2016-03" → 2016-03-01, as ISO timestamps. */
export function profileDateToIso(value) {
  const clean = cleanDate(value);
  if (!clean) return null;
  const [year, month = '01'] = clean.split('-');
  return `${year}-${month}-01T00:00:00.000Z`;
}

function sameMonth(a, b) {
  const norm = (iso) => (iso && !Number.isNaN(Date.parse(iso)) ? new Date(iso).toISOString().slice(0, 7) : null);
  return norm(a) === norm(b);
}

function sameTitle(a, b) {
  return normaliseOrgName(a ?? '') === normaliseOrgName(b ?? '');
}

/**
 * Compare a parsed row with the person's existing roles: `same` when the
 * organisation and role match and so do the dates, `changed` when only the
 * dates differ (with the link to edit), `new` otherwise.
 */
export function diffRow(row, existing) {
  const education = row.section === 'education';
  const candidates = (existing ?? []).filter((e) => (e.type === 'studied_at') === education);
  const match = candidates.find((e) =>
    (row.organisation.ref ? e.orgRef === row.organisation.ref : normaliseOrgName(e.orgName) === normaliseOrgName(row.organisation.name)) &&
    sameTitle(e.title, row.title)
  );
  if (!match) return { diff: 'new', link_id: null };
  const sameDates = sameMonth(match.from, profileDateToIso(row.start)) &&
    (row.current ? !match.to : sameMonth(match.to, profileDateToIso(row.end)));
  return { diff: sameDates ? 'same' : 'changed', link_id: match.linkId };
}

/** Review-card rows: current roles, past work, education, each matched and diffed. */
export function buildReviewRows(profile, { organisations = [], existing = null } = {}) {
  const index = buildOrganisationIndex(organisations);
  const rows = [];
  const push = (base, orgName) => {
    const org = matchOrganisation(index, orgName);
    const row = {
      id: `row_${rows.length + 1}`,
      ...base,
      organisation: org
        ? { name: org.display_label, ref: org.ref, status: 'matched' }
        : { name: orgName, ref: null, status: 'new_organisation' }
    };
    Object.assign(row, existing ? diffRow(row, existing) : { diff: 'new', link_id: null });
    rows.push(row);
  };
  for (const p of profile.positions) {
    push(
      {
        section: p.current ? 'current' : 'past',
        relationship_type: p.kind === 'member' ? 'member_of' : 'employee_at',
        title: p.title,
        start: p.start,
        end: p.end,
        current: p.current
      },
      p.organisation
    );
  }
  for (const e of profile.education) {
    push(
      { section: 'education', relationship_type: 'studied_at', title: e.qualification, start: e.start, end: e.end, current: false },
      e.institution
    );
  }
  return rows;
}
