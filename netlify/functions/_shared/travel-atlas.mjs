/**
 * Arches Atlas: McDonald's items logged on Travel moments. Items live in each
 * trip journal's preferences, keyed by id, so they ride the journal's save,
 * merge and offline outbox. An item counts while it and its moment are live.
 */
import { DATE_RE } from './travel-schema.mjs';
import { isDeletedRecord } from './record-liveness.mjs';

export const ATLAS_PREF_KEY = 'journal_maccas_v1';
export const ATLAS_KINDS = new Set(['exclusive', 'classic']);
export const ATLAS_VS_HOME = new Set(['better', 'same', 'worse']);
export const ATLAS_LIMITS = { name: 80, note: 140, country: 60, city: 80 };

const ITEM_ID_RE = /^maccas_[a-z0-9_]{4,64}$/i;
const MOMENT_ID_RE = /^mom_[a-z0-9_]{4,64}$/i;
const CURRENCY_RE = /^[A-Z]{3}$/;

function fail(path, message) {
  const err = new Error(message);
  err.code = 'validation_error';
  err.path = path;
  return err;
}

function isObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function optionalText(item, key, path, max) {
  const v = item[key];
  if (v === undefined || v === null) return;
  if (typeof v !== 'string' || v.length > max) throw fail(`${path}.${key}`, `${key} must be text up to ${max}`);
}

function finiteNumber(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

export function validateAtlasItem(item, path) {
  if (!isObject(item)) throw fail(path, `${path} must be an object`);
  if (typeof item.id !== 'string' || !ITEM_ID_RE.test(item.id)) throw fail(`${path}.id`, 'id must be a maccas_ id');
  if (typeof item.moment_id !== 'string' || !MOMENT_ID_RE.test(item.moment_id)) {
    throw fail(`${path}.moment_id`, 'moment_id must be a mom_ id');
  }
  if (typeof item.name !== 'string' || !item.name.trim() || item.name.length > ATLAS_LIMITS.name) {
    throw fail(`${path}.name`, 'name is required');
  }
  if (!ATLAS_KINDS.has(item.kind)) throw fail(`${path}.kind`, 'kind must be exclusive or classic');
  if (typeof item.date !== 'string' || !DATE_RE.test(item.date)) throw fail(`${path}.date`, 'date must be YYYY-MM-DD');
  optionalText(item, 'country', path, ATLAS_LIMITS.country);
  optionalText(item, 'city', path, ATLAS_LIMITS.city);
  optionalText(item, 'note', path, ATLAS_LIMITS.note);
  if (item.price !== null && item.price !== undefined) {
    if (!isObject(item.price) || !finiteNumber(item.price.amount) || item.price.amount < 0) {
      throw fail(`${path}.price`, 'price needs a positive amount');
    }
    if (typeof item.price.currency !== 'string' || !CURRENCY_RE.test(item.price.currency)) {
      throw fail(`${path}.price.currency`, 'currency must be a 3-letter code');
    }
  }
  if (item.aud !== null && item.aud !== undefined) {
    const { aud } = item;
    if (!isObject(aud) || !finiteNumber(aud.amount) || !finiteNumber(aud.rate)) {
      throw fail(`${path}.aud`, 'aud needs amount and rate');
    }
    if (typeof aud.as_of !== 'string' || !DATE_RE.test(aud.as_of)) throw fail(`${path}.aud.as_of`, 'as_of must be YYYY-MM-DD');
  }
  if (typeof item.big_mac !== 'boolean') throw fail(`${path}.big_mac`, 'big_mac must be true or false');
  if (item.rating !== null && item.rating !== undefined) {
    if (!finiteNumber(item.rating) || item.rating < 1 || item.rating > 5 || (item.rating * 2) % 1 !== 0) {
      throw fail(`${path}.rating`, 'rating is 1 to 5 in halves');
    }
  }
  if (item.vs_home !== null && item.vs_home !== undefined) {
    if (!ATLAS_VS_HOME.has(item.vs_home)) throw fail(`${path}.vs_home`, 'vs_home must be better, same or worse');
    if (item.kind !== 'classic') throw fail(`${path}.vs_home`, 'only a classic compares with home');
  }
  if (item.photo_ids !== undefined && (!Array.isArray(item.photo_ids) || item.photo_ids.some((p) => typeof p !== 'string'))) {
    throw fail(`${path}.photo_ids`, 'photo_ids must be a list of ids');
  }
  if (item.lifecycle !== undefined && item.lifecycle !== 'live' && item.lifecycle !== 'deleted') {
    throw fail(`${path}.lifecycle`, 'unknown lifecycle');
  }
  return item;
}

/** Checks the Atlas preference when a journal carries one. */
export function validateAtlasPreference(value, path = `preferences.${ATLAS_PREF_KEY}`) {
  if (value === undefined) return;
  if (!isObject(value)) throw fail(path, `${path} must be an object`);
  for (const [key, item] of Object.entries(value)) {
    validateAtlasItem(item, `${path}.${key}`);
    if (item.id !== key) throw fail(`${path}.${key}.id`, 'id must match its key');
  }
}

/** Live items of one journal: the journal, the item and its moment all live. */
export function liveAtlasItems(journal) {
  if (!journal || isDeletedRecord(journal)) return [];
  const raw = journal.preferences?.[ATLAS_PREF_KEY];
  if (!isObject(raw)) return [];
  const liveMoments = new Set(
    (journal.moments ?? []).filter((m) => !isDeletedRecord(m)).map((m) => m.id)
  );
  return Object.values(raw)
    .filter((item) => isObject(item) && !isDeletedRecord(item) && liveMoments.has(item.moment_id))
    .map((item) => ({ ...item, trip_id: journal.trip_id }));
}

export function normaliseAtlasSettings(raw) {
  const home = raw?.home_big_mac_aud;
  return { home_big_mac_aud: finiteNumber(home) && home > 0 ? Math.round(home * 100) / 100 : null };
}
