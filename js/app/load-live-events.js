import { parseEventDocument } from '../core/records.js';
import { addCalendarDays, daysBetween, isCalendarDate } from '../core/time.js';
import { GOVERNANCE_LOG_PATH } from '../core/governance-log.js';

const TARGETS_PATH = 'config/targets.yml';
const AGENTS_PATH = 'config/agents.yml';
const CENTRAL_NODE_PATH = 'central-node.md';
const EVENT_PATH = /^data\/.+\.md$/;
const INITIAL_LOOKBACK_DAYS = 30;
const EXTENSION_DAYS = 90;
const MAX_LOOKBACK_DAYS = 1826;

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
    // Start lookback whenever this window found any events (sparse history need not
    // land on the exact `from` day). Keep extending only while later batches still
    // return events older than the previous boundary.
    const returnedOlderEvent = priorBoundary === null
      ? batch.events.length > 0
      : batch.events.some(event => event.record.date < priorBoundary);
    if (
      !returnedOlderEvent
      || daysBetween(from, date) >= MAX_LOOKBACK_DAYS
    ) break;

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
    governanceLogMarkdown: parsed.governanceLogMarkdown,
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
      } else if (file.path === CENTRAL_NODE_PATH || file.path === GOVERNANCE_LOG_PATH) {
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
        code: file.path === TARGETS_PATH ? 'invalid_targets'
          : file.path === AGENTS_PATH ? 'invalid_agents'
          : 'invalid_event'
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
  let governanceLogMarkdown = null;

  for (const file of files) {
    try {
      if (file.path === TARGETS_PATH) {
        targetsConfig = loadYaml(file.content);
      } else if (file.path === AGENTS_PATH) {
        agentsConfig = loadYaml(file.content);
      } else if (file.path === CENTRAL_NODE_PATH) {
        centralNodeMarkdown = file.content;
      } else if (file.path === GOVERNANCE_LOG_PATH) {
        governanceLogMarkdown = file.content;
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
  return { events, targetsConfig, agentsConfig, centralNodeMarkdown, governanceLogMarkdown, warnings };
}
