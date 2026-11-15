import { randomBytes } from 'node:crypto';
import { errorResponse, methodNotAllowed, okResponse, withCors } from './_shared/http.mjs';
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { readJsonObject } from './_shared/teaching-record-get.mjs';
import { createMentorshipRepository } from './_shared/mentorship-repository.mjs';
import { isValidMentorshipId, mentorshipSheetShareKey } from './_shared/mentorship-schema.mjs';
import { defaultGetProfessionalStore } from './_shared/professional-blobs.mjs';
import { defaultGetContentStore } from './_shared/teaching-blobs.mjs';
import { buildSheet, sheetSnapshotKey } from './_shared/meeting-sheet.mjs';

export const config = { path: '/api/mentorship-sheets' };

const ACTIONS = new Set(['publish', 'stop']);
const DEFAULT_TITLE = 'Shared with you';

const shareView = (share) => (share ? { token: share.token, created_at: share.created_at, updated_at: share.updated_at } : null);

/**
 * The sender's side of a mentee sheet. The sheet is built from the mentorship's
 * shared blocks by the same builder as meeting sheets and saved under the same
 * key, so the existing public reader serves it unchanged.
 */
export function createMentorshipSheetsHandler(deps = {}) {
  const getSnapshotStore = deps.getSnapshotStore ?? defaultGetContentStore;
  const createRepository = deps.createMentorshipRepository ?? createMentorshipRepository;
  const now = deps.now ?? (() => new Date().toISOString());
  const newToken = deps.newToken ?? (() => randomBytes(24).toString('hex'));

  return createOperatorHandler(
    async (request, context) => {
      const { env, store } = context;
      const url = new URL(request.url);
      const id = url.searchParams.get('mentorship_id');
      const respond = (status, data) => withCors(okResponse(status, data), request, env);
      if (!isValidMentorshipId(id)) {
        return withCors(errorResponse(400, 'invalid_mentorship_id', 'A valid mentorship_id is required.', false), request, env);
      }
      try {
        const repo = createRepository({ store, now });
        const mentorship = await repo.getMentorship(id);
        const share = await store.get(mentorshipSheetShareKey(id), { type: 'json' });

        if (request.method === 'GET') return respond(200, { share: shareView(share) });
        if (request.method !== 'POST') return withCors(methodNotAllowed('GET, POST, OPTIONS'), request, env);

        const action = url.searchParams.get('action');
        if (!ACTIONS.has(action)) {
          return withCors(errorResponse(400, 'invalid_action', 'Unsupported action.', false), request, env);
        }
        const snapshots = await getSnapshotStore();
        if (action === 'stop') {
          if (share) {
            await snapshots.delete(sheetSnapshotKey(share.token));
            await store.delete(mentorshipSheetShareKey(id));
          }
          return respond(200, { share: null });
        }

        let body = {};
        const text = await request.clone().text();
        if (text.trim()) {
          const parsed = await readJsonObject(request);
          if (parsed.error) return withCors(parsed.error, request, env);
          body = parsed.value;
        }
        const title = typeof body.title === 'string' && body.title.trim() ? body.title.trim() : DEFAULT_TITLE;
        const pseudoMeeting = {
          title,
          blocks: mentorship.shared_blocks,
          notes: '',
          minutes: null,
          minutes_notes: [],
          coaching_sheets: [],
          scheduled_start: null,
          time_zone: null
        };
        const picks = {
          title,
          message: body.message,
          from: body.from,
          summary: false,
          notes: true,
          annotations: true,
          voice: true,
          minutes: false,
          coaching: false,
          off_layers: []
        };
        const { sheet, left_off } = buildSheet(pseudoMeeting, picks, { now });
        const token = share?.token ?? newToken();
        const at = now();
        const next = { token, created_at: share?.created_at ?? at, updated_at: at };
        await snapshots.setJSON(sheetSnapshotKey(token), sheet);
        await store.setJSON(mentorshipSheetShareKey(id), next);
        return respond(200, { share: shareView(next), left_off });
      } catch (error) {
        const status = Number.isInteger(error?.status) ? error.status : 500;
        const code = typeof error?.code === 'string' ? error.code : 'internal_error';
        const message = status < 500 && error?.message ? error.message : 'The share sheet could not be saved.';
        return withCors(errorResponse(status, code, message, status >= 500), request, env);
      }
    },
    { ...deps, getContentStore: deps.getContentStore ?? defaultGetProfessionalStore, unboundMessage: 'Professional content store is not bound.' }
  );
}

export default createMentorshipSheetsHandler();
