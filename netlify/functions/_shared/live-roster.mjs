/**
 * Who is in a live round, readable the moment they join.
 *
 * A blob listing can miss a fresh write for up to a minute, long enough to hide
 * a whole question from the teacher's screen. So each round keeps its own
 * roster blob, and the screen reads each person's answer directly by key. The
 * listing still counts as a backup, for rounds from before the roster and for a
 * roster write that failed.
 */
import { listBlobKeys } from './blobs-list.mjs';

const STRONG = { type: 'json', consistency: 'strong' };
const TRIES = 12;

/** Never in the way of a student: a failed write only means the listing covers them a little later. */
export async function addToRoster(store, key, owner) {
  try {
    for (let attempt = 0; attempt < TRIES; attempt += 1) {
      const row = await store.getWithMetadata(key, STRONG);
      const owners = row?.data?.owners ?? [];
      if (owners.includes(owner)) return;
      const written = await store.setJSON(key, { owners: [...owners, owner] }, row ? { onlyIfMatch: row.etag } : { onlyIfNew: true });
      if (written?.modified) return;
      // A classmate joined at the same moment: wait a beat and add to their version.
      await new Promise((resolve) => setTimeout(resolve, Math.random() * 60 * (attempt + 1)));
    }
    console.warn('live roster busy', key);
  } catch (error) {
    console.warn('live roster write failed', error);
  }
}

/** Everyone on the roster, plus anyone only the listing knows about. */
export async function rosterOwners(store, key, listPrefix) {
  const [roster, keys] = await Promise.all([store.get(key, STRONG), listBlobKeys(store, listPrefix)]);
  return [...new Set([...(roster?.owners ?? []), ...keys.map((k) => k.slice(listPrefix.length))])];
}
