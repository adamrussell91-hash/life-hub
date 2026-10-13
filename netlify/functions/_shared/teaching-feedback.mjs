import { createHash, randomBytes } from 'node:crypto';
import {
  getJSON,
  listJSON,
  mediaFileKey,
  mediaKey,
  newId,
  setJSON,
  deleteKey
} from './teaching-blobs.mjs';

export const FEEDBACK_DOC_PREFIX = 'feedback_docs/';
export const FEEDBACK_TOKEN_PREFIX = 'feedback_tokens/';

export function feedbackDocKey(id) {
  return `${FEEDBACK_DOC_PREFIX}${id}`;
}

export function feedbackTokenKey(hash) {
  return `${FEEDBACK_TOKEN_PREFIX}${hash}`;
}

export function hashFeedbackToken(token) {
  return createHash('sha256').update(String(token)).digest('hex');
}

export function mintFeedbackToken(deps = {}) {
  if (typeof deps.randomToken === 'function') return deps.randomToken();
  return randomBytes(32).toString('base64url');
}

export function toTeacherFeedbackDoc(doc) {
  if (!doc || typeof doc !== 'object') return null;
  return {
    id: doc.id,
    title: doc.title,
    body_html: doc.body_html ?? '',
    audio_media_id: doc.audio_media_id ?? null,
    student_label: doc.student_label ?? null,
    has_link: Boolean(doc.token_hash) && !doc.revoked_at,
    expires_at: doc.expires_at ?? null,
    revoked_at: doc.revoked_at ?? null,
    created_at: doc.created_at,
    updated_at: doc.updated_at
  };
}

/** Student-visible payload only — never token_hash or media ids. */
export function toPublishedFeedbackPayload(doc, audioUrl) {
  return {
    title: doc.title,
    body_html: typeof doc.body_html === 'string' ? doc.body_html : '',
    student_label: doc.student_label ?? null,
    ...(audioUrl ? { audio_url: audioUrl } : {})
  };
}

export function feedbackLinkAlive(doc, nowMs) {
  if (!doc || !doc.token_hash) return false;
  if (doc.revoked_at) return false;
  if (doc.expires_at) {
    const expires = Date.parse(doc.expires_at);
    if (Number.isFinite(expires) && expires <= nowMs) return false;
  }
  return true;
}

export async function listFeedbackDocs(store) {
  const rows = await listJSON(store, FEEDBACK_DOC_PREFIX);
  return rows
    .filter((row) => row && row.type === 'feedback_doc')
    .map(toTeacherFeedbackDoc)
    .filter(Boolean)
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
}

export async function createFeedbackDoc(store, input, deps = {}) {
  const now = deps.nowIso ? deps.nowIso() : new Date().toISOString();
  const id = newId('feedback');
  const title = String(input?.title ?? '').trim() || 'Feedback';
  const body_html = typeof input?.body_html === 'string' ? input.body_html : '';
  const student_label =
    typeof input?.student_label === 'string' && input.student_label.trim()
      ? input.student_label.trim()
      : null;
  const audio_media_id =
    typeof input?.audio_media_id === 'string' && input.audio_media_id.trim()
      ? input.audio_media_id.trim()
      : null;
  const doc = {
    id,
    type: 'feedback_doc',
    title,
    body_html,
    audio_media_id,
    student_label,
    token_hash: null,
    expires_at: null,
    revoked_at: null,
    created_at: now,
    updated_at: now
  };
  await setJSON(store, feedbackDocKey(id), doc);
  return toTeacherFeedbackDoc(doc);
}

export async function createFeedbackLink(store, id, deps = {}) {
  const doc = await getJSON(store, feedbackDocKey(id));
  if (!doc || doc.type !== 'feedback_doc') return { error: 'not_found' };

  const now = deps.nowIso ? deps.nowIso() : new Date().toISOString();
  const token = mintFeedbackToken(deps);
  const token_hash = hashFeedbackToken(token);

  if (doc.token_hash) {
    await deleteKey(store, feedbackTokenKey(doc.token_hash)).catch(() => undefined);
  }

  const expires_at =
    typeof deps.expiresAt === 'string'
      ? deps.expiresAt
      : typeof deps.expires_at === 'string'
        ? deps.expires_at
        : null;

  const next = {
    ...doc,
    token_hash,
    revoked_at: null,
    expires_at,
    link_created_at: now,
    updated_at: now
  };
  await setJSON(store, feedbackDocKey(id), next);
  await setJSON(store, feedbackTokenKey(token_hash), {
    doc_id: id,
    created_at: now,
    expires_at
  });
  return { token, doc: toTeacherFeedbackDoc(next) };
}

export async function revokeFeedbackLink(store, id, deps = {}) {
  const doc = await getJSON(store, feedbackDocKey(id));
  if (!doc || doc.type !== 'feedback_doc') return { error: 'not_found' };
  const now = deps.nowIso ? deps.nowIso() : new Date().toISOString();
  if (doc.token_hash) {
    await deleteKey(store, feedbackTokenKey(doc.token_hash)).catch(() => undefined);
  }
  const next = {
    ...doc,
    token_hash: null,
    revoked_at: now,
    updated_at: now
  };
  await setJSON(store, feedbackDocKey(id), next);
  return { doc: toTeacherFeedbackDoc(next) };
}

/**
 * Resolve a live feedback doc from a raw token.
 * Wrong / expired / revoked all return null so callers can emit identical 404s.
 */
export async function resolveFeedbackByToken(store, token, deps = {}) {
  if (typeof token !== 'string' || !token.trim()) return null;
  const nowMs = deps.nowMs ?? Date.now();
  const hash = hashFeedbackToken(token.trim());
  const index = await getJSON(store, feedbackTokenKey(hash));
  if (!index?.doc_id) return null;
  const doc = await getJSON(store, feedbackDocKey(index.doc_id));
  if (!doc || doc.type !== 'feedback_doc') return null;
  if (doc.token_hash !== hash) return null;
  if (!feedbackLinkAlive(doc, nowMs)) return null;
  return doc;
}

export async function readFeedbackAudioBytes(store, doc) {
  const mediaId = doc?.audio_media_id;
  if (!mediaId) return null;
  const meta = await getJSON(store, mediaKey(mediaId));
  if (!meta || meta.status !== 'active') return null;
  const result = await store.getWithMetadata(mediaFileKey(mediaId), { type: 'arrayBuffer' });
  if (!result?.data) return null;
  const contentType =
    meta.mime_type ||
    (typeof result.metadata?.contentType === 'string' ? result.metadata.contentType : null) ||
    'application/octet-stream';
  return { bytes: result.data, contentType };
}
