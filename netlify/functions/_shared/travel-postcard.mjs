/**
 * Postcards on check-ins: the limits, and which check-in carries a stop's postcard.
 * Pure, so the route that saves a postcard and the public link that shows it agree.
 */
import { isAudioId, isPhotoId } from './travel-blobs.mjs';

export const POSTCARD_MAX_LINES = 4;
export const POSTCARD_MAX_LINE_CHARS = 60;
export const POSTCARD_MAX_TEXT_CHARS = 600;
export const POSTCARD_MAX_AUDIO_S = 30;

function fail(path, message) {
  const err = new Error(message);
  err.code = 'validation_error';
  err.path = path;
  return err;
}

const chars = (value) => Array.from(value).length;
const tidy = (value) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '');

/**
 * The postcard a client may save: known fields only, tidied and inside the limits.
 * `posted_at` is the server's to set and is never taken from the client.
 */
export function cleanPostcardInput(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw fail('postcard', 'A postcard is needed.');
  }
  if (!isPhotoId(raw.photo_id)) throw fail('postcard.photo_id', 'A postcard needs a photo.');
  if (raw.orientation !== 'portrait' && raw.orientation !== 'landscape') {
    throw fail('postcard.orientation', 'orientation must be portrait or landscape.');
  }
  if (!Array.isArray(raw.address)) {
    throw fail('postcard.address', 'A postcard needs one to four address lines.');
  }
  const address = raw.address.map(tidy).filter(Boolean);
  if (address.length < 1 || address.length > POSTCARD_MAX_LINES) {
    throw fail('postcard.address', 'A postcard needs one to four address lines.');
  }
  if (address.some((line) => chars(line) > POSTCARD_MAX_LINE_CHARS)) {
    throw fail('postcard.address', `Each address line can be at most ${POSTCARD_MAX_LINE_CHARS} characters.`);
  }

  const out = { photo_id: raw.photo_id, orientation: raw.orientation, address };

  const text = tidy(raw.text);
  if (chars(text) > POSTCARD_MAX_TEXT_CHARS) {
    throw fail('postcard.text', `The words can be at most ${POSTCARD_MAX_TEXT_CHARS} characters.`);
  }
  if (text) out.text = text;

  if (raw.audio_id !== undefined && raw.audio_id !== null && raw.audio_id !== '') {
    if (!isAudioId(raw.audio_id)) throw fail('postcard.audio_id', 'audio_id is invalid.');
    const seconds = Number(raw.audio_s);
    if (!Number.isInteger(seconds) || seconds < 1 || seconds > POSTCARD_MAX_AUDIO_S) {
      throw fail('postcard.audio_s', `A clip is 1 to ${POSTCARD_MAX_AUDIO_S} whole seconds.`);
    }
    out.audio_id = raw.audio_id;
    out.audio_s = seconds;
  }
  return out;
}

const forItem = (checkins, itemId) =>
  (Array.isArray(checkins) ? checkins : []).filter((c) => c && c.item_id === itemId);

const latest = (rows) =>
  rows.reduce((best, c) => (!best || String(c.at) > String(best.at) ? c : best), null);

/** The stop's newest check-in: the one a new postcard is written onto. */
export function latestCheckinForItem(checkins, itemId) {
  return latest(forItem(checkins, itemId));
}

/** The check-in whose postcard a stop shows: the newest one with a postcard, or a photo from before postcards. */
export function carryingCheckin(checkins, itemId) {
  return latest(forItem(checkins, itemId).filter((c) => c.postcard || c.photo_id));
}

/** Every photo and clip a stop's check-ins name, once each. */
export function postcardMediaOfItem(checkins, itemId) {
  const photoIds = new Set();
  const audioIds = new Set();
  for (const c of forItem(checkins, itemId)) {
    if (isPhotoId(c.postcard?.photo_id)) photoIds.add(c.postcard.photo_id);
    if (isPhotoId(c.photo_id)) photoIds.add(c.photo_id);
    if (isAudioId(c.postcard?.audio_id)) audioIds.add(c.postcard.audio_id);
  }
  return { photoIds: [...photoIds], audioIds: [...audioIds] };
}

/** What followers on the public link get for a carrying check-in. Named fields only. */
export function publicPostcard(checkin) {
  const card = checkin.postcard;
  if (!card) return { id: checkin.id, at: checkin.at, photo_id: checkin.photo_id };
  return {
    id: checkin.id,
    at: card.posted_at || checkin.at,
    photo_id: card.photo_id,
    orientation: card.orientation,
    address: Array.isArray(card.address) ? card.address : [],
    ...(card.audio_id ? { audio_id: card.audio_id, audio_s: card.audio_s } : {}),
    ...(card.text ? { text: card.text } : {})
  };
}
