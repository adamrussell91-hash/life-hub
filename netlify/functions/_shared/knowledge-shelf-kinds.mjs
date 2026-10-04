// Book-note kinds for the whole shelf in one Message Batch: Claude grades each
// note as person / idea / case / debate / bridge. Results land in placements
// only (never note bodies). Mirrors knowledge-shelf-facts.mjs.

import { FACTS_MODEL } from './knowledge-shelf-facts.mjs';
import { PLACEMENTS_KEY, SHELF_KINDS, cleanPlacement } from './knowledge-shelf.mjs';
import { getKnowledgePage, listKnowledgePages } from './knowledge-data.mjs';

export const KINDS_JOB_KEY = 'kinds-job';
export const FLUID_KINDS = ['debate', 'bridge'];
export const CRYSTALLISED_KINDS = ['person', 'idea', 'case'];
export const KIND_PRECEDENCE = ['debate', 'bridge', 'case', 'person', 'idea'];
const ANTHROPIC_ORIGIN = 'https://api.anthropic.com';
const API_VERSION = '2023-06-01';
const MAX_NOTES = 1000;
const BODY_CHARS = 6000;
const UNREADABLE_GRADE = { kind: 'idea', kindGuessed: true, kindReason: 'Grader reply unreadable.' };

export const KIND_SYSTEM = `You grade one book note with exactly one kind. A book note is information on something in a book.

Pick the kind that names the note's MAIN job — what most of the page is doing. A side mention does not change the kind.

Kinds:
- person: the page is mainly a profile — who someone is and what they contributed
- idea: the page is mainly explaining a concept, term, mechanism or the book's argument
- case: the page is mainly a specific event, study, example or story
- debate: the page's main job is unsettled knowledge — rival accounts, a correction of a popular version, or an open question it is organised around
- bridge: the page's main job is carrying the idea out of the book — implications for teaching, classroom practice, or learning design, or a link to another field or book

Do NOT choose debate just because the note mentions a caveat, a critic, "contested", or two views in passing while it is still mostly a profile, an explanation, or a case. Those stay person / idea / case.
A short closing tip for teachers is not enough for bridge. But if the note's stated aim or a major section is implications for teaching, classroom practice, or learning design, prefer bridge over idea — that is the page carrying the idea out of the book.
Clinical or in-domain professional implications that stay inside the book's own subject (for example lesion localisation tips in a neuroanatomy note) are not bridge. Bridge leaves the book toward teaching/learning design or another field.
When the page is organised around interpretive caution, rival accounts, or an open question, choose debate — even if it also has an "implications" section.

When two kinds truly both describe the main job: debate > bridge > case > person > idea.
idea is only when nothing else fits. It is the easy default a lazy grader will reach for — do not reach for it when debate, bridge, case or person is the main job.

debate needs a quoted sentence from the note showing the disagreement, the correction or the open question that the page is organised around.
bridge needs a quoted sentence pointing outside the book (to practice, teaching or another field) that the page is organised around.
fallback is always the best crystallised fit (person, idea or case), used if a fluid grade cannot be backed up.

Return JSON only, exactly this shape:
{"kind":"person|idea|case|debate|bridge","fallback":"person|idea|case","evidence":"a sentence quoted from the note","reason":"one line","confidence":0.0}`;

function failure(message, status = 400, code = 'validation_error') {
  return Object.assign(new Error(message), { status, code });
}

function requireApiKey(apiKey) {
  if (!apiKey) throw failure('Book-note kinds need the Anthropic key on the server.', 503, 'anthropic_unconfigured');
}

async function getJSON(store, key) {
  return (await store.get(key, { type: 'json', consistency: 'strong' })) ?? null;
}

async function setJSON(store, key, value) {
  if (typeof store.setJSON === 'function') return store.setJSON(key, value);
  return store.set(key, JSON.stringify(value));
}

function headers(apiKey) {
  return { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': API_VERSION };
}

function textFromMessage(message) {
  return (message?.content ?? []).filter(part => part?.type === 'text').map(part => part.text).join('');
}

function normalise(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/[*_`#>"'“”‘’]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** True when the evidence quote (or a long contiguous chunk of it) appears in the body. */
function evidenceInBody(evidence, body) {
  const hay = normalise(body);
  const needle = normalise(evidence);
  if (!needle || needle.length < 12) return false;
  if (hay.includes(needle)) return true;
  // Model quotes often trim or slightly rephrase; accept a 48-char window from the quote.
  if (needle.length >= 48) {
    for (let i = 0; i + 48 <= needle.length; i += 12) {
      if (hay.includes(needle.slice(i, i + 48))) return true;
    }
  }
  return false;
}

function bookLabelFromOrigins(origins) {
  const book = (Array.isArray(origins) ? origins : []).find(item => item?.kind === 'book' && typeof item.label === 'string' && item.label.trim());
  return book ? { label: book.label.trim(), locus: typeof book.locus === 'string' ? book.locus : '' } : null;
}

function readJsonObject(text) {
  try {
    const fenced = String(text ?? '').match(/```(?:json)?\s*([\s\S]*?)```/i);
    const slice = (fenced ? fenced[1] : String(text ?? '')).trim();
    const start = slice.indexOf('{');
    const end = slice.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    const raw = JSON.parse(slice.slice(start, end + 1));
    return raw && typeof raw === 'object' ? raw : null;
  } catch {
    return null;
  }
}

function readConfidence(value) {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Number(value);
  return NaN;
}

export function kindPrompt(note) {
  const body = String(note?.body ?? '').slice(0, BODY_CHARS);
  return `Title: ${note?.title ?? ''}
Book: ${note?.bookLabel ?? ''}
Locus: ${note?.locus ?? ''}

${body}`;
}

/**
 * Parse a grader reply against the note body. Always returns one of the five kinds.
 * Fluid grades whose evidence quote is missing are downgraded to fallback.
 */
export function parseKindGrade(text, body) {
  const raw = readJsonObject(text);
  if (!raw) return { unreadable: true };

  let kind = SHELF_KINDS.includes(raw.kind) ? raw.kind : null;
  if (!kind) return { unreadable: true };

  const fallback = CRYSTALLISED_KINDS.includes(raw.fallback) ? raw.fallback : 'idea';
  const evidence = typeof raw.evidence === 'string' ? raw.evidence.trim() : '';
  let reason = typeof raw.reason === 'string' ? raw.reason.trim().slice(0, 300) : '';
  const confidenceRaw = readConfidence(raw.confidence);
  const confidence = Number.isFinite(confidenceRaw) ? confidenceRaw : null;

  let kindGuessed = confidence === null || confidence < 0.7;
  let downgraded = false;
  if (FLUID_KINDS.includes(kind) && !evidenceInBody(evidence, body)) {
    kind = fallback;
    kindGuessed = true;
    downgraded = true;
    reason = `Downgraded: quote not found.${reason ? ` ${reason}` : ''}`.slice(0, 300);
  }
  return {
    kind,
    kindGuessed,
    kindReason: reason || undefined,
    downgraded,
    confidence,
    evidence: evidence || undefined
  };
}

export function kindsRequest(customId, note) {
  return {
    custom_id: customId,
    params: {
      model: FACTS_MODEL,
      max_tokens: 1024,
      system: KIND_SYSTEM,
      messages: [{ role: 'user', content: kindPrompt(note) }]
    }
  };
}

function publicJob(job) {
  if (!job) return { status: 'none' };
  const { ids, batchId, ...rest } = job;
  return rest;
}

function shouldGrade(placement, { regrade }) {
  if (placement?.kindBy === 'adam') return false;
  if (regrade) return placement?.kindBy !== 'clementine';
  return !placement?.kind;
}

async function loadBookNotes({ listPages, getPage, idsFilter }) {
  const manifest = await listPages();
  const wanted = idsFilter ? new Set(idsFilter) : null;
  const notes = [];
  for (const entry of manifest) {
    if (!entry?.id || (wanted && !wanted.has(entry.id))) continue;
    const book = bookLabelFromOrigins(entry.origins);
    if (!book) continue;
    const page = await getPage(entry.id);
    if (!page || typeof page.body !== 'string') continue;
    notes.push({
      id: entry.id,
      title: page.title ?? entry.title ?? '',
      bookLabel: book.label,
      locus: book.locus,
      body: page.body
    });
    if (notes.length >= MAX_NOTES) break;
  }
  return notes;
}

function pageLoaders({ listPages, getPage, env, fetchImpl }) {
  return {
    listPages: listPages ?? (() => listKnowledgePages({ env, fetchImpl })),
    getPage: getPage ?? (id => getKnowledgePage(id, { env, fetchImpl }))
  };
}

/** Starts one batch for book notes that still need a kind. Refuses while a batch is running. */
export async function startKindsJob(store, { ids, regrade = false } = {}, {
  apiKey,
  fetchImpl = fetch,
  now = new Date().toISOString(),
  listPages,
  getPage,
  env
} = {}) {
  requireApiKey(apiKey);
  const current = await getJSON(store, KINDS_JOB_KEY);
  if (current?.status === 'running') throw failure('Book-note kinds are already being graded. Check back shortly.', 409, 'job_running');

  const loaders = pageLoaders({ listPages, getPage, env, fetchImpl });
  const placements = (await getJSON(store, PLACEMENTS_KEY)) ?? {};
  const candidates = await loadBookNotes({
    listPages: loaders.listPages,
    getPage: loaders.getPage,
    idsFilter: Array.isArray(ids) ? ids.filter(id => typeof id === 'string') : null
  });
  const notes = candidates.filter(note => shouldGrade(placements[note.id], { regrade }));
  if (!notes.length) throw failure('Every book note already has a kind.');

  const idMap = Object.fromEntries(notes.map((note, index) => [`note_${String(index).padStart(4, '0')}`, note.id]));
  const byId = new Map(notes.map(note => [note.id, note]));
  const requests = Object.entries(idMap).map(([customId, pageId]) => kindsRequest(customId, byId.get(pageId)));

  let response;
  try {
    response = await fetchImpl(`${ANTHROPIC_ORIGIN}/v1/messages/batches`, {
      method: 'POST',
      headers: headers(apiKey),
      body: JSON.stringify({ requests })
    });
  } catch {
    throw failure('Could not reach Claude to start grading kinds.', 502, 'anthropic_unavailable');
  }
  if (!response.ok) throw failure(`Claude refused the kinds batch (HTTP ${response.status}).`, 502, 'anthropic_request_failed');
  const batch = await response.json();
  const job = { status: 'running', batchId: batch.id, ids: idMap, total: notes.length, started_at: now };
  await setJSON(store, KINDS_JOB_KEY, job);
  return publicJob(job);
}

export async function readKindsJob(store) {
  return publicJob(await getJSON(store, KINDS_JOB_KEY));
}

function gradeFromLine(line) {
  if (line?.result?.type !== 'succeeded') return { unreadable: true };
  const message = line.result.message;
  if (message?.stop_reason === 'refusal' || message?.stop_reason === 'max_tokens') return { unreadable: true };
  return { text: textFromMessage(message) };
}

function gradeFromText(text, body) {
  const grade = parseKindGrade(text, body);
  return grade.unreadable ? { ...UNREADABLE_GRADE, unreadable: true } : grade;
}

async function applyKindPatch(store, pageId, grade, now) {
  const placements = (await getJSON(store, PLACEMENTS_KEY)) ?? {};
  const current = placements[pageId] ?? { pageId };
  if (current.kindBy === 'adam') return null;
  const patch = cleanPlacement({
    pageId,
    kind: grade.kind,
    kindGuessed: grade.kindGuessed,
    kindBy: 'claude',
    kindReason: grade.kindReason ?? null,
    kindAt: now
  });
  const next = { ...current };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    if (value === null) delete next[key];
    else next[key] = value;
  }
  next.updated_at = now;
  placements[pageId] = next;
  await setJSON(store, PLACEMENTS_KEY, placements);
  return next;
}

/** Checks the batch; when ended, applies each result once into placements. */
export async function checkKindsJob(store, {
  apiKey,
  fetchImpl = fetch,
  now = new Date().toISOString(),
  getPage,
  env
} = {}) {
  const job = await getJSON(store, KINDS_JOB_KEY);
  if (!job || job.status !== 'running') return publicJob(job);
  requireApiKey(apiKey);

  let batch;
  try {
    const response = await fetchImpl(`${ANTHROPIC_ORIGIN}/v1/messages/batches/${encodeURIComponent(job.batchId)}`, { headers: headers(apiKey) });
    if (!response.ok) throw new Error(String(response.status));
    batch = await response.json();
  } catch {
    throw failure('Could not reach Claude to check the kinds batch.', 502, 'anthropic_unavailable');
  }
  if (batch.processing_status !== 'ended') {
    const counts = batch.request_counts ?? {};
    const finished = (counts.succeeded ?? 0) + (counts.errored ?? 0) + (counts.canceled ?? 0) + (counts.expired ?? 0);
    return { ...publicJob(job), finished };
  }

  let text;
  try {
    const response = await fetchImpl(batch.results_url, { headers: headers(apiKey) });
    if (!response.ok) throw new Error(String(response.status));
    text = await response.text();
  } catch {
    throw failure('Claude finished, but the kinds results could not be downloaded. Try again.', 502, 'anthropic_unavailable');
  }

  const { getPage: pageLoader } = pageLoaders({ getPage, env, fetchImpl });
  const outcome = {
    applied: 0,
    byKind: Object.fromEntries(SHELF_KINDS.map(kind => [kind, 0])),
    guessed: 0,
    downgraded: 0,
    unreadable: 0
  };

  for (const raw of text.split('\n')) {
    if (!raw.trim()) continue;
    let line;
    try {
      line = JSON.parse(raw);
    } catch {
      continue;
    }
    const pageId = job.ids[line.custom_id];
    if (!pageId) continue;

    const extracted = gradeFromLine(line);
    let grade;
    if (extracted.unreadable) {
      grade = { ...UNREADABLE_GRADE, unreadable: true };
    } else {
      const page = await pageLoader(pageId);
      grade = gradeFromText(extracted.text, page?.body ?? '');
    }

    if (grade.unreadable) outcome.unreadable += 1;
    else {
      if (grade.downgraded) outcome.downgraded += 1;
      if (grade.kindGuessed) outcome.guessed += 1;
    }

    const saved = await applyKindPatch(store, pageId, grade, now);
    if (saved) {
      outcome.applied += 1;
      outcome.byKind[grade.kind] = (outcome.byKind[grade.kind] ?? 0) + 1;
    }
  }

  const done = { ...job, status: 'done', finished_at: now, ...outcome };
  await setJSON(store, KINDS_JOB_KEY, done);
  return publicJob(done);
}

/** Grades one note synchronously. Retries once on an unreadable reply. */
export async function gradeOneKind(store, pageId, {
  apiKey,
  fetchImpl = fetch,
  now = new Date().toISOString(),
  getPage,
  env
} = {}) {
  requireApiKey(apiKey);
  if (typeof pageId !== 'string' || !pageId.trim()) throw failure('A pageId is required.');

  const placements = (await getJSON(store, PLACEMENTS_KEY)) ?? {};
  const current = placements[pageId] ?? null;
  if (current?.kindBy === 'adam') throw failure('This note already has a kind set by Adam.', 409, 'kind_locked');
  if (current?.kindBy === 'clementine' && current?.kind) return current;

  const { getPage: pageLoader } = pageLoaders({ getPage, env, fetchImpl });
  const page = await pageLoader(pageId);
  if (!page) throw failure('Unknown pageId.', 404, 'page_not_found');
  const book = bookLabelFromOrigins(page.origins);
  if (!book) throw failure('That page is not a book note.', 400, 'not_book_note');
  const note = { id: pageId, title: page.title ?? '', bookLabel: book.label, locus: book.locus, body: page.body ?? '' };

  const call = async () => {
    const response = await fetchImpl(`${ANTHROPIC_ORIGIN}/v1/messages`, {
      method: 'POST',
      headers: headers(apiKey),
      body: JSON.stringify(kindsRequest('sync', note).params)
    });
    if (!response.ok) throw failure(`Claude refused to grade the kind (HTTP ${response.status}).`, 502, 'anthropic_request_failed');
    const message = await response.json();
    return parseKindGrade(textFromMessage(message), note.body);
  };

  let grade;
  try {
    grade = await call();
    if (grade.unreadable) grade = await call();
  } catch (error) {
    if (error?.status) throw error;
    throw failure('Could not reach Claude to grade the kind.', 502, 'anthropic_unavailable');
  }
  if (grade.unreadable) grade = { ...UNREADABLE_GRADE };
  return applyKindPatch(store, pageId, grade, now);
}
