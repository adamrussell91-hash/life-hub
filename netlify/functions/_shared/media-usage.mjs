import { isDeletedRecord } from './record-liveness.mjs';

const URL_PATTERN = /https?:\/\/[^\s"'<>)]+|\/api\/media\/[^\s"'<>)/]+\/file/g;
const FILE_ROUTE = /\/api\/media\/([^\s"'<>)/?#]+)\/file/;
const MAX_DEPTH = 40;

function decodeEntities(value) {
  return value.replace(/&amp;/g, '&');
}

/**
 * Where each library resource is used. Blocks store a resource's link rather than its id
 * (picker inserts the URL), so a hit is either a `media_id` field or any string that is,
 * or contains, one of the resource's URLs.
 *
 * Returns { [mediaId]: { lesson_ids, unit_ids, class_ids } } for used resources only.
 */
export function buildMediaUsage({ media = [], lessons = [], units = [], classes = [] }) {
  const knownIds = new Set();
  const idByUrl = new Map();
  for (const item of media) {
    if (!item?.id) continue;
    knownIds.add(item.id);
    for (const key of ['preview_url', 'download_url', 'thumbnail_url']) {
      const url = typeof item[key] === 'string' ? item[key].trim() : '';
      if (url && !idByUrl.has(url)) idByUrl.set(url, item.id);
    }
  }

  const usage = {};
  const record = (mediaId, field, ownerId) => {
    if (!knownIds.has(mediaId)) return;
    const row = usage[mediaId] ??= { lesson_ids: [], unit_ids: [], class_ids: [] };
    if (!row[field].includes(ownerId)) row[field].push(ownerId);
  };

  const matchString = (value, hit) => {
    const trimmed = value.trim();
    const exact = idByUrl.get(trimmed);
    if (exact) hit(exact);
    if (!trimmed.includes('http') && !trimmed.includes('/api/media/')) return;
    for (const raw of trimmed.match(URL_PATTERN) ?? []) {
      const url = decodeEntities(raw);
      const byUrl = idByUrl.get(url);
      if (byUrl) hit(byUrl);
      const fileRoute = url.match(FILE_ROUTE);
      if (fileRoute) hit(fileRoute[1]);
    }
  };

  const scan = (value, hit, depth = 0) => {
    if (depth > MAX_DEPTH || value == null) return;
    if (typeof value === 'string') {
      matchString(value, hit);
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) scan(item, hit, depth + 1);
      return;
    }
    if (typeof value !== 'object') return;
    if (typeof value.media_id === 'string' && value.media_id) hit(value.media_id);
    for (const [key, child] of Object.entries(value)) {
      if (key === 'id' || key === 'lesson_ids' || key === 'active_unit_ids') continue;
      scan(child, hit, depth + 1);
    }
  };

  const owners = [
    [lessons, 'lesson_ids'],
    [units, 'unit_ids'],
    [classes, 'class_ids']
  ];
  for (const [rows, field] of owners) {
    for (const row of rows) {
      if (!row?.id || isDeletedRecord(row)) continue;
      scan(row, mediaId => record(mediaId, field, row.id));
    }
  }
  return usage;
}
