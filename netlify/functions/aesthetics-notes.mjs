/**
 * /api/aesthetics/notes: your own notes on each fragrance record, kept in the private data
 * repository beside the library (never in the public bundle).
 *
 *   data/aesthetics/fragrance-notes.json → { notes: { [recordId]: { text, updatedAt } } }
 *
 * GET answers every note. POST { id, text } saves one; empty text removes it.
 */
import { errorResponse, methodNotAllowed, misconfiguredResponse, okResponse, withCors } from './_shared/http.mjs';
import { createSessionOriginHandler } from './_shared/operator-gate.mjs';
import { createGitHubClient, GitHubClientError, GitHubConfigurationError } from './_shared/github-client.mjs';
import { decodeBlob } from './_shared/decode-blob.mjs';

export const config = { path: '/api/aesthetics/notes' };

export const FRAGRANCE_NOTES_PATH = 'data/aesthetics/fragrance-notes.json';
export const NOTE_MAX_LENGTH = 4000;
const NO_STORE = { 'cache-control': 'private, no-store' };
const RECORD_ID = /^[A-Za-z0-9_-]{1,80}$/;

/** Keep only well-formed notes. */
export function shapeFragranceNotes(raw) {
  const notes = raw && typeof raw === 'object' && raw.notes && typeof raw.notes === 'object' && !Array.isArray(raw.notes) ? raw.notes : {};
  const out = {};
  for (const [id, note] of Object.entries(notes)) {
    if (!RECORD_ID.test(id) || !note || typeof note.text !== 'string' || !note.text.trim()) continue;
    out[id] = { text: note.text.slice(0, NOTE_MAX_LENGTH), updatedAt: typeof note.updatedAt === 'string' ? note.updatedAt : null };
  }
  return out;
}

export function createAestheticsNotesHandler(deps = {}) {
  const createClient = deps.createGitHubClient ?? createGitHubClient;
  const now = deps.now ?? Date.now;

  async function load(github) {
    const { tree } = await github.resolveTree();
    const entry = tree.find(item => item.path === FRAGRANCE_NOTES_PATH && item.type === 'blob');
    if (!entry) return { notes: {}, sha: null };
    const text = decodeBlob(await github.readBlob(entry.sha));
    let parsed = null;
    try { parsed = text == null ? null : JSON.parse(text); } catch { parsed = null; }
    if (!parsed) throw Object.assign(new Error('notes_corrupt'), { code: 'notes_corrupt' });
    return { notes: shapeFragranceNotes(parsed), sha: entry.sha };
  }

  return createSessionOriginHandler(async (request, context) => {
    const { env } = context;
    if (request.method !== 'GET' && request.method !== 'POST') return withCors(methodNotAllowed('GET, POST, OPTIONS'), request, env);
    let github;
    try {
      github = createClient({ env, fetchImpl: deps.fetchImpl ?? fetch });
    } catch (error) {
      if (error instanceof GitHubConfigurationError || error?.code === 'misconfigured') return withCors(misconfiguredResponse(), request, env);
      throw error;
    }
    try {
      if (request.method === 'GET') {
        const { notes } = await load(github);
        return withCors(okResponse(200, { notes }, NO_STORE), request, env);
      }
      const body = await request.json().catch(() => null);
      if (!body || typeof body.id !== 'string' || !RECORD_ID.test(body.id) || typeof body.text !== 'string' || body.text.length > NOTE_MAX_LENGTH) {
        return withCors(errorResponse(400, 'invalid_request', `Send a fragrance id and a note of up to ${NOTE_MAX_LENGTH} characters.`, false, NO_STORE), request, env);
      }
      const { notes, sha } = await load(github);
      const text = body.text.trim();
      if (text) notes[body.id] = { text, updatedAt: new Date(now()).toISOString() };
      else delete notes[body.id];
      await github.writeFile({
        path: FRAGRANCE_NOTES_PATH,
        content: `${JSON.stringify({ notes }, null, 2)}\n`,
        ...(sha ? { sha } : {}),
        message: text ? 'chore(aesthetics): save fragrance note' : 'chore(aesthetics): clear fragrance note'
      });
      return withCors(okResponse(200, { notes, note: notes[body.id] ?? null }, NO_STORE), request, env);
    } catch (error) {
      if (error?.code === 'notes_corrupt') return withCors(errorResponse(503, 'notes_corrupt', 'Your fragrance notes file can’t be read.', false, NO_STORE), request, env);
      if (error instanceof GitHubClientError && error.code === 'write_conflict') {
        return withCors(errorResponse(409, 'write_conflict', 'Notes changed elsewhere. Try saving again.', true, NO_STORE), request, env);
      }
      const retryable = error instanceof GitHubClientError ? error.retryable : true;
      return withCors(errorResponse(503, error?.code ?? 'github_unavailable', 'Your notes are unavailable right now.', retryable, NO_STORE), request, env);
    }
  }, deps);
}

export default createAestheticsNotesHandler();
