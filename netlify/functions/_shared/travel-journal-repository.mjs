import { createGitHubClient, GitHubClientError } from './github-client.mjs';
import { decodeBlob } from './decode-blob.mjs';
import { validateJournal } from './travel-journal-schema.mjs';

const JOURNALS_PREFIX = 'data/travel/journals/';

const journalCache = new Map();
const CACHE_TTL_MS = 30_000;

function findBlob(tree, path) {
  return tree.find((item) => item.path === path && item.type === 'blob');
}

function conflictError() {
  const err = new Error('This journal changed somewhere else. Reload to see the latest.');
  err.code = 'conflict';
  err.status = 409;
  return err;
}

function encodeJournal(journal) {
  return `${JSON.stringify(journal, null, 2)}\n`;
}

function journalPath(tripId) {
  return `${JOURNALS_PREFIX}${tripId}.json`;
}

export function createTravelJournalRepository({
  env = process.env,
  fetchImpl = fetch,
  createGitHubClient: createClient = createGitHubClient,
  github = null
} = {}) {
  const client = github ?? createClient({ env, fetchImpl });

  async function readJournalBlob(blob) {
    const cached = journalCache.get(blob.sha);
    if (cached && cached.expires > Date.now()) return cached.journal;
    const raw = decodeBlob(await client.readBlob(blob.sha));
    const journal = validateJournal(JSON.parse(raw));
    journalCache.set(blob.sha, { journal, expires: Date.now() + CACHE_TTL_MS });
    return journal;
  }

  async function getJournal(tripId) {
    const path = journalPath(tripId);
    const { tree } = await client.resolveTree();
    const blob = findBlob(tree, path);
    if (!blob) {
      const err = new Error('Journal not found.');
      err.code = 'not_found';
      err.status = 404;
      throw err;
    }
    const journal = await readJournalBlob(blob);
    return { journal, version: blob.sha };
  }

  async function createJournal(journal) {
    const validated = validateJournal(journal);
    const path = journalPath(validated.trip_id);
    const result = await client.writeFile({
      path,
      content: encodeJournal(validated),
      message: `travel-journal: create for ${validated.trip_id}`
    });
    journalCache.clear();
    return { journal: validated, version: result.sha };
  }

  async function saveJournal(journal, version, message) {
    const validated = validateJournal(journal);
    const path = journalPath(validated.trip_id);
    try {
      const result = await client.writeFile({
        path,
        content: encodeJournal(validated),
        sha: version,
        message
      });
      journalCache.clear();
      return { journal: validated, version: result.sha };
    } catch (error) {
      if (
        (error instanceof GitHubClientError && error.code === 'write_conflict') ||
        error?.status === 409 ||
        error?.status === 422 ||
        /sha does not match/i.test(String(error?.message || ''))
      ) {
        throw conflictError();
      }
      throw error;
    }
  }

  return {
    getJournal,
    createJournal,
    saveJournal
  };
}

export { JOURNALS_PREFIX, conflictError };
