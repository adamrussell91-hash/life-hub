import { daysBetween, isCalendarDate } from '../../../apps/life/js/core/time.js';
import { GOVERNANCE_LOG_PATH } from '../../../apps/life/js/core/governance-log.js';
import { WEEK_FLAGS_PATH } from '../../../apps/life/js/core/open-loops.js';
import { isTemplatePath } from './workout-templates.mjs';

export const CONFIG_PATHS = new Set([
  'config/agents.yml',
  'config/targets.yml',
  'central-node.md',
  GOVERNANCE_LOG_PATH,
  'data/nutrition/challenges.json',
  WEEK_FLAGS_PATH
]);
const EVENT_PATH = /^data\/(?<domain>nutrition|fitness|body|mind|skincare)\/(?<year>\d{4})\/(?<month>\d{2})\/(?<date>\d{4}-\d{2}-\d{2})-(?<name>[a-z0-9]+(?:-[a-z0-9]+)*)\.md$/;
const BLOB_SHA = /^[0-9a-f]{40}$/;
const MAX_FILE_BYTES = 256 * 1024;

export function parseDateRange(url, { maxDays = 366 } = {}) {
  if (!(url instanceof URL) || !Number.isInteger(maxDays) || maxDays < 1) {
    throw new TypeError('Invalid date range.');
  }

  const parameters = [...url.searchParams.keys()];
  if (parameters.length !== 2 || new Set(parameters).size !== 2 ||
      !url.searchParams.has('from') || !url.searchParams.has('to')) {
    throw new TypeError('Invalid date range.');
  }

  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  if (!isCalendarDate(from) || !isCalendarDate(to) || from > to || daysBetween(from, to) >= maxDays) {
    throw new TypeError('Invalid date range.');
  }
  return { from, to };
}

export function isAllowedRepositoryPath(path) {
  if (typeof path !== 'string' || path.length === 0 || /[\\\u0000-\u001f\u007f]/.test(path) ||
      path.includes('//') || path.split('/').some(segment => segment === '.' || segment === '..')) {
    return false;
  }
  if (CONFIG_PATHS.has(path)) return true;
  if (isTemplatePath(path)) return true;

  const match = EVENT_PATH.exec(path);
  if (!match || !isCalendarDate(match.groups.date)) return false;
  const [dateYear, dateMonth] = match.groups.date.split('-');
  return match.groups.year === dateYear && match.groups.month === dateMonth;
}

// Workout templates are undated prescriptions, not calendar events -- they are intentionally
// excluded here and never enter the date-window client sync manifest. chat.mjs and
// chat-confirm.mjs load/write them directly via a tree scan (see workout-templates.mjs).
export function selectManifestEntries(tree, range) {
  if (!Array.isArray(tree) || !isCalendarDate(range?.from) || !isCalendarDate(range?.to) || range.from > range.to) {
    throw new TypeError('Invalid repository manifest input.');
  }

  return tree
    .filter(isAllowedBlob)
    .filter(entry => CONFIG_PATHS.has(entry.path) || isEventInRange(entry.path, range))
    .map(({ path, sha, size }) => ({ path, sha, size }))
    .sort((left, right) => left.path.localeCompare(right.path));
}

function isAllowedBlob(entry) {
  return entry && entry.type === 'blob' && isAllowedRepositoryPath(entry.path) &&
    BLOB_SHA.test(entry.sha) && Number.isInteger(entry.size) &&
    entry.size >= 0 && entry.size <= MAX_FILE_BYTES;
}

function isEventInRange(path, range) {
  const match = EVENT_PATH.exec(path);
  return match && match.groups.date >= range.from && match.groups.date <= range.to;
}

export function isClientFileInRange(path, range) {
  if (CONFIG_PATHS.has(path)) return true;
  return Boolean(isEventInRange(path, range));
}
