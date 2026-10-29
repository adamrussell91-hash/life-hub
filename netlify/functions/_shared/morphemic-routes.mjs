/**
 * Shared steps for the morphemic matrix routes (teacher and published).
 * The library answers first; only a word it has never seen starts a model job.
 */
import { lookupMatrixWord } from './morphemic-matrix.mjs';
import { deleteKey } from './teaching-blobs.mjs';
import { publicJobView, readTextToolJob, startTextToolJob, textToolJobKey, textToolKey } from './text-tools.mjs';

/** `{ key, status: 'done', result: { matrix } }` from the library, or the job view while it builds. */
export async function findOrBuildMatrix({ request, store, env, word, runPath, kick, fetchImpl, now }) {
  const known = await lookupMatrixWord(store, word);
  if (known) return { key: '', status: 'done', tool: 'morphemic', result: { matrix: known.matrix } };

  // A finished job with no library record means the teacher removed the matrix: build it again.
  const key = textToolKey('morphemic', word, env);
  const previous = await readTextToolJob(store, key);
  if (previous?.status === 'done') await deleteKey(store, textToolJobKey(key));

  const started = await startTextToolJob({ store, env, tool: 'morphemic', text: word, now });
  if (started.kick) await kick(request, runPath, started.key, fetchImpl);
  return publicJobView(started.key, started.job);
}

/** Poll view for a running morphemic job. */
export async function readMatrixJob(store, key) {
  const job = await readTextToolJob(store, key);
  if (!job || job.tool !== 'morphemic') return null;
  return publicJobView(key, job);
}
