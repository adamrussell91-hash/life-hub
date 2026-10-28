/**
 * WalkThrus pattern monitor (server). Reads each class's evidence, turns it into problem-type
 * signals (rules in apps/teaching/src/evidence/walkthru-patterns.ts), counts them into
 * suggestions and keeps what Adam dismissed quiet (suggestion-quiet.mjs). Teacher only; no model call.
 *
 *   walkthru_monitor/dirty      { at }                               set by saves (walkthru-dirty.mjs)
 *   walkthru_monitor/signals    { built_at, classes: { id: { title, signals } } }
 *   walkthru_monitor/quiet      { records: { <key>: quiet record } }
 *   walkthru_monitor/settings   { quizzes, weeks, classes, oneOffDays }
 */
import { countPatterns, DEFAULT_MONITOR, markbookEvidence, signalsFor } from './profile-evidence.mjs';
import { readFeedbackCodes } from './feedback-codes.mjs';
import { markbookAction, sydneyDay } from './markbook.mjs';
import { getJSON, setJSON, CLASS_PREFIX } from './teaching-blobs.mjs';
import { listBlobKeys } from './blobs-list.mjs';
import { isDeletedRecord } from './record-liveness.mjs';
import { reject } from './question-drop.mjs';
import { comebackNote, normalizeQuiet, quietCountRecord, quietState, quietUntilRecord, termEndFor } from './suggestion-quiet.mjs';
import { rankedFor, PROBLEM_TYPES } from '../../../packages/walkthrus/problem-types.mjs';
import { seriesByKey, techniqueById } from '../../../packages/walkthrus/catalogue.mjs';
import { DIRTY_KEY } from './walkthru-dirty.mjs';

export const SIGNALS_KEY = 'walkthru_monitor/signals';
export const QUIET_KEY = 'walkthru_monitor/quiet';
export const SETTINGS_KEY = 'walkthru_monitor/settings';

const RANGES = { quizzes: [2, 10], weeks: [1, 12], classes: [2, 10], oneOffDays: [3, 60] };

export function cleanSettings(input) {
  const out = { ...DEFAULT_MONITOR };
  for (const [key, [lo, hi]] of Object.entries(RANGES)) {
    const n = Number(input?.[key]);
    if (Number.isInteger(n) && n >= lo && n <= hi) out[key] = n;
  }
  return out;
}

export async function loadSettings(store) {
  return cleanSettings(await getJSON(store, SETTINGS_KEY, { consistency: 'strong' }));
}

export async function saveSettings(store, input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) reject(400, 'bad_request', 'Send the settings.');
  for (const [key, [lo, hi]] of Object.entries(RANGES)) {
    if (input[key] !== undefined && !(Number.isInteger(Number(input[key])) && Number(input[key]) >= lo && Number(input[key]) <= hi)) reject(400, 'invalid_field', `${key} must be a whole number from ${lo} to ${hi}.`);
  }
  const settings = cleanSettings(input);
  await setJSON(store, SETTINGS_KEY, settings);
  return settings;
}

async function liveClasses(store) {
  const keys = (await listBlobKeys(store, CLASS_PREFIX)).filter((k) => !k.slice(CLASS_PREFIX.length).includes('/'));
  const rows = await Promise.all(keys.map((k) => getJSON(store, k)));
  return rows
    .filter((c) => c?.id && c.status === 'active' && !isDeletedRecord(c))
    .map((c) => ({ id: c.id, title: c.display_name || c.title || c.code || 'Class' }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

/** Rebuild every live class's signals from its evidence. */
export async function rebuildSignals(store, now = new Date().toISOString()) {
  const codes = await readFeedbackCodes(store);
  const classes = {};
  for (const cls of await liveClasses(store)) {
    try {
      const view = await markbookAction(store, cls.id, { action: 'load', skip_done: true });
      const { evidence, sources } = markbookEvidence(view, []);
      classes[cls.id] = { title: cls.title, signals: signalsFor(evidence, sources, codes) };
    } catch {
      // One class that won't load must not hide the rest.
    }
  }
  const doc = { built_at: now, classes };
  await setJSON(store, SIGNALS_KEY, doc);
  return doc;
}

/** The signals, rebuilt only when a save has marked the evidence changed since they were built. */
export async function currentSignals(store, now = new Date().toISOString()) {
  const [doc, dirty] = await Promise.all([getJSON(store, SIGNALS_KEY, { consistency: 'strong' }), getJSON(store, DIRTY_KEY, { consistency: 'strong' })]);
  const fresh = doc?.built_at && doc.classes && (!dirty?.at || dirty.at <= doc.built_at);
  return fresh ? doc : rebuildSignals(store, now);
}

async function loadQuiet(store) {
  const doc = await getJSON(store, QUIET_KEY, { consistency: 'strong' });
  const records = {};
  for (const [key, value] of Object.entries(doc?.records ?? {})) {
    const r = normalizeQuiet(value);
    if (r) records[key] = r;
  }
  return records;
}

const muteKey = (type, classId) => `mute:${type}:${classId}`;

function describe(pattern, titles, comeback) {
  const type = PROBLEM_TYPES[pattern.type];
  const series = seriesByKey(type.series);
  const ranked = rankedFor(pattern.type).filter((id) => techniqueById(id));
  const technique = techniqueById(ranked[0]);
  const classNames = pattern.class_ids.map((id) => titles[id] ?? 'a class');
  const evidenceText = pattern.kind === 'one_off'
    ? `${pattern.sources[0].title} (${pattern.sources[0].date})`
    : pattern.scope === 'classes'
      ? `${pattern.count} pieces of evidence across ${classNames.join(' and ')}`
      : `${pattern.count} quizzes in ${classNames[0]} since ${pattern.sources[0].date}`;
  return {
    key: pattern.key,
    kind: pattern.kind,
    problem_type: pattern.type,
    problem_label: type.label,
    series: series ? { key: series.key, code: series.code, name: series.name } : null,
    technique_id: technique?.id ?? null,
    alternatives: ranked.slice(1),
    class_ids: pattern.class_ids,
    class_titles: classNames,
    count: pattern.count,
    scope: pattern.scope,
    // evidence → problem type → series → technique, shown on hover
    chain: [
      { step: 'evidence', text: evidenceText },
      { step: 'problem', text: type.label },
      { step: 'series', text: series ? `${series.name} (${series.code})` : '' },
      { step: 'technique', text: technique?.name ?? '' }
    ],
    // One-offs suggest a teacher note on the class's next lesson; repeated patterns suggest a goal.
    action: pattern.kind === 'one_off' ? 'note' : 'goal',
    note: comebackNote(comeback, pattern.kind === 'one_off' ? 'pieces of evidence' : 'quizzes')
  };
}

/** Patterns as of `now`, with whatever Adam has dismissed left out. */
async function patternsNow(store, now) {
  const [signals, settings, quiet] = await Promise.all([currentSignals(store, now), loadSettings(store), loadQuiet(store)]);
  const today = sydneyDay(now);
  const byClass = Object.fromEntries(Object.entries(signals.classes).map(([id, c]) => [id, c.signals]));
  const titles = Object.fromEntries(Object.entries(signals.classes).map(([id, c]) => [id, c.title]));
  return { patterns: countPatterns(byClass, today, settings), titles, quiet, today, settings };
}

export async function loadSuggestions(store, now = new Date().toISOString()) {
  const { patterns, titles, quiet, today, settings } = await patternsNow(store, now);
  const suggestions = [];
  for (const pattern of patterns) {
    if (pattern.class_ids.every((id) => quietState(quiet[muteKey(pattern.type, id)], 0, today).quiet)) continue;
    const state = quietState(quiet[pattern.key], pattern.count, today);
    if (state.quiet) continue;
    suggestions.push(describe(pattern, titles, state.comeback));
  }
  return { suggestions, settings };
}

/**
 * Not now / accepted: quiet until the evidence doubles (with enough new). Not this: that problem
 * type is muted for the pattern's classes until the end of term.
 */
export async function dismiss(store, body, now = new Date().toISOString()) {
  if (!['not_now', 'not_this', 'accepted'].includes(body?.kind) || typeof body?.key !== 'string' || !body.key) reject(400, 'invalid_field', 'Say which suggestion and how to dismiss it.');
  const { patterns, today } = await patternsNow(store, now);
  const pattern = patterns.find((p) => p.key === body.key);
  if (!pattern) reject(404, 'not_found', 'That suggestion is gone.');
  const doc = await getJSON(store, QUIET_KEY, { consistency: 'strong' });
  const records = { ...(doc?.records ?? {}) };
  if (body.kind === 'not_this') {
    const until = termEndFor(today);
    for (const id of pattern.class_ids) records[muteKey(pattern.type, id)] = quietUntilRecord(until, now);
  } else {
    records[pattern.key] = quietCountRecord(body.kind, pattern.count, now);
  }
  await setJSON(store, QUIET_KEY, { records });
  return { ok: true };
}
