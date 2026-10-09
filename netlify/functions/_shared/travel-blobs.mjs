/** Netlify Blobs store for Travel place photos on safe check-ins. */

export const TRAVEL_CONTENT_STORE = 'life-hub-travel';

export function photoMetaKey(id) {
  return `photos/${id}.json`;
}

export function photoBytesKey(id) {
  return `photos/${id}.bin`;
}

export async function defaultGetTravelStore(env = process.env) {
  const { getStore } = await import('@netlify/blobs');
  void env;
  return getStore(TRAVEL_CONTENT_STORE);
}

export function newPhotoId() {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz234567';
  let out = '';
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return `tph_${out}`;
}
