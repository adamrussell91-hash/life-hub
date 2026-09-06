import { load as loadYaml } from 'js-yaml';
import { formatDisplayDate, getSydneyDateKey, isCalendarDate } from '../../../apps/life/js/core/time.js';
import { GOVERNANCE_LOG_PATH, parseGovernanceEntries, tracesForRef } from '../../../apps/life/js/core/governance-log.js';
import { decodeBlob } from './decode-blob.mjs';
import { createGitHubClient } from './github-client.mjs';
import {
  compareWorkoutWindows,
  selectWorkoutEntriesInRange,
  workoutWindowBounds
} from './workout-history.mjs';
import { parseEventDocument } from '../../../apps/life/js/core/records.js';

export const LIVE_WORKOUT_TOKEN = '{{life:compare_workout_windows}}';
export const LIVE_UNAVAILABLE = '_Live workout compare unavailable._';

export function formatLiveWorkoutCompare(comparison) {
  if (!comparison?.ok) return LIVE_UNAVAILABLE;
  const { weeks, current, previous, delta } = comparison;
  const signed = delta > 0 ? `+${delta}` : String(delta);
  const currentLabel = current.count === 1 ? '1 completed workout' : `${current.count} completed workouts`;
  const previousLabel = previous.count === 1 ? '1 completed workout' : `${previous.count} completed workouts`;
  return [
    `Last ${weeks} weeks (${formatDisplayDate(current.from)} to ${formatDisplayDate(current.to)}): ${currentLabel}.`,
    `Previous ${weeks} weeks (${formatDisplayDate(previous.from)} to ${formatDisplayDate(previous.to)}): ${previousLabel}.`,
    `Delta: ${signed}.`
  ].join('\n');
}

export function expandLiveTokens(body, comparison) {
  if (typeof body !== 'string' || !body.includes(LIVE_WORKOUT_TOKEN)) return typeof body === 'string' ? body : '';
  return body.split(LIVE_WORKOUT_TOKEN).join(formatLiveWorkoutCompare(comparison));
}

export function enrichKnowledgePage(page, { compare = { ok: false }, traces = [] } = {}) {
  if (!page || typeof page !== 'object') return page;
  const next = { ...page };
  if (typeof page.body === 'string') {
    next.body = expandLiveTokens(page.body, compare);
  }
  if (Array.isArray(traces) && traces.length) {
    next.decision_traces = traces;
  }
  return next;
}

export async function defaultLoadWorkoutCompare({ env, fetchImpl, today } = {}) {
  const day = isCalendarDate(today) ? today : getSydneyDateKey(new Date());
  try {
    const client = createGitHubClient({ env, fetchImpl });
    const { tree } = await client.resolveTree();
    const bounds = workoutWindowBounds(day);
    if (!bounds) return { ok: false };
    const entries = selectWorkoutEntriesInRange(tree, {
      from: bounds.previousFrom,
      to: bounds.currentTo
    });
    const records = [];
    for (const entry of entries) {
      try {
        const content = decodeBlob(await client.readBlob(entry.sha));
        if (!content) continue;
        const parsed = parseEventDocument(content, entry.path, loadYaml);
        if (parsed?.record) records.push(parsed.record);
      } catch {
        // Skip one unreadable session rather than failing the page.
      }
    }
    return compareWorkoutWindows(records, day);
  } catch {
    return { ok: false };
  }
}

export async function defaultLoadDecisionTraces({ env, fetchImpl, page } = {}) {
  const connected = Array.isArray(page?.connected) ? page.connected : [];
  if (!connected.some(item => String(item).startsWith('life:decision:'))) return [];
  try {
    const client = createGitHubClient({ env, fetchImpl });
    const { tree } = await client.resolveTree();
    const file = tree.find(item => item.path === GOVERNANCE_LOG_PATH && item.type === 'blob');
    if (!file?.sha) return [];
    const content = decodeBlob(await client.readBlob(file.sha));
    const entries = parseGovernanceEntries(typeof content === 'string' ? content : '');
    const traces = [];
    const seen = new Set();
    for (const ref of connected) {
      for (const trace of tracesForRef(entries, ref)) {
        const key = trace.decisionId || trace.title;
        if (!key || seen.has(key)) continue;
        seen.add(key);
        traces.push(trace);
      }
    }
    return traces;
  } catch {
    return [];
  }
}

