/** Netlify Blobs store for Travel check-in media: place photos and postcard voice clips. */

export const TRAVEL_CONTENT_STORE = 'life-hub-travel';
export const PHOTO_ID_RE = /^tph_[a-z0-9]+$/i;
export const AUDIO_ID_RE = /^tau_[a-z0-9]+$/i;

export function photoMetaKey(id) {
  return `photos/${id}.json`;
}

export function photoBytesKey(id) {
  return `photos/${id}.bin`;
}

export function isPhotoId(id) {
  return typeof id === 'string' && PHOTO_ID_RE.test(id);
}

export function audioMetaKey(id) {
  return `audio/${id}.json`;
}

export function audioBytesKey(id) {
  return `audio/${id}.bin`;
}

export function isAudioId(id) {
  return typeof id === 'string' && AUDIO_ID_RE.test(id);
}

export async function defaultGetTravelStore(env = process.env) {
  const { getStore } = await import('@netlify/blobs');
  void env;
  return getStore(TRAVEL_CONTENT_STORE);
}

function randomSuffix() {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz234567';
  let out = '';
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out;
}

export function newPhotoId() {
  return `tph_${randomSuffix()}`;
}

export function newAudioId() {
  return `tau_${randomSuffix()}`;
}
