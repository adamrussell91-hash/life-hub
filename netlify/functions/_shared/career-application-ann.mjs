/**
 * Ann works on one job application. The check suggests an answer per selection
 * criterion and stores nothing (Adam confirms through applications?action=confirm-check).
 * The draft writes responses, a cover letter or a CV from confirmed answers only,
 * and never overwrites text Adam wrote himself: that goes to `pending`.
 */

import { callAnn, extractJson } from './career-future-draft.mjs';
import { applicationCheckPrompt, applicationDraftPrompt } from './career-application-prompts.mjs';
import {
  CHECK_CARD_IDS_MAX,
  CHECK_EVIDENCE_MAX,
  CHECK_STATUSES,
  COVER_LETTER_MAX,
  CRITERION_RESPONSE_MAX,
  CV_MAX
} from './application-schema.mjs';
import { readPrivateFileBytes } from './private-data-file.mjs';

const MODEL = 'claude-sonnet-5';
const CENTRAL_NODE_PATH = 'central-node.md';
// Adam's own voice lives in the private repo at this path (agent voices sit beside it).
// If it is missing, drafts lean on his past answers and the house writing rules: never
// on an agent's voice, because the drafts go out under his name.
export const ADAM_VOICE_PATH = 'config/humanizer/voices/adam.md';
export const DRAFT_TARGETS = new Set(['responses', 'cover_letter', 'cv']);
const DRAFTABLE = new Set(['have', 'partly']);
const PIECE_MAX = { cover_letter: COVER_LETTER_MAX, cv: CV_MAX };

function annError(status, code, message) {
  return Object.assign(new Error(message), { status, code });
}

async function readCentralNode(env, fetchImpl) {
  try {
    const bytes = await readPrivateFileBytes(CENTRAL_NODE_PATH, { env, fetchImpl, label: 'Central Node' });
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

/** Adam's private voice sample; empty when the file is not there. */
export async function readVoiceSample(env, fetchImpl) {
  try {
    const bytes = await readPrivateFileBytes(ADAM_VOICE_PATH, { env, fetchImpl, label: 'voice sample' });
    return new TextDecoder().decode(bytes).trim();
  } catch {
    return '';
  }
}

const OWN_WRITING_MAX = 3;
const OWN_WRITING_CHARS = 1500;

/**
 * Up to three answers Adam wrote himself on other applications, newest first, as a
 * second voice reference. Ann's own drafts never count.
 */
export function pickOwnWriting(applications = [], currentId = null) {
  const out = [];
  const sorted = [...applications].sort((a, b) => String(b?.updated_at ?? '').localeCompare(String(a?.updated_at ?? '')));
  for (const app of sorted) {
    if (!app || app.id === currentId) continue;
    for (const c of app.selection_criteria ?? []) {
      const text = typeof c?.response === 'string' ? c.response.trim() : '';
      if (text.length < 200 || c.response_source === 'ann') continue;
      out.push(text.slice(0, OWN_WRITING_CHARS));
      if (out.length >= OWN_WRITING_MAX) return out;
    }
  }
  return out;
}

function replyText(json) {
  return Array.isArray(json?.content) ? json.content.map((p) => p?.text ?? '').join('') : '';
}

async function askAnn(content, maxTokens, { apiKey, fetchImpl, sleep }) {
  try {
    return await callAnn(
      { model: MODEL, max_tokens: maxTokens, messages: [{ role: 'user', content }] },
      { apiKey, fetchImpl, sleep }
    );
  } catch {
    throw annError(502, 'ann_unavailable', 'Ann couldn’t be reached after three tries. Try again in a minute.');
  }
}

/** Keeps only known criteria and cards; anything unclear stays unanswered. */
export function parseApplicationCheck(raw, criteria, cardIds = []) {
  let parsed;
  try {
    parsed = JSON.parse(extractJson(raw));
  } catch {
    return null;
  }
  if (!Array.isArray(parsed?.suggestions)) return null;
  const known = new Set(criteria.map((c) => c.id));
  const knownCards = new Set(cardIds);
  const seen = new Set();
  const suggestions = [];
  for (const item of parsed.suggestions) {
    if (!known.has(item?.criterion_id) || seen.has(item.criterion_id)) continue;
    seen.add(item.criterion_id);
    const status = CHECK_STATUSES.has(item.status) ? item.status : 'unknown';
    const cards = Array.isArray(item.card_ids)
      ? [...new Set(item.card_ids.filter((id) => typeof id === 'string' && knownCards.has(id)))]
      : [];
    suggestions.push({
      criterion_id: item.criterion_id,
      status,
      evidence: typeof item.evidence === 'string' ? item.evidence.trim().slice(0, CHECK_EVIDENCE_MAX) : '',
      card_ids: cards.slice(0, CHECK_CARD_IDS_MAX)
    });
  }
  return suggestions;
}

export async function checkApplicationWithAnn({
  application,
  where = null,
  cards = [],
  roles = [],
  env,
  apiKey,
  fetchImpl = fetch,
  sleep
} = {}) {
  const criteria = (application?.selection_criteria ?? []).map((c) => ({ id: c.id, text: c.criterion }));
  if (!criteria.length) throw annError(400, 'no_criteria', 'Split the ad into criteria first.');
  if (!apiKey) throw annError(503, 'ann_unavailable', 'Ann can’t be reached from here. Mark the lines yourself for now.');

  const centralNode = await readCentralNode(env, fetchImpl);
  const content = applicationCheckPrompt({
    title: application.position_title,
    where,
    criteria,
    cards,
    roles,
    centralNode
  });
  const json = await askAnn(content, 4000, { apiKey, fetchImpl, sleep });
  const suggestions = parseApplicationCheck(replyText(json), criteria, cards.map((c) => c.id));
  if (!suggestions) throw annError(502, 'ann_unreadable', 'Ann’s answer didn’t come through. Try again.');
  return { suggestions, read_central_node: centralNode != null };
}

export function countBrackets(text) {
  return (String(text ?? '').match(/\[add:/gi) ?? []).length;
}

function cardsFor(check, cardsById) {
  return (check?.card_ids ?? [])
    .map((id) => cardsById.get(id))
    .filter(Boolean)
    .map((card) => ({ title: card.title, when: card.when ?? null, skills: card.skills ?? [], star: card.star ?? null }));
}

/** Which criteria may be drafted, and why the rest are skipped. */
export function planDraft(application, { criterionId = null, cards = [] } = {}) {
  const cardsById = new Map(cards.map((card) => [card.id, card]));
  const all = application?.selection_criteria ?? [];
  const pool = criterionId ? all.filter((c) => c.id === criterionId) : all;
  const draftable = [];
  const skipped = [];
  for (const c of pool) {
    if (!c.check) skipped.push({ criterion_id: c.id, reason: 'not_checked' });
    else if (!DRAFTABLE.has(c.check.status)) skipped.push({ criterion_id: c.id, reason: 'no_evidence' });
    else {
      draftable.push({
        criterion_id: c.id,
        text: c.criterion,
        word_limit: c.word_limit ?? null,
        status: c.check.status,
        evidence: c.check.evidence,
        cards: cardsFor(c.check, cardsById)
      });
    }
  }
  return { draftable, skipped };
}

function strongestEvidence(application, cards) {
  const { draftable } = planDraft(application, { cards });
  return [...draftable].sort((a, b) => (a.status === b.status ? 0 : a.status === 'have' ? -1 : 1));
}

export function parseResponsesDraft(raw, allowedIds) {
  let parsed;
  try {
    parsed = JSON.parse(extractJson(raw));
  } catch {
    return null;
  }
  if (!Array.isArray(parsed?.responses)) return null;
  const allowed = new Set(allowedIds);
  const out = new Map();
  for (const item of parsed.responses) {
    if (!allowed.has(item?.criterion_id) || out.has(item.criterion_id)) continue;
    if (typeof item.text !== 'string' || !item.text.trim()) continue;
    out.set(item.criterion_id, item.text.trim().slice(0, CRITERION_RESPONSE_MAX));
  }
  return out;
}

function parsePieceDraft(raw, max) {
  try {
    const parsed = JSON.parse(extractJson(raw));
    if (typeof parsed?.text !== 'string' || !parsed.text.trim()) return null;
    return parsed.text.trim().slice(0, max);
  } catch {
    return null;
  }
}

/** Ann's text replaces only an empty box or her own unchanged draft. */
function mayOverwrite(text, source) {
  return !String(text ?? '').trim() || source === 'ann';
}

export function applyResponseDrafts(criteria, drafts, nowIso) {
  return criteria.map((c) => {
    const draft = drafts.get(c.id);
    if (draft === undefined) return c;
    if (mayOverwrite(c.response, c.response_source)) {
      return { ...c, response: draft, response_source: 'ann', response_drafted_at: nowIso, response_pending: null };
    }
    return { ...c, response_pending: draft, response_drafted_at: nowIso };
  });
}

export function applyPieceDraft(existing, draft, nowIso) {
  if (!existing || mayOverwrite(existing.text, existing.source)) {
    return { text: draft, source: 'ann', drafted_at: nowIso, updated_at: nowIso, pending: null };
  }
  return { ...existing, pending: draft, drafted_at: nowIso, updated_at: nowIso };
}

/**
 * Drafts one target and returns the field patch for the application, plus what
 * was drafted, what was skipped and how many [add: …] brackets Ann left.
 * `apply(record)` rebuilds the patch against a fresher copy of the application,
 * so an edit Adam saved while Ann was writing is kept (the draft goes to pending).
 */
export async function draftApplicationWithAnn({
  application,
  target,
  criterion_id = null,
  where = null,
  cards = [],
  roles = [],
  ownWriting = [],
  env,
  apiKey,
  fetchImpl = fetch,
  sleep,
  now = () => new Date().toISOString()
} = {}) {
  if (!DRAFT_TARGETS.has(target)) throw annError(400, 'invalid_target', 'target must be responses, cover_letter or cv.');
  if (!application) throw annError(404, 'application_not_found', 'Application not found.');

  let criteria;
  let skipped = [];
  if (target === 'responses') {
    const plan = planDraft(application, { criterionId: criterion_id, cards });
    criteria = plan.draftable;
    skipped = plan.skipped;
    if (!criteria.length) return { patch: null, drafted: [], skipped, brackets: 0, read_central_node: false };
  } else {
    criteria = strongestEvidence(application, cards);
  }
  if (!apiKey) throw annError(503, 'ann_unavailable', 'Ann can’t be reached from here. Try again later.');

  const [centralNode, voiceSample] = await Promise.all([
    readCentralNode(env, fetchImpl),
    readVoiceSample(env, fetchImpl)
  ]);
  const content = applicationDraftPrompt({ target, application, where, criteria, roles, centralNode, voiceSample, ownWriting });
  const json = await askAnn(content, 8000, { apiKey, fetchImpl, sleep });
  const text = replyText(json);
  const nowIso = now();

  if (target === 'responses') {
    const drafts = parseResponsesDraft(text, criteria.map((c) => c.criterion_id));
    if (!drafts || !drafts.size) throw annError(502, 'ann_unreadable', 'Ann’s drafts didn’t come through. Try again.');
    let brackets = 0;
    for (const draft of drafts.values()) brackets += countBrackets(draft);
    const apply = (record) => ({
      selection_criteria: applyResponseDrafts(record.selection_criteria ?? [], drafts, nowIso)
    });
    return {
      patch: apply(application),
      apply,
      drafted: [...drafts.keys()],
      skipped,
      brackets,
      read_central_node: centralNode != null
    };
  }

  const draft = parsePieceDraft(text, PIECE_MAX[target]);
  if (!draft) throw annError(502, 'ann_unreadable', 'Ann’s draft didn’t come through. Try again.');
  const apply = (record) => ({ [target]: applyPieceDraft(record[target] ?? null, draft, nowIso) });
  return {
    patch: apply(application),
    apply,
    drafted: [target],
    skipped: [],
    brackets: countBrackets(draft),
    read_central_node: centralNode != null
  };
}
