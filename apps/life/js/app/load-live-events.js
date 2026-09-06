import { parseEventDocument } from '../core/records.js';
import { addCalendarDays, daysBetween, isCalendarDate } from '../core/time.js';
import { GOVERNANCE_LOG_PATH } from '../core/governance-log.js';
import { WEEK_FLAGS_PATH, parseWeekFlags } from '../core/open-loops.js';
import {
  NUTRITION_CHALLENGES_PATH,
  parseNutritionChallenges
} from '../core/nutrition-challenges.js';

const TARGETS_PATH = 'config/targets.yml';
const AGENTS_PATH = 'config/agents.yml';
const CENTRAL_NODE_PATH = 'central-node.md';
const EVENT_PATH = /^data\/.+\.md$/;
const INITIAL_LOOKBACK_DAYS = 6;
const FIRST_EXTENSION_DAYS = 30;
// The manifest endpoint rejects a span of 366 days or more, so windows stay
// well under that even as they widen.
const MAX_EXTENSION_DAYS = 300;
const BACKFILL_CONCURRENCY = 4;
export const MAX_LOOKBACK_DAYS = 3652;
let laneCounter = 0;

/**
 * Recent history is fetched in small windows so the first paint lands quickly;
 * windows then double as they walk backwards, because a decade of thin, older
 * history is not worth a round trip per month.
 */
export function planBackfillWindows(date, start, lookbackCap, {
  firstStep = FIRST_EXTENSION_DAYS,
  maxStep = MAX_EXTENSION_DAYS
} = {}) {
  const windows = [];
  const deepest = addCalendarDays(date, -(lookbackCap - 1));
  let from = start;
  let step = firstStep;
  while (true) {
    const nextTo = addCalendarDays(from, -1);
    if (nextTo < deepest) break;
    // A widening step can overshoot the cap; clamp it instead of dropping the
    // window, or the last stretch of history never gets requested at all.
    let nextFrom = addCalendarDays(from, -step);
    if (nextFrom < deepest) nextFrom = deepest;
    windows.push({ from: nextFrom, to: nextTo });
    from = nextFrom;
    step = Math.min(step * 2, maxStep);
  }
  return windows;
}

export async function loadLiveEvents({
  sync,
  loadYaml,
  date,
  onPartial,
  backfill,
  maxLookbackDays = MAX_LOOKBACK_DAYS
} = {}) {
  if (typeof sync !== 'function' || typeof loadYaml !== 'function') {
    throw new TypeError('Live event dependencies are unavailable');
  }
  if (!isCalendarDate(date)) throw new RangeError(`Invalid calendar date: ${date}`);
  const lookbackCap = Number.isInteger(maxLookbackDays) && maxLookbackDays > 0
    ? maxLookbackDays
    : MAX_LOOKBACK_DAYS;

  const from = addCalendarDays(date, -INITIAL_LOOKBACK_DAYS);
  const lane = `live-${date}-${++laneCounter}`;
  let commitSha = null;
  let changed = false;
  let freshness = 'confirmed';
  const filesByPath = new Map();
  const warnings = [];
  const parsed = new Map();

  // Returns whether the window carried anything new, so windows that add
  // nothing do not trigger another parse and repaint of everything.
  const ingest = result => {
    const state = `${commitSha}\0${changed}\0${freshness}`;
    commitSha = result.commitSha ?? commitSha;
    changed ||= result.changed === true;
    if (result.freshness === 'fallback') freshness = 'fallback';
    const before = warnings.length;
    warnings.push(...(result.warnings ?? []));
    let fresh = warnings.length !== before || `${commitSha}\0${changed}\0${freshness}` !== state;
    for (const file of result.files ?? []) {
      if (filesByPath.get(file.path)?.sha !== file.sha) fresh = true;
      filesByPath.set(file.path, file);
    }
    return fresh;
  };

  const snapshot = () => {
    const parsedFiles = parseFiles([...filesByPath.values()], loadYaml, parsed);
    return {
      events: parsedFiles.events,
      targetsConfig: parsedFiles.targetsConfig,
      agentsConfig: parsedFiles.agentsConfig,
      centralNodeMarkdown: parsedFiles.centralNodeMarkdown,
      governanceLogMarkdown: parsedFiles.governanceLogMarkdown,
      weekFlags: parsedFiles.weekFlags,
      nutritionChallenges: parsedFiles.nutritionChallenges,
      researchBriefs: parsedFiles.researchBriefs,
      warnings: [...warnings, ...parsedFiles.warnings],
      commitSha,
      changed,
      freshness
    };
  };

  const validateFile = createValidator(loadYaml);
  const first = await sync({ from, to: date, lane, validateFile });
  ingest(first);
  await onPartial?.(snapshot());

  if (backfill !== false) {
    const windows = planBackfillWindows(date, from, lookbackCap);
    // Windows are fetched several at a time but ingested strictly oldest-last,
    // so the snapshot a partial render sees is the same one a serial walk
    // would have produced.
    const pending = new Map();
    const begin = index => {
      if (index >= windows.length || pending.has(index)) return;
      pending.set(index, sync({ ...windows[index], lane, validateFile })
        .then(value => ({ value }), reason => ({ reason })));
    };

    for (let index = 0; index < windows.length; index += 1) {
      const limit = Math.min(index + BACKFILL_CONCURRENCY, windows.length);
      for (let ahead = index; ahead < limit; ahead += 1) begin(ahead);
      const settled = await pending.get(index);
      pending.delete(index);
      if (settled.reason) {
        // Sign-out waits on this promise before clearing the private cache, so
        // let the windows still in flight settle first -- otherwise one of them
        // can finish a cache write after teardown.
        await Promise.allSettled(pending.values());
        throw settled.reason;
      }
      if (ingest(settled.value)) await onPartial?.(snapshot());
    }
  }

  return snapshot();
}

function createValidator(loadYaml) {
  return file => {
    try {
      if (file.path === TARGETS_PATH || file.path === AGENTS_PATH) {
        loadYaml(file.content);
      } else if (file.path === CENTRAL_NODE_PATH || file.path === GOVERNANCE_LOG_PATH) {
        // Freeform markdown, no schema to violate -- any string content is acceptable.
      } else if (file.path === NUTRITION_CHALLENGES_PATH) {
        parseNutritionChallenges(file.content);
      } else if (file.path === WEEK_FLAGS_PATH) {
        parseWeekFlags(file.content);
      } else if (file.path.startsWith('data/research/') && file.path.endsWith('.json')) {
        JSON.parse(file.content);
      } else if (EVENT_PATH.test(file.path)) {
        parseEventDocument(file.content, file.path, loadYaml);
      } else {
        return { valid: false, code: 'invalid_file' };
      }
      return { valid: true };
    } catch {
      return {
        valid: false,
        code: file.path === TARGETS_PATH ? 'invalid_targets'
          : file.path === AGENTS_PATH ? 'invalid_agents'
          : 'invalid_event'
      };
    }
  };
}

// A backfill re-snapshots after every window, so parsed documents are memoised
// by path and blob sha: without it each window re-parses the whole history and
// the load gets slower the further back it reaches.
function parseFiles(files, loadYaml, parsed = new Map()) {
  const events = [];
  const warnings = [];
  let targetsConfig = null;
  let agentsConfig = null;
  let centralNodeMarkdown = null;
  let governanceLogMarkdown = null;
  let weekFlags = null;
  let nutritionChallenges = null;
  const researchBriefs = [];

  for (const file of files) {
    const key = `${file.path}\0${file.sha}`;
    let entry = parsed.get(key);
    if (!entry) {
      entry = parseFile(file, loadYaml);
      parsed.set(key, entry);
    }
    if (entry.warning) {
      warnings.push(entry.warning);
      continue;
    }
    if (entry.kind === 'targets') targetsConfig = entry.value;
    else if (entry.kind === 'agents') agentsConfig = entry.value;
    else if (entry.kind === 'central_node') centralNodeMarkdown = entry.value;
    else if (entry.kind === 'governance_log') governanceLogMarkdown = entry.value;
    else if (entry.kind === 'week_flags') weekFlags = entry.value;
    else if (entry.kind === 'nutrition_challenges') nutritionChallenges = entry.value;
    else if (entry.kind === 'research_brief') researchBriefs.push(entry.value);
    else if (entry.kind === 'event') events.push(entry.value);
  }

  if (!files.some(file => file.path === TARGETS_PATH)) {
    warnings.push({ path: TARGETS_PATH, code: 'missing_targets' });
  }
  return {
    events,
    targetsConfig,
    agentsConfig,
    centralNodeMarkdown,
    governanceLogMarkdown,
    weekFlags,
    nutritionChallenges,
    researchBriefs,
    warnings
  };
}

function parseFile(file, loadYaml) {
  try {
    if (file.path === TARGETS_PATH) return { kind: 'targets', value: loadYaml(file.content) };
    if (file.path === AGENTS_PATH) return { kind: 'agents', value: loadYaml(file.content) };
    if (file.path === CENTRAL_NODE_PATH) return { kind: 'central_node', value: file.content };
    if (file.path === GOVERNANCE_LOG_PATH) return { kind: 'governance_log', value: file.content };
    if (file.path === WEEK_FLAGS_PATH) return { kind: 'week_flags', value: parseWeekFlags(file.content) };
    if (file.path === NUTRITION_CHALLENGES_PATH) {
      return { kind: 'nutrition_challenges', value: parseNutritionChallenges(file.content) };
    }
    if (file.path.startsWith('data/research/') && file.path.endsWith('.json')) {
      const parsed = JSON.parse(file.content);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return { kind: 'ignored' };
      }
      return { kind: 'research_brief', value: parsed };
    }
    if (EVENT_PATH.test(file.path)) {
      return { kind: 'event', value: parseEventDocument(file.content, file.path, loadYaml) };
    }
    return { kind: 'ignored' };
  } catch {
    return {
      warning: {
        path: file.path,
        code: file.path === TARGETS_PATH ? 'invalid_targets'
          : file.path === AGENTS_PATH ? 'invalid_agents'
          : file.path === NUTRITION_CHALLENGES_PATH ? 'invalid_nutrition_challenges'
          : 'invalid_event'
      }
    };
  }
}
