// Read-only: list Life calendar_block records in a date range so agents can
// reschedule_block / cancel_block with a real path. Server-side tree read —
// no data/calendar/** allowlist required on the agent.

import { load as loadYaml } from 'js-yaml';
import { parseEventDocument } from '../../../apps/life/js/core/records.js';
import { decodeBlob } from './decode-blob.mjs';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RANGE_DAYS = 31;
const DAY_MS = 86_400_000;

function daysInclusive(from, to) {
  const a = Date.UTC(+from.slice(0, 4), +from.slice(5, 7) - 1, +from.slice(8, 10));
  const b = Date.UTC(+to.slice(0, 4), +to.slice(5, 7) - 1, +to.slice(8, 10));
  return Math.floor((b - a) / DAY_MS) + 1;
}

export function listCalendarBlocksSchema() {
  return {
    name: 'list_calendar_blocks',
    description:
      'List Adam’s Life calendar_block records between from and to (inclusive, max 31 days). Returns path, date, time, end_time, title, kind, status. Skip cancelled. Use the path with reschedule_block or cancel_block. Read-only — nothing is written.',
    input_schema: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'YYYY-MM-DD start (inclusive)' },
        to: { type: 'string', description: 'YYYY-MM-DD end (inclusive)' }
      },
      required: ['from', 'to'],
      additionalProperties: false
    }
  };
}

/**
 * Pure listing from an already-decoded tree of { path, content } calendar files.
 */
export function listCalendarBlocksFromContents(files, { from, to } = {}) {
  if (!DATE_RE.test(from ?? '') || !DATE_RE.test(to ?? '')) {
    return { ok: false, error: 'invalid_range', detail: 'from and to must be YYYY-MM-DD' };
  }
  if (to < from) return { ok: false, error: 'invalid_range', detail: 'to must be on or after from' };
  if (daysInclusive(from, to) > MAX_RANGE_DAYS) {
    return { ok: false, error: 'range_too_large', detail: `Max range is ${MAX_RANGE_DAYS} days` };
  }

  const out = [];
  for (const file of files ?? []) {
    const path = typeof file?.path === 'string' ? file.path : '';
    if (!path.startsWith('data/calendar/')) continue;
    let record;
    try {
      ({ record } = parseEventDocument(file.content, path, loadYaml));
    } catch {
      continue;
    }
    if (!record || record.type !== 'calendar_block') continue;
    if (record.status === 'cancelled') continue;
    if (typeof record.date !== 'string' || record.date < from || record.date > to) continue;
    out.push({
      path,
      date: record.date,
      time: record.time ?? null,
      end_time: record.end_time ?? null,
      title: record.title ?? '',
      kind: record.kind ?? null,
      status: record.status ?? null
    });
  }
  out.sort((a, b) => a.date.localeCompare(b.date) || String(a.time).localeCompare(String(b.time)) || a.path.localeCompare(b.path));
  return { ok: true, blocks: out };
}

/**
 * Chat tool executor: resolveTree → read data/calendar blobs in range → list.
 */
export async function executeListCalendarBlocks(input, { client, decodeBlob: decode = decodeBlob } = {}) {
  const from = typeof input?.from === 'string' ? input.from.trim() : '';
  const to = typeof input?.to === 'string' ? input.to.trim() : '';
  if (!DATE_RE.test(from) || !DATE_RE.test(to)) {
    return { ok: false, error: 'invalid_range', detail: 'from and to must be YYYY-MM-DD' };
  }
  if (to < from) return { ok: false, error: 'invalid_range', detail: 'to must be on or after from' };
  if (daysInclusive(from, to) > MAX_RANGE_DAYS) {
    return { ok: false, error: 'range_too_large', detail: `Max range is ${MAX_RANGE_DAYS} days` };
  }
  if (!client || typeof client.resolveTree !== 'function') {
    return { ok: false, error: 'github_unavailable' };
  }

  const tree = await client.resolveTree();
  const blobs = (tree.tree ?? []).filter(entry =>
    entry?.type === 'blob'
    && typeof entry.path === 'string'
    && entry.path.startsWith('data/calendar/')
  );

  const files = [];
  for (const entry of blobs) {
    const dated = entry.path.match(/(\d{4}-\d{2}-\d{2})-/);
    if (dated && (dated[1] < from || dated[1] > to)) continue;
    try {
      const content = decode(await client.readBlob(entry.sha));
      files.push({ path: entry.path, content });
    } catch {
      // Skip unreadable blobs.
    }
  }
  return listCalendarBlocksFromContents(files, { from, to });
}
