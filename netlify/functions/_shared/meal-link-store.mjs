import { createHash } from 'node:crypto';
import { createGitHubClient, GitHubClientError } from './github-client.mjs';
import { decodeBlob } from './decode-blob.mjs';
import { validateFoodJournal } from './food-journal-schema.mjs';
import { validateJournal } from './travel-journal-schema.mjs';

const FOOD_PATH = 'data/food-journal/journal.json';
const travelPath = (tripId) => `data/travel/journals/${tripId}.json`;

// The blob sha GitHub will give this content, so callers get a usable version
// back from commitFiles, which only returns the commit sha.
export const blobSha = (content) => {
  const bytes = Buffer.from(content, 'utf8');
  return createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
};

const conflict = () =>
  Object.assign(new Error('Your journal changed on another device. Reload before saving.'), {
    code: 'conflict',
    status: 409,
  });
const encode = (journal) => `${JSON.stringify(journal, null, 2)}\n`;

// The Food Journal and one trip journal, read at one commit and written in
// one commit, so a meal moment and its visit never get out of step.
export function createMealLinkStore({
  env,
  fetchImpl,
  github,
  validateFood = validateFoodJournal,
  validateTravel = validateJournal,
} = {}) {
  const client = github ?? createGitHubClient({ env, fetchImpl });

  async function readAt(tree, path, validate, empty) {
    const blob = tree.find((b) => b.path === path && b.type === 'blob');
    if (!blob) return { journal: empty, version: null };
    const text = decodeBlob(await client.readBlob(blob.sha));
    return { journal: validate(JSON.parse(text)), version: blob.sha };
  }

  return {
    async read(tripId) {
      const { commitSha, treeSha, tree } = await client.resolveTree();
      const travel = await readAt(tree, travelPath(tripId), validateTravel, null);
      if (!travel.journal) {
        throw Object.assign(new Error('Journal not found.'), { code: 'not_found', status: 404 });
      }
      const food = await readAt(tree, FOOD_PATH, validateFood, {
        schema_version: 1,
        visits: [],
        recipes: [],
      });
      return { tripId, base: { commitSha, treeSha }, travel, food };
    },

    assertVersions(snap, { travel, food }) {
      if (travel !== snap.travel.version || (food ?? null) !== snap.food.version) throw conflict();
    },

    // travels: [{ tripId, journal, version? }], one or more trip files in the same commit.
    // A trip other than the snapshot's passes the version it was read at.
    async write(snap, { food, travels, message }) {
      validateFood(food);
      for (const t of travels) validateTravel(t.journal);
      const foodContent = encode(food);
      const trips = travels.map((t) => ({ tripId: t.tripId, content: encode(t.journal) }));
      const commit = (base) =>
        client.commitFiles({
          files: [
            { path: FOOD_PATH, content: foodContent },
            ...trips.map((t) => ({ path: travelPath(t.tripId), content: t.content })),
          ],
          message,
          parentSha: base.commitSha,
          baseTreeSha: base.treeSha,
        });
      const isConflict = (e) => e instanceof GitHubClientError && e.code === 'write_conflict';
      let out;
      try {
        out = await commit(snap.base);
      } catch (e) {
        if (!isConflict(e)) throw e;
        // Retry once when the branch moved but neither journal did.
        const read = [
          [FOOD_PATH, snap.food.version],
          ...travels.map((t) => [
            travelPath(t.tripId),
            t.version !== undefined ? t.version : t.tripId === snap.tripId ? snap.travel.version : undefined,
          ]),
        ];
        if (read.some(([, v]) => v === undefined)) throw conflict();
        const { commitSha, treeSha, tree } = await client.resolveTree();
        const shaAt = (path) => tree.find((b) => b.path === path && b.type === 'blob')?.sha ?? null;
        if (read.some(([path, v]) => shaAt(path) !== v)) throw conflict();
        try {
          out = await commit({ commitSha, treeSha });
        } catch (e2) {
          if (isConflict(e2)) throw conflict();
          throw e2;
        }
      }
      return {
        commitSha: out.commitSha,
        foodVersion: blobSha(foodContent),
        travelVersions: Object.fromEntries(trips.map((t) => [t.tripId, blobSha(t.content)])),
      };
    },
  };
}
