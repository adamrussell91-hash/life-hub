/**
 * The syllabus alignment, for the teacher only.
 *
 *   syllabus_alignment/{id}   the alignment document (see apps/teaching/src/alignment/schema.ts)
 *
 * The first read copies the document from the private data repository
 * (data/teaching/syllabus/{id}.json in life-hub-data). After that the teacher's
 * link edits live here. The syllabus and booklet wording never enters public code.
 */
import { ALIGNMENT_ID, AlignmentPatchError, AlignmentPatchSchema, AlignmentSchema, applyAlignmentPatch, mergeFromSource, needsSource } from './syllabus-alignment-schema.mjs';
import { readPrivateJsonFile } from './private-data-file.mjs';
import { reject } from './question-drop.mjs';

export { ALIGNMENT_ID };
const alignmentKey = (id) => `syllabus_alignment/${id}`;
export const privateAlignmentPath = (id) => `data/teaching/syllabus/${id}.json`;

/** Read the alignment's source file from the private data repository. */
export async function readPrivateAlignment(id, deps = {}) {
  const parsed = AlignmentSchema.safeParse(await readPrivateJsonFile(privateAlignmentPath(id), { ...deps, label: 'private syllabus file' }));
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
  const { doc, etag } = await readStored(store, id);
  if (doc && !needsSource(doc)) return doc;
  if (doc) {
    // A copy saved before thinking skills or a newer private revision: bring it up, keeping the teacher's edits.
    // If the private file can't be read just now, show the saved copy as it is.
    const source = await readPrivateAlignment(id, deps).catch(() => null);
    if (!source) return doc;
    const merged = mergeFromSource(doc, source);
    if (!merged.changed) return doc;
    const next = { ...merged.doc, updated_at: new Date().toISOString() };
    const written = await store.setJSON(alignmentKey(id), next, { onlyIfMatch: etag });
    return written?.modified === false ? (await readStored(store, id)).doc : next;
  }
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
