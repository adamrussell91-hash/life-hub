import { enumerateDateKeys, isCalendarDate } from './time.js';

export const NUTRITION_CHALLENGES_PATH = 'data/nutrition/challenges.json';

const DAY_RESULTS = ['clean', 'miss', 'pending'];
const MAX_CHALLENGE_DAYS = 31;

export function emptyNutritionChallenges() {
  return { challenges: [] };
}

export function parseNutritionChallenges(content) {
  if (typeof content !== 'string' || !content.trim()) return emptyNutritionChallenges();
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    return emptyNutritionChallenges();
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return emptyNutritionChallenges();
  }
  const list = Array.isArray(parsed.challenges) ? parsed.challenges : [];
  return {
    challenges: list
      .map(normalizeChallenge)
      .filter(Boolean)
  };
}

export function serializeNutritionChallenges(store) {
  const challenges = Array.isArray(store?.challenges)
    ? store.challenges.map(normalizeChallenge).filter(Boolean)
    : [];
  return `${JSON.stringify({ challenges }, null, 2)}\n`;
}

export function upsertNutritionChallengeSchema() {
  return {
    name: 'upsert_nutrition_challenge',
    description:
      'Create or update a time-bounded nutrition challenge tracker (e.g. no refined sugar for 7 days). Writes a durable scoreboard on Nutrition and syncs a compact line to Central Node This Week. Call this the moment Adam sets a weekly/challenge goal — never say you lack a counter.',
    input_schema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'Stable id when updating an existing challenge. Omit to create.'
        },
        title: {
          type: 'string',
          description: 'Short challenge name, e.g. "No refined sugar"'
        },
        rule: {
          type: 'string',
          description: 'What counts as clean vs miss, in one or two sentences'
        },
        start: {
          type: 'string',
          description: 'YYYY-MM-DD start date (inclusive)'
        },
        end: {
          type: 'string',
          description: 'YYYY-MM-DD end date (inclusive)'
        },
        status: {
          type: 'string',
          enum: ['active', 'completed', 'abandoned'],
          description: 'Defaults to active on create'
        }
      },
      required: ['title', 'start', 'end']
    }
  };
}

export function markNutritionChallengeDaySchema() {
  return {
    name: 'mark_nutrition_challenge_day',
    description:
      'Update one day on an active nutrition challenge scoreboard (clean / miss / pending). Call after a meal day is clear enough to judge, or when Adam reports a miss. Syncs Central Node This Week automatically.',
    input_schema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'Challenge id from list/upsert'
        },
        date: {
          type: 'string',
          description: 'YYYY-MM-DD day to mark'
        },
        result: {
          type: 'string',
          enum: [...DAY_RESULTS],
          description: 'clean = on track; miss = broke the rule; pending = not judged yet'
        },
        note: {
          type: 'string',
          description: 'Optional short note (e.g. "sauce had hidden sugar")'
        }
      },
      required: ['id', 'date', 'result']
    }
  };
}

export function listNutritionChallengesSchema() {
  return {
    name: 'list_nutrition_challenges',
    description: 'List active and recent nutrition challenge trackers with day scoreboards.',
    input_schema: {
      type: 'object',
      properties: {
        include_completed: {
          type: 'boolean',
          description: 'Include completed/abandoned challenges (default false)'
        }
      }
    }
  };
}

export function validateUpsertNutritionChallengeInput(input, { today } = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  if (typeof input.title !== 'string' || !input.title.trim()) return null;
  if (!isCalendarDate(input.start) || !isCalendarDate(input.end)) return null;
  if (input.start > input.end) return null;
  const span = enumerateDateKeys(input.start, input.end);
  if (span.length === 0 || span.length > MAX_CHALLENGE_DAYS) return null;

  const status = input.status && ['active', 'completed', 'abandoned'].includes(input.status)
    ? input.status
    : 'active';
  const id = typeof input.id === 'string' && input.id.trim()
    ? slugifyId(input.id.trim())
    : buildChallengeId(input.title, input.start);

  return {
    id,
    title: input.title.trim(),
    rule: typeof input.rule === 'string' && input.rule.trim()
      ? input.rule.trim()
      : input.title.trim(),
    start: input.start,
    end: input.end,
    status,
    today: isCalendarDate(today) ? today : null
  };
}

export function validateMarkNutritionChallengeDayInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  if (typeof input.id !== 'string' || !input.id.trim()) return null;
  if (!isCalendarDate(input.date)) return null;
  if (!DAY_RESULTS.includes(input.result)) return null;
  return {
    id: slugifyId(input.id.trim()),
    date: input.date,
    result: input.result,
    note: typeof input.note === 'string' && input.note.trim() ? input.note.trim() : undefined
  };
}

export function upsertNutritionChallenge(store, draft) {
  const current = parseNutritionChallenges(serializeNutritionChallenges(store));
  const existing = current.challenges.find(item => item.id === draft.id);
  const days = {};
  for (const date of enumerateDateKeys(draft.start, draft.end)) {
    const prior = existing?.days?.[date];
    days[date] = prior && DAY_RESULTS.includes(prior.result)
      ? { result: prior.result, ...(prior.note ? { note: prior.note } : {}) }
      : { result: 'pending' };
  }

  const nextChallenge = {
    id: draft.id,
    title: draft.title,
    rule: draft.rule,
    start: draft.start,
    end: draft.end,
    status: draft.status,
    days,
    created_by: existing?.created_by ?? 'brisket',
    updated_at: new Date().toISOString()
  };

  const challenges = current.challenges.filter(item => item.id !== draft.id);
  challenges.unshift(nextChallenge);
  return { challenges, challenge: nextChallenge, created: !existing };
}

export function markNutritionChallengeDay(store, mark) {
  const current = parseNutritionChallenges(serializeNutritionChallenges(store));
  const challenge = current.challenges.find(item => item.id === mark.id);
  if (!challenge) return null;
  if (!Object.prototype.hasOwnProperty.call(challenge.days, mark.date)) return null;

  const days = {
    ...challenge.days,
    [mark.date]: {
      result: mark.result,
      ...(mark.note ? { note: mark.note } : {})
    }
  };
  const nextChallenge = {
    ...challenge,
    days,
    updated_at: new Date().toISOString()
  };
  const challenges = current.challenges.map(item => (item.id === mark.id ? nextChallenge : item));
  return { challenges, challenge: nextChallenge };
}

export function formatNutritionChallengesForPrompt(store, { today, includeCompleted = false } = {}) {
  const list = Array.isArray(store?.challenges) ? store.challenges : [];
  const filtered = includeCompleted
    ? list
    : list.filter(item => item.status === 'active' || (today && item.start <= today && item.end >= today));
  if (filtered.length === 0) return '';
  return filtered.map(challenge => {
    const tally = tallyChallenge(challenge);
    const dayBits = enumerateDateKeys(challenge.start, challenge.end).map(date => {
      const cell = challenge.days?.[date];
      const mark = cell?.result === 'clean' ? '✓' : cell?.result === 'miss' ? '✗' : '·';
      return `${shortDay(date)}${mark}`;
    }).join(' ');
    return [
      `- [${challenge.id}] ${challenge.title} (${challenge.start} → ${challenge.end}, ${challenge.status})`,
      `  rule: ${challenge.rule}`,
      `  scoreboard: ${dayBits} — ${tally.clean} clean / ${tally.miss} miss / ${tally.pending} pending`
    ].join('\n');
  }).join('\n');
}

export function challengeCnMatchToken(challengeId) {
  return `Nutrition challenge (${challengeId})`;
}

export function buildChallengeCnLine(challenge) {
  const tally = tallyChallenge(challenge);
  const range = formatRangeLabel(challenge.start, challenge.end);
  return `- **${challengeCnMatchToken(challenge.id)}:** ${challenge.title} (${range}) — ${tally.clean} clean / ${tally.miss} miss / ${tally.pending} pending. Tracker on Nutrition.`;
}

export function activeChallengesForDate(store, date) {
  if (!isCalendarDate(date)) return [];
  const list = Array.isArray(store?.challenges) ? store.challenges : [];
  return list.filter(item => (
    item.status === 'active'
    && item.start <= date
    && item.end >= date
  ));
}

export function tallyChallenge(challenge) {
  const days = challenge?.days && typeof challenge.days === 'object' ? challenge.days : {};
  let clean = 0;
  let miss = 0;
  let pending = 0;
  for (const date of enumerateDateKeys(challenge.start, challenge.end)) {
    const result = days[date]?.result ?? 'pending';
    if (result === 'clean') clean += 1;
    else if (result === 'miss') miss += 1;
    else pending += 1;
  }
  return { clean, miss, pending, total: clean + miss + pending };
}

function normalizeChallenge(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  if (typeof raw.id !== 'string' || !raw.id.trim()) return null;
  if (typeof raw.title !== 'string' || !raw.title.trim()) return null;
  if (!isCalendarDate(raw.start) || !isCalendarDate(raw.end) || raw.start > raw.end) return null;
  const status = ['active', 'completed', 'abandoned'].includes(raw.status) ? raw.status : 'active';
  const days = {};
  const rawDays = raw.days && typeof raw.days === 'object' && !Array.isArray(raw.days) ? raw.days : {};
  for (const date of enumerateDateKeys(raw.start, raw.end)) {
    const cell = rawDays[date];
    const result = cell && DAY_RESULTS.includes(cell.result) ? cell.result : 'pending';
    days[date] = {
      result,
      ...(typeof cell?.note === 'string' && cell.note.trim() ? { note: cell.note.trim() } : {})
    };
  }
  return {
    id: slugifyId(raw.id.trim()),
    title: raw.title.trim(),
    rule: typeof raw.rule === 'string' && raw.rule.trim() ? raw.rule.trim() : raw.title.trim(),
    start: raw.start,
    end: raw.end,
    status,
    days,
    created_by: typeof raw.created_by === 'string' ? raw.created_by : 'brisket',
    updated_at: typeof raw.updated_at === 'string' ? raw.updated_at : undefined
  };
}

function buildChallengeId(title, start) {
  return slugifyId(`${title}-${start}`);
}

function slugifyId(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'challenge';
}

function shortDay(date) {
  return new Intl.DateTimeFormat('en-AU', { weekday: 'short', timeZone: 'Australia/Sydney' })
    .format(new Date(`${date}T12:00:00+10:00`))
    .slice(0, 2);
}

function formatRangeLabel(start, end) {
  const fmt = new Intl.DateTimeFormat('en-AU', {
    day: 'numeric',
    month: 'short',
    timeZone: 'Australia/Sydney'
  });
  return `${fmt.format(new Date(`${start}T12:00:00+10:00`))}–${fmt.format(new Date(`${end}T12:00:00+10:00`))}`;
}
