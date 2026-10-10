import { stripDeletedFromJournal } from './travel-journal-schema.mjs';

const FORBIDDEN_MEDIA_KEYS = new Set([
  'original_key',
  'derivative_keys',
  'raw_metadata',
  'exif',
  'exif_gps',
  'gps',
  'checksum',
  'byte_size',
  'content_type',
  'upload_state'
]);

const FORBIDDEN_MOMENT_KEYS = new Set(['coordinates', 'location_source']);

const FORBIDDEN_TRANSITION_KEYS = new Set(['itinerary_item_id']);

const FORBIDDEN_ROOT_KEYS = new Set(['operations', 'preferences']);

function fail(message) {
  const err = new Error(message);
  err.code = 'validation_error';
  return err;
}

/** Resolve live moment ids from explicit selection (never share-all). */
export function collectSharedMomentIds(scope, journal) {
  const momentIds = scope?.moment_ids ?? [];
  const legIds = scope?.leg_ids ?? [];
  if (!Array.isArray(momentIds) || !Array.isArray(legIds)) {
    throw fail('moment_ids and leg_ids must be arrays');
  }
  const stripped = stripDeletedFromJournal(journal);
  const ids = new Set();
  for (const raw of momentIds) {
    if (typeof raw !== 'string' || raw.length === 0) throw fail('invalid moment id');
    ids.add(raw);
  }
  const legSet = new Set(legIds);
  for (const moment of stripped.moments) {
    if (legSet.has(moment.leg_id)) ids.add(moment.id);
  }
  return ids;
}

function sanitizeMedia(media) {
  const out = {};
  for (const [key, value] of Object.entries(media)) {
    if (FORBIDDEN_MEDIA_KEYS.has(key)) continue;
    out[key] = value;
  }
  return out;
}

function sanitizeMoment(moment) {
  const out = {};
  for (const [key, value] of Object.entries(moment)) {
    if (FORBIDDEN_MOMENT_KEYS.has(key)) continue;
    out[key] = value;
  }
  return out;
}

function sanitizeTransition(trn) {
  const out = {};
  for (const [key, value] of Object.entries(trn)) {
    if (FORBIDDEN_TRANSITION_KEYS.has(key)) continue;
    out[key] = value;
  }
  return out;
}

/**
 * Build a public journal payload for a scoped share link.
 * @param {object} journal — full journal document
 * @param {{ moment_ids?: string[], leg_ids?: string[] }} scope
 */
export function buildSharedJournalPayload(journal, scope) {
  const stripped = stripDeletedFromJournal(journal);
  const momentIdSet = collectSharedMomentIds(scope, stripped);
  if (momentIdSet.size === 0) {
    throw fail('Select at least one moment or leg to share');
  }

  const moments = stripped.moments.filter((m) => momentIdSet.has(m.id));
  const mediaIds = new Set();
  for (const moment of moments) {
    for (const mediaId of moment.media_ids) mediaIds.add(mediaId);
  }
  const legIds = new Set(moments.map((m) => m.leg_id));
  const dayKeys = new Set(moments.map((m) => `${m.leg_id}\0${m.local_date}`));

  const legs = stripped.legs.filter((leg) => legIds.has(leg.id));
  const days = stripped.days.filter((day) => dayKeys.has(`${day.leg_id}\0${day.local_date}`));
  const media = stripped.media.filter((m) => mediaIds.has(m.id)).map(sanitizeMedia);
  const transitions = stripped.transitions
    .filter((trn) => legIds.has(trn.from_leg_id) && legIds.has(trn.to_leg_id))
    .map(sanitizeTransition);

  const payload = {
    schema_version: 1,
    trip_id: stripped.trip_id,
    title: stripped.title,
    revision: stripped.revision,
    lifecycle: stripped.lifecycle,
    leg_ids: legs.map((leg) => leg.id),
    shared_moment_ids: [...momentIdSet].sort(),
    legs,
    days,
    moments: moments.map(sanitizeMoment),
    media,
    transitions,
    downloads_outside_revocation:
      'Turning the link off blocks new views. Files someone already saved stay on their device.'
  };

  for (const key of FORBIDDEN_ROOT_KEYS) {
    if (payload[key] !== undefined) delete payload[key];
  }

  return payload;
}

/** Test helper: collect dotted paths of forbidden keys in a shared payload. */
export function findForbiddenSharePayloadKeys(payload) {
  const hits = [];
  const mediaForbidden = [...FORBIDDEN_MEDIA_KEYS];
  const momentForbidden = [...FORBIDDEN_MOMENT_KEYS, 'coordinates'];
  const transitionForbidden = [...FORBIDDEN_TRANSITION_KEYS];

  function walk(obj, path, forbidden) {
    if (!obj || typeof obj !== 'object') return;
    if (Array.isArray(obj)) {
      obj.forEach((item, i) => walk(item, `${path}[${i}]`, forbidden));
      return;
    }
    for (const [key, value] of Object.entries(obj)) {
      const next = path ? `${path}.${key}` : key;
      if (forbidden.includes(key)) hits.push(next);
      walk(value, next, forbidden);
    }
  }

  walk(payload, '', [...FORBIDDEN_ROOT_KEYS, ...mediaForbidden, ...momentForbidden, ...transitionForbidden]);
  return hits;
}
