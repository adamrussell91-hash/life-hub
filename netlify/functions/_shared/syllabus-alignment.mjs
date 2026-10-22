/**
 * The syllabus alignment, for the teacher only.
 *
 *   syllabus_alignment/{id}   the alignment document (see apps/teaching/src/alignment/schema.ts)
 *
 * The first read copies the document from the private data repository
 * (data/teaching/syllabus/{id}.json in life-hub-data). After that the teacher's
 * link edits live here. The syllabus and booklet wording never enters public code.
 */
import { ALIGNMENT_ID, AlignmentPatchError, AlignmentPatchSchema, AlignmentSchema, applyAlignmentPatch } from './syllabus-alignment-schema.mjs';
import { PROFESSIONAL_DATA_TOKEN_ENV, professionalDataRepo } from './github-professional-data.mjs';
import { reject } from './question-drop.mjs';

export { ALIGNMENT_ID };
const alignmentKey = (id) => `syllabus_alignment/${id}`;
export const privateAlignmentPath = (id) => `data/teaching/syllabus/${id}.json`;
const FETCH_TIMEOUT_MS = 12_000;

/** Read the alignment's source file from the private data repository. */
export async function readPrivateAlignment(id, { env = process.env, fetchImpl = fetch } = {}) {
  const token = env?.[PROFESSIONAL_DATA_TOKEN_ENV];
  if (typeof token !== 'string' || !token) reject(503, 'private_data_unbound', 'The private syllabus file can’t be reached from here.');
  const url = `https://api.github.com/repos/${professionalDataRepo(env)}/contents/${privateAlignmentPath(id)}?ref=main`;
  let response;
  try {
    response = await fetchImpl(url, {
      headers: { accept: 'application/vnd.github.raw+json', authorization: `Bearer ${token}`, 'user-agent': 'life-hub' },
      signal: typeof AbortSignal?.timeout === 'function' ? AbortSignal.timeout(FETCH_TIMEOUT_MS) : undefined
    });
  } catch {
    reject(502, 'private_data_unreachable', 'The private syllabus file didn’t load. Try again in a moment.');
  }
  if (response.status === 404) reject(404, 'not_found', 'The private syllabus file isn’t there yet.');
  if (!response.ok) reject(502, 'private_data_unreachable', 'The private syllabus file didn’t load. Try again in a moment.');
  const parsed = AlignmentSchema.safeParse(await response.json().catch(() => null));
  if (!parsed.success) reject(500, 'corrupt', 'The private syllabus file couldn’t be read.');
  return parsed.data;
}

async function readStored(store, id) {
  const row = await store.getWithMetadata(alignmentKey(id), { type: 'json', consistency: 'strong' });
  if (!row?.data) return { doc: null, etag: null };
  const parsed = AlignmentSchema.safeParse(row.data);
  if (!parsed.success) reject(500, 'corrupt', 'The saved alignment couldn’t be read. Nothing was changed.');
  return { doc: parsed.data, etag: row.etag ?? null };
}

/** The alignment, copied from the private file on first use. */
export async function loadAlignment(store, id = ALIGNMENT_ID, deps = {}) {
  const { doc } = await readStored(store, id);
  if (doc) return doc;
  const fresh = { ...(await readPrivateAlignment(id, deps)), updated_at: new Date().toISOString() };
  const written = await store.setJSON(alignmentKey(id), fresh, { onlyIfNew: true });
  if (written?.modified === false) return (await readStored(store, id)).doc;
  return fresh;
}

/** Save one dot point's links. One retry if another tab wrote in between, then a 409. */
export async function patchAlignment(store, body, id = ALIGNMENT_ID) {
  const parsed = AlignmentPatchSchema.safeParse(body);
  if (!parsed.success) reject(400, 'bad_request', 'That change can’t be saved.');
  for (let i = 0; i < 2; i += 1) {
    const { doc, etag } = await readStored(store, id);
    if (!doc) reject(404, 'not_found', 'Open the alignment once before editing it.');
    let next;
    try {
      next = applyAlignmentPatch(doc, parsed.data);
    } catch (e) {
      if (e instanceof AlignmentPatchError) reject(400, 'bad_request', e.message);
      throw e;
    }
    next.updated_at = new Date().toISOString();
    const written = await store.setJSON(alignmentKey(id), next, { onlyIfMatch: etag });
    if (written?.modified !== false) return next;
  }
  reject(409, 'changed', 'The alignment changed in another tab. Reload to see it.');
}
