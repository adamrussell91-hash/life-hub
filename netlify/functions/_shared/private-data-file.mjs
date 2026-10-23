/**
 * Read one JSON file from the private data repository (life-hub-data on main),
 * with the same repo and token settings as the Professional reader. Teaching
 * content that must stay out of public code is served this way.
 */
import { PROFESSIONAL_DATA_TOKEN_ENV, professionalDataRepo } from './github-professional-data.mjs';
import { reject } from './question-drop.mjs';

const FETCH_TIMEOUT_MS = 12_000;

export async function readPrivateJsonFile(path, { env = process.env, fetchImpl = fetch, label = 'private file' } = {}) {
  const token = env?.[PROFESSIONAL_DATA_TOKEN_ENV];
  if (typeof token !== 'string' || !token) reject(503, 'private_data_unbound', `The ${label} can’t be reached from here.`);
  const url = `https://api.github.com/repos/${professionalDataRepo(env)}/contents/${path}?ref=main`;
  let response;
  try {
    response = await fetchImpl(url, {
      headers: { accept: 'application/vnd.github.raw+json', authorization: `Bearer ${token}`, 'user-agent': 'life-hub' },
      signal: typeof AbortSignal?.timeout === 'function' ? AbortSignal.timeout(FETCH_TIMEOUT_MS) : undefined
    });
  } catch {
    reject(502, 'private_data_unreachable', `The ${label} didn’t load. Try again in a moment.`);
  }
  if (response.status === 404) reject(404, 'not_found', `The ${label} isn’t there yet.`);
  if (!response.ok) reject(502, 'private_data_unreachable', `The ${label} didn’t load. Try again in a moment.`);
  return response.json().catch(() => null);
}

/** Read one file's bytes from the private data repository, for private images. */
export async function readPrivateFileBytes(path, { env = process.env, fetchImpl = fetch, label = 'private file' } = {}) {
  const token = env?.[PROFESSIONAL_DATA_TOKEN_ENV];
  if (typeof token !== 'string' || !token) reject(503, 'private_data_unbound', `The ${label} can’t be reached from here.`);
  const url = `https://api.github.com/repos/${professionalDataRepo(env)}/contents/${path}?ref=main`;
  let response;
  try {
    response = await fetchImpl(url, {
      headers: { accept: 'application/vnd.github.raw', authorization: `Bearer ${token}`, 'user-agent': 'life-hub' },
      signal: typeof AbortSignal?.timeout === 'function' ? AbortSignal.timeout(FETCH_TIMEOUT_MS) : undefined
    });
  } catch {
    reject(502, 'private_data_unreachable', `The ${label} didn’t load. Try again in a moment.`);
  }
  if (response.status === 404) reject(404, 'not_found', `The ${label} isn’t there yet.`);
  if (!response.ok) reject(502, 'private_data_unreachable', `The ${label} didn’t load. Try again in a moment.`);
  return new Uint8Array(await response.arrayBuffer());
}
