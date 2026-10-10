import { DATE_RE, TIME_RE } from './travel-schema.mjs';
import { isJournalMediaKey } from './travel-journal-r2.mjs';

const LOCATION_SOURCES = new Set(['exif', 'inferred', 'manual']);
const LIFECYCLES = new Set(['live', 'deleted', 'archived']);
const TRANSITION_MODES = new Set(['flight', 'train', 'car', 'ferry', 'other']);
const TRIP_ID_RE = /^trp_[a-z0-9_]{4,64}$/i;
const PREFIX_RE = {
  jrn: /^jrn_[a-z2-7]{4,64}$/,
  leg: /^leg_[a-z0-9_]{4,64}$/i,
  mom: /^mom_[a-z0-9_]{4,64}$/i,
  med: /^med_[a-z0-9_]{4,64}$/i,
  trn: /^trn_[a-z0-9_]{4,64}$/i,
  op: /^op_[a-z0-9_]{4,64}$/i,
  day: /^day_[a-z0-9_]{4,64}$/i
};

function fail(path, message) {
  const err = new Error(message);
  err.code = 'validation_error';
  err.path = path;
  return err;
}

function isObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function requireString(obj, key, path, { min = 1 } = {}) {
  const v = obj[key];
  if (typeof v !== 'string' || v.trim().length < min) throw fail(path, `${path} must be a string`);
  return v;
}

function requireId(id, prefix, path) {
  const re = PREFIX_RE[prefix];
  if (typeof id !== 'string' || !re.test(id)) throw fail(path, `${path} must be a valid ${prefix}_ id`);
  return id;
}

function requireLifecycle(value, path) {
  if (!LIFECYCLES.has(value)) throw fail(path, 'unknown lifecycle');
  return value;
}

function makePrefixedId(prefix) {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz234567';
  let out = '';
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return `${prefix}_${out}`;
}

export function makeJournalId() {
  return makePrefixedId('jrn');
}

export function makeLegId() {
  return makePrefixedId('leg');
}

export function makeMomentId() {
  return makePrefixedId('mom');
}

export function makeMediaId() {
  return makePrefixedId('med');
}

export function makeTransitionId() {
  return makePrefixedId('trn');
}

export function makeOperationId() {
  return makePrefixedId('op');
}

export function emptyJournal(tripId) {
  if (typeof tripId !== 'string' || !TRIP_ID_RE.test(tripId)) {
    throw fail('trip_id', 'trip_id must be a trp_ id');
  }
  return {
    id: makeJournalId(),
    schema_version: 1,
    trip_id: tripId,
    title: '',
    revision: 0,
    lifecycle: 'live',
    leg_ids: [],
    preferences: {},
    legs: [],
    days: [],
    moments: [],
    media: [],
    transitions: [],
    operations: []
  };
}

function validateCoordinates(coords, path) {
  if (!isObject(coords)) throw fail(path, `${path} must be an object`);
  if (typeof coords.lat !== 'number' || typeof coords.lon !== 'number') {
    throw fail(path, `${path} needs lat and lon`);
  }
}

function validatePlace(place, path) {
  if (!isObject(place)) throw fail(path, `${path} must be an object`);
  requireString(place, 'name', `${path}.name`);
}

function validateMedia(media, path, tripId) {
  if (!isObject(media)) throw fail(path, `${path} must be an object`);
  requireId(media.id, 'med', `${path}.id`);
  requireLifecycle(media.lifecycle, `${path}.lifecycle`);
  if (media.url !== undefined) {
    requireString(media, 'url', `${path}.url`, { min: 1 });
  }
  if (media.original_key !== undefined) {
    requireString(media, 'original_key', `${path}.original_key`, { min: 1 });
    if (!isJournalMediaKey(tripId, media.original_key)) {
      throw fail(`${path}.original_key`, 'original_key must stay under travel/journal for this trip');
    }
  }
  if (media.upload_state !== undefined) {
    const states = new Set(['pending', 'uploading', 'backed_up', 'failed']);
    if (!states.has(media.upload_state)) throw fail(`${path}.upload_state`, 'unknown upload_state');
  }
  if (media.checksum !== undefined) {
    requireString(media, 'checksum', `${path}.checksum`, { min: 64 });
  }
  if (media.byte_size !== undefined) {
    if (typeof media.byte_size !== 'number' || media.byte_size < 1) {
      throw fail(`${path}.byte_size`, 'byte_size must be a positive number');
    }
  }
  if (media.content_type !== undefined) {
    requireString(media, 'content_type', `${path}.content_type`, { min: 1 });
  }
  if (media.derivative_keys !== undefined) {
    if (!isObject(media.derivative_keys)) throw fail(`${path}.derivative_keys`, 'derivative_keys must be an object');
    for (const [widthKey, derivativeKey] of Object.entries(media.derivative_keys)) {
      if (typeof derivativeKey !== 'string' || derivativeKey.length === 0) {
        throw fail(`${path}.derivative_keys.${widthKey}`, 'derivative key must be a non-empty string');
      }
      if (!isJournalMediaKey(tripId, derivativeKey)) {
        throw fail(
          `${path}.derivative_keys.${widthKey}`,
          'derivative key must stay under travel/journal for this trip'
        );
      }
    }
  }
  if (media.width !== undefined && (typeof media.width !== 'number' || media.width < 1)) {
    throw fail(`${path}.width`, 'width must be a positive number');
  }
  if (media.height !== undefined && (typeof media.height !== 'number' || media.height < 1)) {
    throw fail(`${path}.height`, 'height must be a positive number');
  }
}

function validateMoment(moment, path, legIds) {
  if (!isObject(moment)) throw fail(path, `${path} must be an object`);
  requireId(moment.id, 'mom', `${path}.id`);
  requireId(moment.leg_id, 'leg', `${path}.leg_id`);
  if (!legIds.has(moment.leg_id)) throw fail(`${path}.leg_id`, 'unknown leg_id');
  requireString(moment, 'local_date', `${path}.local_date`);
  if (!DATE_RE.test(moment.local_date)) throw fail(`${path}.local_date`, 'local_date must be YYYY-MM-DD');
  if (moment.local_time != null && moment.local_time !== '' && !TIME_RE.test(moment.local_time)) {
    throw fail(`${path}.local_time`, 'local_time must be HH:MM');
  }
  if (!Array.isArray(moment.media_ids)) throw fail(`${path}.media_ids`, 'media_ids must be an array');
  for (const [i, mediaId] of moment.media_ids.entries()) {
    requireId(mediaId, 'med', `${path}.media_ids[${i}]`);
  }
  if (typeof moment.display_order !== 'number' || !Number.isFinite(moment.display_order)) {
    throw fail(`${path}.display_order`, 'display_order must be a number');
  }
  requireLifecycle(moment.lifecycle, `${path}.lifecycle`);
  if (moment.location_source !== undefined && moment.location_source !== null) {
    if (!LOCATION_SOURCES.has(moment.location_source)) {
      throw fail(`${path}.location_source`, 'unknown location_source');
    }
  }
  if (moment.place) validatePlace(moment.place, `${path}.place`);
  if (moment.coordinates) validateCoordinates(moment.coordinates, `${path}.coordinates`);
}

function validateDay(day, path, legIds) {
  if (!isObject(day)) throw fail(path, `${path} must be an object`);
  requireId(day.id, 'day', `${path}.id`);
  requireId(day.leg_id, 'leg', `${path}.leg_id`);
  if (!legIds.has(day.leg_id)) throw fail(`${path}.leg_id`, 'unknown leg_id');
  requireString(day, 'local_date', `${path}.local_date`);
  if (!DATE_RE.test(day.local_date)) throw fail(`${path}.local_date`, 'local_date must be YYYY-MM-DD');
  requireLifecycle(day.lifecycle, `${path}.lifecycle`);
}

function validateLeg(leg, path, tripId) {
  if (!isObject(leg)) throw fail(path, `${path} must be an object`);
  requireId(leg.id, 'leg', `${path}.id`);
  if (leg.trip_id !== tripId) throw fail(`${path}.trip_id`, 'leg trip_id must match journal trip_id');
  requireString(leg, 'destination', `${path}.destination`);
  requireString(leg, 'timezone', `${path}.timezone`);
  requireString(leg, 'pattern_id', `${path}.pattern_id`, { min: 1 });
  if (typeof leg.order !== 'number' || !Number.isFinite(leg.order)) {
    throw fail(`${path}.order`, 'order must be a number');
  }
  requireLifecycle(leg.lifecycle, `${path}.lifecycle`);
  if (leg.start_date && !DATE_RE.test(leg.start_date)) {
    throw fail(`${path}.start_date`, 'start_date must be YYYY-MM-DD');
  }
  if (leg.end_date && !DATE_RE.test(leg.end_date)) {
    throw fail(`${path}.end_date`, 'end_date must be YYYY-MM-DD');
  }
}

function validateTransition(trn, path, legIds) {
  if (!isObject(trn)) throw fail(path, `${path} must be an object`);
  requireId(trn.id, 'trn', `${path}.id`);
  requireId(trn.from_leg_id, 'leg', `${path}.from_leg_id`);
  requireId(trn.to_leg_id, 'leg', `${path}.to_leg_id`);
  if (!legIds.has(trn.from_leg_id) || !legIds.has(trn.to_leg_id)) {
    throw fail(path, 'transition references unknown leg');
  }
  if (!TRANSITION_MODES.has(trn.mode)) throw fail(`${path}.mode`, 'unknown transition mode');
  requireLifecycle(trn.lifecycle, `${path}.lifecycle`);
}

function validateOperation(op, path) {
  if (!isObject(op)) throw fail(path, `${path} must be an object`);
  requireId(op.id, 'op', `${path}.id`);
  if (typeof op.base_revision !== 'number' || !Number.isFinite(op.base_revision)) {
    throw fail(`${path}.base_revision`, 'base_revision must be a number');
  }
  requireString(op, 'action', `${path}.action`, { min: 1 });
}

export function validateJournal(doc) {
  if (!isObject(doc)) throw fail('journal', 'journal must be an object');
  if (doc.schema_version !== 1) throw fail('schema_version', 'schema_version must be 1');
  requireId(doc.id, 'jrn', 'id');
  if (typeof doc.trip_id !== 'string' || !TRIP_ID_RE.test(doc.trip_id)) {
    throw fail('trip_id', 'trip_id must be a trp_ id');
  }
  if (typeof doc.title !== 'string') throw fail('title', 'title must be a string');
  if (typeof doc.revision !== 'number' || !Number.isFinite(doc.revision) || doc.revision < 0) {
    throw fail('revision', 'revision must be a non-negative number');
  }
  requireLifecycle(doc.lifecycle, 'lifecycle');
  if (!Array.isArray(doc.leg_ids)) throw fail('leg_ids', 'leg_ids must be an array');
  if (!isObject(doc.preferences)) throw fail('preferences', 'preferences must be an object');
  for (const arrayKey of ['legs', 'days', 'moments', 'media', 'transitions', 'operations']) {
    if (!Array.isArray(doc[arrayKey])) throw fail(arrayKey, `${arrayKey} must be an array`);
  }

  const legIds = new Set();
  doc.legs.forEach((leg, i) => {
    validateLeg(leg, `legs[${i}]`, doc.trip_id);
    if (legIds.has(leg.id)) throw fail(`legs[${i}].id`, 'duplicate leg id');
    legIds.add(leg.id);
  });

  for (const [i, legId] of doc.leg_ids.entries()) {
    requireId(legId, 'leg', `leg_ids[${i}]`);
    if (!legIds.has(legId)) throw fail(`leg_ids[${i}]`, 'leg_ids entry missing from legs');
  }
  if (doc.leg_ids.length !== doc.legs.length) {
    throw fail('leg_ids', 'leg_ids must list every leg in order');
  }
  for (let i = 0; i < doc.leg_ids.length; i += 1) {
    if (doc.leg_ids[i] !== doc.legs[i].id) {
      throw fail('leg_ids', 'leg_ids order must match legs array');
    }
  }

  const mediaIds = new Set();
  doc.media.forEach((media, i) => {
    validateMedia(media, `media[${i}]`, doc.trip_id);
    if (mediaIds.has(media.id)) throw fail(`media[${i}].id`, 'duplicate media id');
    mediaIds.add(media.id);
  });

  doc.days.forEach((day, i) => validateDay(day, `days[${i}]`, legIds));
  doc.moments.forEach((moment, i) => validateMoment(moment, `moments[${i}]`, legIds));
  doc.transitions.forEach((trn, i) => validateTransition(trn, `transitions[${i}]`, legIds));
  doc.operations.forEach((op, i) => validateOperation(op, `operations[${i}]`));

  for (const moment of doc.moments) {
    for (const mediaId of moment.media_ids) {
      if (!mediaIds.has(mediaId)) throw fail('moments', `unknown media id ${mediaId}`);
    }
  }

  return doc;
}

export { LOCATION_SOURCES, LIFECYCLES };
