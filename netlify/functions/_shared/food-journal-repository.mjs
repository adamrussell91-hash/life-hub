import { createGitHubClient } from "./github-client.mjs";
import { decodeBlob } from "./decode-blob.mjs";
import { validateFoodJournal } from "./food-journal-schema.mjs";
const PATH = "data/food-journal/journal.json";
export function createFoodJournalRepository({ env, fetchImpl, github } = {}) {
  const client = github ?? createGitHubClient({ env, fetchImpl });
  return {
    async getJournal() {
      const { tree } = await client.resolveTree();
      const blob = tree.find((b) => b.path === PATH && b.type === "blob");
      if (!blob)
        return {
          journal: { schema_version: 1, visits: [], recipes: [] },
          version: null,
        };
      return {
        journal: validateFoodJournal(
          JSON.parse(decodeBlob(await client.readBlob(blob.sha))),
        ),
        version: blob.sha,
      };
    },
    async saveJournal(journal, version) {
      validateFoodJournal(journal);
      try {
        const saved = await client.writeFile({
          path: PATH,
          content: JSON.stringify(journal, null, 2) + "\n",
          ...(version ? { sha: version } : {}),
          message: "food-journal: save visits and recipes",
        });
        return { journal, version: saved.sha };
      } catch (e) {
        if (e.code === "write_conflict" || [409, 422].includes(e.status))
          throw Object.assign(
            new Error(
              "Your journal changed on another device. Reload before saving.",
            ),
            { code: "conflict", status: 409 },
          );
        throw e;
      }
    },
  };
}
