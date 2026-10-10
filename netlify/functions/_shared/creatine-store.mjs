import { isDeletedRecord } from './record-liveness.mjs';
import { load } from 'js-yaml';
import { decodeBlob } from './decode-blob.mjs';
import { parseEventDocument } from '../../../apps/life/js/core/records.js';
import { addCalendarDays } from '../../../apps/life/js/core/time.js';
import { buildCreatineModel, creatineStatusLine } from '../../../apps/life/js/core/creatine.js';
import { extractTodaysStatusBlock, replaceTodaysStatus, upsertStatusField } from '../../../apps/life/js/core/central-node-write.js';

export const CREATINE_INDEX_PATH = 'data/nutrition/creatine-index.json';
const PATH = /^data\/nutrition\/\d{4}\/\d{2}\/(\d{4}-\d{2}-\d{2})-.*\.md$/;
const FIELDS = ['id','type','date','time','updated_at','grams','dose_key','product','creatine_g','creatine_product','creatine_time','daily_g','maintenance_g','mode','baseline','baseline_date','deleted_at','removed_at','trashed_at','status'];

/** SHA-verified cache, never a second intake ledger. The Git tree decides which
 * records exist. A changed/removed source always invalidates its cached value.
 * The first scan is bounded to 91 days plus effective plans; subsequent scans
 * only fetch changed source blobs. Parallelism stays below API fan-out limits.
 */
export async function loadCreatineSnapshot(client, { date, now = new Date(), tree, persist = false } = {}) {
  const current = tree ?? (await client.resolveTree()).tree;
  const indexEntry = current.find(entry => entry.path === CREATINE_INDEX_PATH && entry.type === 'blob');
  let cached = {};
  if (indexEntry) {
    try {
      const parsed = JSON.parse(decodeBlob(await client.readBlob(indexEntry.sha)));
      if (parsed?.version === 1 && parsed.records && typeof parsed.records === 'object') cached = parsed.records;
    } catch { /* The cache is optional; rebuild from source on corruption. */ }
  }
  const from = addCalendarDays(date, -91);
  const entries = current.filter(entry => {
    const match = entry.type === 'blob' && PATH.exec(entry.path);
    return match && match[1] <= date && (match[1] >= from || entry.path.endsWith('-creatine-plan.md'));
  });
  if (entries.length > 1500) throw new Error('creatine_history_too_large');
  const records = {};
  let next = 0;
  await Promise.all(Array.from({length: Math.min(6, entries.length)}, async () => {
    while (next < entries.length) {
      const entry = entries[next++];
      if (cached[entry.path]?.sha === entry.sha) {
        records[entry.path] = cached[entry.path];
        continue;
      }
      const text = decodeBlob(await client.readBlob(entry.sha));
      if (text === null) throw new Error('creatine_history_unreadable');
      const parsed = parseEventDocument(text, entry.path, load);
      records[entry.path] = { sha: entry.sha, record: Object.fromEntries(FIELDS.filter(key => parsed.record[key] !== undefined).map(key => [key, parsed.record[key]])) };
    }
  }));
  const events = Object.entries(records).map(([path, value]) => ({path, record: value.record}));
  const model = buildCreatineModel({events,date,now});
  if (persist) {
    await client.writeFile({ path: CREATINE_INDEX_PATH, content: JSON.stringify({version:1, records}),
      ...(indexEntry ? {sha:indexEntry.sha} : {}), message:'chore(nutrition): refresh SHA-verified creatine history cache' });
  }
  return { model, events };
}

export function applyCreatineSummary(content, model) {
  const status = extractTodaysStatusBlock(content);
  // A stale status must not have old nutrition relabelled as today's. Only
  // preserve the other status fields when their heading is actually current.
  const body = status.dateKey === model.date ? status.body : '';
  return replaceTodaysStatus(content, {dateKey:model.date,
    body:upsertStatusField(body,'Creatine',`**Creatine:** ${creatineStatusLine(model)}`)});
}

export function creatineContext(snapshot) {
  return `\nCreatine tracker (authoritative intake-derived estimate):\n${creatineStatusLine(snapshot.model)}\n`
    + `Last seven days of reported intake: ${snapshot.model.intakeWeek.map(day => `${day.date}: ${day.grams} g`).join('; ')}.\n`
    + `Existing standalone dose keys for today: ${snapshot.events.filter(event => !isDeletedRecord(event.record) && event.record.type === 'creatine' && event.record.date === snapshot.model.date).map(event => event.record.dose_key).join(', ') || 'none'}. Reuse a key for correction/retry; select a new key for an additional dose.\n`
    + 'Dose contribution over the next day is a smoothing assumption, not a timed guarantee of muscle availability. Never calculate an oral gram-for-gram catch-up from the loading index.';
}
