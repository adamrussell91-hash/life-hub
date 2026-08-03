import { parseEventDocument } from '../core/records.js';
import { addCalendarDays, daysBetween, isCalendarDate } from '../core/time.js';

const TARGETS_PATH = 'config/targets.yml';
const AGENTS_PATH = 'config/agents.yml';
const CENTRAL_NODE_PATH = 'central-node.md';
const EVENT_PATH = /^data\/.+\.md$/;
const INITIAL_LOOKBACK_DAYS = 30;
const EXTENSION_DAYS = 90;

export async function loadLiveEvents({ sync, loadYaml, date }) {
  if (typeof sync !== 'function' || typeof loadYaml !== 'function') {
    throw new TypeError('Live event dependencies are unavailable');
  }
  if (!isCalendarDate(date)) throw new RangeError(`Invalid calendar date: ${date}`);

  let from = addCalendarDays(date, -INITIAL_LOOKBACK_DAYS);
  let to = date;
  let commitSha = null;
  let priorBoundary = null;
  let changed = false;
  let freshness = 'confirmed';
  const filesByPath = new Map();
  const warnings = [];

  while (true) {
    const result = await sync({ from, to, validateFile: createValidator(loadYaml) });
    commitSha = result.commitSha ?? commitSha;
    changed ||= result.changed === true;
    if (result.freshness === 'fallback') freshness = 'fallback';
    warnings.push(...(result.warnings ?? []));

    for (const file of result.files ?? []) {
      filesByPath.set(file.path, file);
    }

    const batch = parseFiles(result.files ?? [], loadYaml);
    const parsed = parseFiles([...filesByPath.values()], loadYaml);
    const returnedOlderEvent = priorBoundary === null || batch.events.some(
      event => event.record.date < priorBoundary
    );
    if (!returnedOlderEvent || !streakReaches(parsed.events, from)) break;

    const nextFrom = addCalendarDays(from, -EXTENSION_DAYS);
    priorBoundary = from;
    if (daysBetween(nextFrom, to) < 366) {
      from = nextFrom;
    } else {
      to = addCalendarDays(from, -1);
      from = nextFrom;
    }
  }

  const parsed = parseFiles([...filesByPath.values()], loadYaml);
  return {
    events: parsed.events,
    targetsConfig: parsed.targetsConfig,
    agentsConfig: parsed.agentsConfig,
    centralNodeMarkdown: parsed.centralNodeMarkdown,
    warnings: [...warnings, ...parsed.warnings],
    commitSha,
    changed,
    freshness
  };
}

function createValidator(loadYaml) {
  return file => {
    try {
      if (file.path === TARGETS_PATH || file.path === AGENTS_PATH) {
        loadYaml(file.content);
      } else if (file.path === CENTRAL_NODE_PATH) {
        // Freeform markdown, no schema to violate -- any string content is acceptable.
      } else if (EVENT_PATH.test(file.path)) {
        parseEventDocument(file.content, file.path, loadYaml);
      } else {
        return { valid: false, code: 'invalid_file' };
      }
      return { valid: true };
    } catch {
      return {
        valid: false,
        code: file.path === TARGETS_PATH ? 'invalid_targets' : 'invalid_event'
      };
    }
  };
}

function parseFiles(files, loadYaml) {
  const events = [];
  const warnings = [];
  let targetsConfig = null;
  let agentsConfig = null;
  let centralNodeMarkdown = null;

  for (const file of files) {
    try {
      if (file.path === TARGETS_PATH) {
        targetsConfig = loadYaml(file.content);
      } else if (file.path === AGENTS_PATH) {
        agentsConfig = loadYaml(file.content);
      } else if (file.path === CENTRAL_NODE_PATH) {
        centralNodeMarkdown = file.content;
      } else if (EVENT_PATH.test(file.path)) {
        events.push(parseEventDocument(file.content, file.path, loadYaml));
      }
    } catch {
      warnings.push({
        path: file.path,
        code: file.path === TARGETS_PATH ? 'invalid_targets'
          : file.path === AGENTS_PATH ? 'invalid_agents'
          : 'invalid_event'
      });
    }
  }

  if (!files.some(file => file.path === TARGETS_PATH)) {
    warnings.push({ path: TARGETS_PATH, code: 'missing_targets' });
  }
  return { events, targetsConfig, agentsConfig, centralNodeMarkdown, warnings };
}

function streakReaches(events, boundary) {
  const completed = new Set(events
    .map(item => item.record)
    .filter(record => record.type === 'workout' && record.status === 'completed')
    .map(record => record.date));
  const mostRecent = [...completed].sort().at(-1);
  if (!mostRecent) return false;

  let cursor = mostRecent;
  while (completed.has(cursor) && cursor > boundary) cursor = addCalendarDays(cursor, -1);
  return completed.has(boundary) && cursor === boundary;
}
