import { readFile } from 'node:fs/promises';
import { dump } from 'js-yaml';
import { buildCanonicalPath, buildRecordSlug } from '../netlify/functions/_shared/chat-schema.mjs';
import { renderMarkdown } from '../netlify/functions/_shared/persist-log.mjs';
import { validateRecord } from '../apps/life/js/core/validate.js';
import { capacityForDates } from '../apps/life/js/app/capacity-model.js';
import { ALMANAC_ANCHORS_PATH, ALMANAC_DONE_PATH } from '../netlify/functions/almanac.mjs';

export const ALMANAC_VISUAL_NOW = '2026-09-24T18:05:00+10:00';
export const ALMANAC_VISUAL_TODAY = '2026-09-24';

const ALMANAC_FIXTURE = new URL('../docs/proposals/calendar-reference/almanac/fixture.json', import.meta.url);
const TIDELINE_FIXTURE = new URL('../docs/proposals/calendar-reference/fixture.json', import.meta.url);

function blockSlug(record) {
  const stem = String(record.title || record.kind || 'block')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  const time = String(record.time || '00:00').replace(/[^0-9]/g, '').slice(0, 4) || '0000';
  return `${stem || 'block'}-${time}`;
}

function stamp(record, index) {
  return {
    ...record,
    schema_version: 1,
    id: `almanac-seed-${record.type}-${record.date}-${index}`,
    time: typeof record.time === 'string' ? record.time : '00:00',
    created_at: ALMANAC_VISUAL_NOW,
    updated_at: ALMANAC_VISUAL_NOW,
    source: 'almanac-visual-seed'
  };
}

/**
 * Load the Almanac fixture into the mock repo and freeze today at 2026-09-24.
 * Sleep and diary rows are the Tideline logs whose capacity is LAST_LOG (34%).
 * The 26/09 evening block is the taken evening the reference assumes.
 */
export async function loadAlmanacVisualSeed() {
  const fixture = JSON.parse(await readFile(ALMANAC_FIXTURE, 'utf8'));
  const tideline = JSON.parse(await readFile(TIDELINE_FIXTURE, 'utf8'));
  const files = new Map();
  files.set(ALMANAC_ANCHORS_PATH, dump(fixture.ANCHORS, { lineWidth: 120, noRefs: true }));
  files.set(ALMANAC_DONE_PATH, '[]\n');

  const logs = (Array.isArray(tideline.LOGS) ? tideline.LOGS : [])
    .filter(log => log?.record && (log.record.type === 'sleep' || log.record.type === 'diary'));
  const events = [];
  logs.forEach((log, index) => {
    const record = stamp(log.record, index);
    const errors = validateRecord(record);
    if (errors.length) throw new TypeError(`almanac seed log ${index}: ${errors.join('; ')}`);
    const path = buildCanonicalPath({ type: record.type, date: record.date, slug: buildRecordSlug(record) });
    files.set(path, renderMarkdown(record, typeof log.body === 'string' ? log.body : ''));
    events.push({ record, body: typeof log.body === 'string' ? log.body : '' });
  });
  const dates = [...new Set(events.map(event => event.record.date))].sort();
  const last = capacityForDates(events, dates).get(fixture.LAST_LOG.date);
  if (!last || last.pct !== fixture.LAST_LOG.pct) {
    throw new TypeError(`almanac seed capacity ${last?.pct} !== LAST_LOG ${fixture.LAST_LOG.pct}`);
  }

  const evening = stamp({
    type: 'calendar_block',
    date: '2026-09-26',
    time: '18:00',
    end_time: '22:00',
    kind: 'corey',
    status: 'tentative',
    protected: true,
    title: 'Dinner out + a show',
    source_agent: 'hammond'
  }, 'evening');
  const blockErrors = validateRecord(evening);
  if (blockErrors.length) throw new TypeError(blockErrors.join('; '));
  files.set(
    buildCanonicalPath({ type: evening.type, date: evening.date, slug: blockSlug(evening) }),
    renderMarkdown(evening, '')
  );

  return {
    now: ALMANAC_VISUAL_NOW,
    today: ALMANAC_VISUAL_TODAY,
    files,
    terms: fixture.TERMS,
    from: fixture.RANGE.from,
    to: fixture.RANGE.to
  };
}
