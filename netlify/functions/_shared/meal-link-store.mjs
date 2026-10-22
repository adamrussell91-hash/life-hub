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

    // travels: [{ tripId, journal }], one or more trip files in the same commit.
    async write(snap, { food, travels, message }) {
      validateFood(food);
      for (const t of travels) validateTravel(t.journal);
      const foodContent = encode(food);
      try {
        const out = await client.commitFiles({
          files: [
            { path: FOOD_PATH, content: foodContent },
            ...travels.map((t) => ({ path: travelPath(t.tripId), content: encode(t.journal) })),
          ],
          message,
          parentSha: snap.base.commitSha,
          baseTreeSha: snap.base.treeSha,
        });
        return { commitSha: out.commitSha, foodVersion: blobSha(foodContent) };
      } catch (e) {
        if (e instanceof GitHubClientError && e.code === 'write_conflict') throw conflict();
        throw e;
      }
    },
  };
}
