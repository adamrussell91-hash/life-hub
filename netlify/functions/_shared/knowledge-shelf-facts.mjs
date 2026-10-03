// Book facts for the whole shelf in one Message Batch: Claude estimates each
// book's page count and chapter start pages, results fill only blank fields
// and are marked estimated. A batch runs in the background (usually well
// under an hour) at half price, so no Netlify function waits on Claude.

import { BOOKS_KEY, cleanBookPatch, shelfBookKey } from './knowledge-shelf.mjs';

export const FACTS_JOB_KEY = 'facts-job';
export const FACTS_MODEL = 'claude-opus-5-5';
const ANTHROPIC_ORIGIN = 'https://api.anthropic.com';
const API_VERSION = '2023-06-01';
const MAX_BOOKS = 1000;

const SYSTEM = `You give the physical facts of a book so a reader can map their notes onto its pages.
Use the edition most readers in Australia own unless the title says otherwise, and name it in "edition".
Page numbers are the printed numbers in that edition. "pages" is the last printed page of the main text.
List every chapter in order (include an introduction or prologue with label ""), each with the page it starts on.
If you do not recognise the book, or cannot tell which book is meant, set "known" to false and leave the rest empty.
Set "confidence" to how sure you are of the page numbers: "high" only when you know this edition well.`;

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['known', 'author', 'edition', 'pages', 'confidence', 'chapters'],
  properties: {
    known: { type: 'boolean' },
    author: { type: 'string' },
    edition: { type: 'string' },
    pages: { type: 'integer' },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    chapters: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['label', 'title', 'start'],
        properties: {
          label: { type: 'string' },
          title: { type: 'string' },
          start: { type: 'integer' }
        }
      }
    }
  }
};

function failure(message, status = 400, code = 'validation_error') {
  return Object.assign(new Error(message), { status, code });
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

export function factsRequest(customId, label, author) {
  return {
    custom_id: customId,
    params: {
      model: FACTS_MODEL,
      max_tokens: 16000,
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
      system: SYSTEM,
      messages: [{ role: 'user', content: `Book: "${label}"${author ? ` by ${author}` : ''}` }]
    }
  };
}

/** Starts one batch for the given titles. Refuses while a batch is still running. */
export async function startFactsJob(store, rawLabels, { apiKey, fetchImpl = fetch, now = new Date().toISOString() } = {}) {
  if (!apiKey) throw failure('Book facts need the Anthropic key on the server.', 503, 'anthropic_unconfigured');
  const current = await getJSON(store, FACTS_JOB_KEY);
  if (current?.status === 'running') throw failure('Book facts are already being worked out. Check back shortly.', 409, 'job_running');
  const books = (await getJSON(store, BOOKS_KEY)) ?? {};
  const seen = new Set();
  const labels = (Array.isArray(rawLabels) ? rawLabels : [])
    .map(label => (typeof label === 'string' ? label.replace(/\s+/g, ' ').trim() : ''))
    .filter(label => {
      if (!label || label.length > 200) return false;
      const key = shelfBookKey(label);
      if (seen.has(key) || books[key]?.pages) return false;
      seen.add(key);
      return true;
    })
    .slice(0, MAX_BOOKS);
  if (!labels.length) throw failure('Every book already has its facts.');
  const ids = Object.fromEntries(labels.map((label, index) => [`book_${String(index).padStart(4, '0')}`, label]));
  const requests = Object.entries(ids).map(([id, label]) => factsRequest(id, label, books[shelfBookKey(label)]?.author));
  let response;
  try {
    response = await fetchImpl(`${ANTHROPIC_ORIGIN}/v1/messages/batches`, {
      method: 'POST',
      headers: headers(apiKey),
      body: JSON.stringify({ requests })
    });
  } catch {
    throw failure('Could not reach Claude to start the book facts.', 502, 'anthropic_unavailable');
  }
  if (!response.ok) throw failure(`Claude refused the book facts batch (HTTP ${response.status}).`, 502, 'anthropic_request_failed');
  const batch = await response.json();
  const job = { status: 'running', batchId: batch.id, ids, total: labels.length, started_at: now };
  await setJSON(store, FACTS_JOB_KEY, job);
  return publicJob(job);
}

export async function readFactsJob(store) {
  return publicJob(await getJSON(store, FACTS_JOB_KEY));
}

function publicJob(job) {
  if (!job) return { status: 'none' };
  const { ids, batchId, ...rest } = job;
  return rest;
}

/** Turns one batch result into a book patch, or a reason it was skipped. */
export function factsFromResult(line, label) {
  if (line?.result?.type !== 'succeeded') return { skip: 'failed' };
  const message = line.result.message;
  if (message?.stop_reason === 'refusal' || message?.stop_reason === 'max_tokens') return { skip: 'failed' };
  const text = (message?.content ?? []).filter(part => part?.type === 'text').map(part => part.text).join('');
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    return { skip: 'failed' };
  }
  if (!raw?.known || !Number.isInteger(raw.pages) || raw.pages < 1) return { skip: 'unknown' };
  const chapters = raw.confidence === 'low' ? [] : (raw.chapters ?? []).filter(ch => Number.isInteger(ch?.start) && ch.start >= 1 && ch.start <= raw.pages);
  const ordered = chapters.every((ch, i) => i === 0 || ch.start >= chapters[i - 1].start);
  try {
    const patch = cleanBookPatch({
      label,
      author: raw.author || undefined,
      edition: raw.edition || undefined,
      pages: raw.pages,
      ...(ordered && chapters.length ? { chapters } : {})
    });
    return { patch, confidence: raw.confidence };
  } catch {
    return { skip: 'failed' };
  }
}

/** Fills only blank fields, so anything Adam set or pasted is never replaced. */
export function mergeEstimated(current, patch, confidence, now) {
  const next = { ...(current ?? { label: patch.label }) };
  let changed = false;
  for (const field of ['author', 'edition', 'pages', 'chapters']) {
    const empty = next[field] === undefined || (Array.isArray(next[field]) && !next[field].length);
    if (empty && patch[field] !== undefined && patch[field] !== null && !(Array.isArray(patch[field]) && !patch[field].length)) {
      next[field] = patch[field];
      changed = true;
    }
  }
  if (!changed) return null;
  next.estimated = { by: 'claude', confidence, at: now };
  next.updated_at = now;
  return next;
}

/** Checks the batch; when it has ended, applies every result once and records the outcome. */
export async function checkFactsJob(store, { apiKey, fetchImpl = fetch, now = new Date().toISOString() } = {}) {
  const job = await getJSON(store, FACTS_JOB_KEY);
  if (!job || job.status !== 'running') return publicJob(job);
  if (!apiKey) throw failure('Book facts need the Anthropic key on the server.', 503, 'anthropic_unconfigured');
  let batch;
  try {
    const response = await fetchImpl(`${ANTHROPIC_ORIGIN}/v1/messages/batches/${encodeURIComponent(job.batchId)}`, { headers: headers(apiKey) });
    if (!response.ok) throw new Error(String(response.status));
    batch = await response.json();
  } catch {
    throw failure('Could not reach Claude to check the book facts.', 502, 'anthropic_unavailable');
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
    throw failure('Claude finished, but the results could not be downloaded. Try again.', 502, 'anthropic_unavailable');
  }
  const books = (await getJSON(store, BOOKS_KEY)) ?? {};
  const outcome = { filled: 0, unknown: [], failed: [], lowConfidence: [] };
  for (const raw of text.split('\n')) {
    if (!raw.trim()) continue;
    let line;
    try {
      line = JSON.parse(raw);
    } catch {
      continue;
    }
    const label = job.ids[line.custom_id];
    if (!label) continue;
    const result = factsFromResult(line, label);
    if (result.skip === 'unknown') { outcome.unknown.push(label); continue; }
    if (result.skip) { outcome.failed.push(label); continue; }
    const key = shelfBookKey(label);
    const next = mergeEstimated(books[key], result.patch, result.confidence, now);
    if (!next) continue;
    books[key] = next;
    outcome.filled += 1;
    if (result.confidence === 'low') outcome.lowConfidence.push(label);
  }
  await setJSON(store, BOOKS_KEY, books);
  const done = { ...job, status: 'done', finished_at: now, ...outcome };
  await setJSON(store, FACTS_JOB_KEY, done);
  return publicJob(done);
}
