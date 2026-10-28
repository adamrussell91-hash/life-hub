/**
 * The Question Book: a private notebook of reflection questions, for the operator only.
 *
 *   question-book/v1/index                       { chapters: { [chapterId]: { answered, updatedAt } } }
 *   question-book/v1/chapters/{chapter}          { answers: { [questionId]: { value, updatedAt } }, updatedAt }
 *   question-book/v1/history/{chapter}/{question} { versions: [{ value, updatedAt }] }  newest first, last 20
 *   question-book/v1/notes/{chapter}             { notes: [{ id, at, observation, question, answered }] }  newest first
 *   question-book/v1/own                         { own: [{ id, question, answer, updatedAt, history }], updatedAt }
 *
 * The question texts never enter public code: they are read from the private data repository
 * (data/tasks/question-book/questions.json in life-hub-data) and cached in memory for ten
 * minutes. Nothing here calls a model except notice(), which runs only when asked.
 */
import { CHAPTERS, CHARTS, GROUPS, OWN_CHAPTER, PRIVATE_QUESTIONS_PATH, RULES, chapter as catalogueChapter } from '../../../packages/question-book/catalogue.mjs';
import { LONG_TEXT, RESPONSE_TYPES, describeAnswer, isAnswered, normalizeAnswer } from '../../../packages/question-book/answers.mjs';
import { readPrivateJsonFile } from './private-data-file.mjs';
import { reject } from './question-drop.mjs';
import { AnthropicClientError, DEFAULT_MODEL, completeMessage } from './anthropic-client.mjs';

const STRONG = { type: 'json', consistency: 'strong' };
const PREFIX = 'question-book/v1';
export const KEYS = Object.freeze({
  index: `${PREFIX}/index`,
  chapter: (id) => `${PREFIX}/chapters/${id}`,
  history: (chapterId, questionId) => `${PREFIX}/history/${chapterId}/${questionId}`,
  notes: (id) => `${PREFIX}/notes/${id}`,
  own: `${PREFIX}/own`
});

export const CACHE_MS = 10 * 60 * 1000;
/** Edits within this gap overwrite in place; a later edit keeps the earlier answer as a version. */
export const VERSION_GAP_MS = 10 * 60 * 1000;
export const MAX_VERSIONS = 20;
export const MAX_NOTES = 20;
export const MAX_OWN = 60;
export const MIN_NOTICE_ANSWERS = 3;
export const NOTICE_MAX_TOKENS = 400;
export const NOTICE_COST = 'about 3 cents';
const OWN_QUESTION_MAX = 1000;
const PROMPT_ANSWER_MAX = 1500;

const publicChapter = (ch) => ({ id: ch.id, title: ch.title, group: ch.group, order: ch.order, kind: ch.kind, when: ch.when });

/* ------------------------------------------------------------------ the private questions */

/** Check and index the private questions file. Unknown chapters are skipped. */
export function indexQuestions(file) {
  if (!file || typeof file !== 'object' || !Array.isArray(file.questions)) reject(500, 'corrupt', 'The private questions file couldn’t be read.');
  const byChapter = new Map();
  const byId = new Map();
  for (const q of file.questions) {
    const ok = q && typeof q.id === 'string' && typeof q.chapter === 'string' && typeof q.prompt === 'string'
      && q.response && RESPONSE_TYPES.includes(q.response.type) && (q.parts === undefined || Array.isArray(q.parts));
    if (!ok) reject(500, 'corrupt', 'The private questions file couldn’t be read.');
    const ch = catalogueChapter(q.chapter);
    if (!ch || ch.kind !== 'questions') continue;
    const question = { ...q, parts: q.parts ?? [] };
    byId.set(q.id, question);
    if (!byChapter.has(q.chapter)) byChapter.set(q.chapter, []);
    byChapter.get(q.chapter).push(question);
  }
  const charts = {};
  for (const c of CHARTS) {
    const fromFile = file.charts?.[c.id];
    charts[c.id] = fromFile && fromFile.family === c.family && fromFile.structure ? { title: fromFile.title ?? c.title, family: c.family, structure: fromFile.structure } : { title: c.title, family: c.family, structure: c.structure };
  }
  return { byChapter, byId, charts };
}

/** A loader for the private file with a ten-minute memory cache (one per handler). */
export function createQuestionSource({ env = process.env, fetchImpl = fetch, now = Date.now, ttlMs = CACHE_MS } = {}) {
  let cached = null;
  let at = 0;
  return async function load() {
    if (cached && now() - at < ttlMs) return cached;
    const file = await readPrivateJsonFile(PRIVATE_QUESTIONS_PATH, { env, fetchImpl, label: 'private questions file' });
    cached = indexQuestions(file);
    at = now();
    return cached;
  };
}

const chartsFor = (source, chapterId) => Object.fromEntries(CHARTS.filter((c) => c.chapter === chapterId).map((c) => [c.id, source.charts[c.id]]));
const chartOf = (source, question) => (question.response.type === 'chart' ? source.charts[question.response.chart] ?? null : null);

/* ------------------------------------------------------------------ the store */

async function readDoc(store, key) {
  const row = await store.getWithMetadata(key, STRONG);
  return { data: row?.data ?? null, etag: row?.etag ?? null };
}

/** Read, change and write one document, retrying twice if another tab wrote in between. */
async function mutate(store, key, change) {
  for (let i = 0; i < 3; i += 1) {
    const { data, etag } = await readDoc(store, key);
    const next = change(data ? structuredClone(data) : null);
    const written = await store.setJSON(key, next, etag ? { onlyIfMatch: etag } : { onlyIfNew: true });
    if (written?.modified !== false) return next;
  }
  return reject(409, 'changed', 'This changed in another tab. Reload to see it.');
}

const iso = (now) => new Date(now()).toISOString();

function requireChapter(id, kinds = ['questions', 'rules', 'own']) {
  const ch = typeof id === 'string' ? catalogueChapter(id) : null;
  if (!ch) reject(404, 'not_found', 'That chapter isn’t in the book.');
  if (!kinds.includes(ch.kind)) reject(400, 'bad_request', 'That chapter can’t take this.');
  return ch;
}

const ownAnswered = (own) => own.filter((entry) => entry.answer).length;

/* ------------------------------------------------------------------ reads */

/** Every group and chapter, with how many questions each has and how many are answered. */
export async function listChapters(store, loadSource) {
  const [source, { data: index }, { data: ownDoc }] = await Promise.all([loadSource(), readDoc(store, KEYS.index), readDoc(store, KEYS.own)]);
  const own = ownDoc?.own ?? [];
  const chapters = CHAPTERS.map((ch) => {
    const row = index?.chapters?.[ch.id];
    if (ch.kind === 'own') return { ...publicChapter(ch), total: own.length, answered: ownAnswered(own), updatedAt: ownDoc?.updatedAt ?? null };
    if (ch.kind === 'rules') return { ...publicChapter(ch), total: 0, answered: 0, updatedAt: null };
    return { ...publicChapter(ch), total: source.byChapter.get(ch.id)?.length ?? 0, answered: row?.answered ?? 0, updatedAt: row?.updatedAt ?? null };
  });
  return { groups: GROUPS.map((g) => ({ ...g })), chapters };
}

/** One chapter: its questions, charts, saved answers and past Notice results. */
export async function readChapter(store, loadSource, chapterId) {
  const ch = requireChapter(chapterId);
  const { data: notesDoc } = await readDoc(store, KEYS.notes(ch.id));
  const base = { chapter: publicChapter(ch), questions: [], charts: {}, answers: {}, notes: notesDoc?.notes ?? [] };
  if (ch.kind === 'rules') return { ...base, rules: RULES.map((r) => ({ ...r })) };
  if (ch.kind === 'own') {
    const { data: ownDoc } = await readDoc(store, KEYS.own);
    return { ...base, own: ownDoc?.own ?? [] };
  }
  const [source, { data: doc }] = await Promise.all([loadSource(), readDoc(store, KEYS.chapter(ch.id))]);
  return { ...base, questions: source.byChapter.get(ch.id) ?? [], charts: chartsFor(source, ch.id), answers: doc?.answers ?? {} };
}

/** One question's earlier versions, newest first. */
export async function readHistory(store, loadSource, chapterId, questionId) {
  const ch = requireChapter(chapterId, ['questions']);
  const source = await loadSource();
  const question = source.byId.get(questionId);
  if (!question || question.chapter !== ch.id) reject(404, 'not_found', 'That question isn’t in this chapter.');
  const { data } = await readDoc(store, KEYS.history(ch.id, question.id));
  return { question: question.id, versions: data?.versions ?? [] };
}

/* ------------------------------------------------------------------ writes */

/** Save (or with value null, clear) one answer, keeping the earlier one as a version. */
export async function saveAnswer(store, loadSource, body, { now = Date.now } = {}) {
  const ch = requireChapter(body?.chapter, ['questions']);
  const source = await loadSource();
  const question = typeof body.question === 'string' ? source.byId.get(body.question) : null;
  if (!question || question.chapter !== ch.id) reject(404, 'not_found', 'That question isn’t in this chapter.');
  if (!('value' in body)) reject(400, 'bad_request', 'Send a value, or null to clear the answer.');
  const value = normalizeAnswer(question, body.value, chartOf(source, question));
  const updatedAt = iso(now);
  let previous = null;
  const doc = await mutate(store, KEYS.chapter(ch.id), (current) => {
    const next = current ?? { answers: {} };
    previous = next.answers[question.id] ?? null;
    if (value === null) delete next.answers[question.id];
    else next.answers[question.id] = { value, updatedAt };
    next.updatedAt = updatedAt;
    return next;
  });
  const changed = previous && JSON.stringify(previous.value) !== JSON.stringify(value);
  const stale = previous && (value === null || now() - Date.parse(previous.updatedAt) >= VERSION_GAP_MS);
  if (changed && stale) {
    await mutate(store, KEYS.history(ch.id, question.id), (current) => ({ versions: [previous, ...(current?.versions ?? [])].slice(0, MAX_VERSIONS) }));
  }
  const questions = source.byChapter.get(ch.id) ?? [];
  const answered = questions.filter((q) => doc.answers[q.id] && isAnswered(q, doc.answers[q.id].value)).length;
  await mutate(store, KEYS.index, (current) => {
    const next = current ?? { chapters: {} };
    next.chapters[ch.id] = { answered, updatedAt };
    return next;
  });
  return { question: question.id, answer: value === null ? null : { value, updatedAt }, answered, total: questions.length };
}

const ownText = (value, max, what) => {
  if (value === null || value === undefined) return '';
  if (typeof value !== 'string') reject(400, 'bad_answer', `${what} must be text.`);
  const out = value.trim();
  if (out.length > max) reject(400, 'bad_answer', `${what} is too long (${max} characters at most).`);
  return out;
};

/** Replace your own questions and answers; an entry edited later keeps its earlier wording. */
export async function saveOwn(store, body, { now = Date.now } = {}) {
  requireChapter(body?.chapter, ['own']);
  if (!Array.isArray(body.own)) reject(400, 'bad_request', 'Send your questions as a list.');
  if (body.own.length > MAX_OWN) reject(400, 'bad_answer', `Keep it to ${MAX_OWN} questions.`);
  const seen = new Set();
  const incoming = [];
  for (const entry of body.own) {
    if (!entry || typeof entry !== 'object') reject(400, 'bad_answer', 'Each entry has a question and an answer.');
    if (typeof entry.id !== 'string' || !/^[a-z0-9_-]{1,40}$/i.test(entry.id) || seen.has(entry.id)) reject(400, 'bad_answer', 'Each entry needs its own id.');
    seen.add(entry.id);
    const question = ownText(entry.question, OWN_QUESTION_MAX, 'A question');
    const answer = ownText(entry.answer, LONG_TEXT, 'An answer');
    if (question || answer) incoming.push({ id: entry.id, question, answer });
  }
  const updatedAt = iso(now);
  const doc = await mutate(store, KEYS.own, (current) => {
    const before = new Map((current?.own ?? []).map((entry) => [entry.id, entry]));
    const own = incoming.map((entry) => {
      const old = before.get(entry.id);
      if (!old) return { ...entry, updatedAt, history: [] };
      if (old.question === entry.question && old.answer === entry.answer) return old;
      const keep = now() - Date.parse(old.updatedAt) >= VERSION_GAP_MS;
      const history = keep ? [{ question: old.question, answer: old.answer, updatedAt: old.updatedAt }, ...(old.history ?? [])].slice(0, MAX_VERSIONS) : old.history ?? [];
      return { ...entry, updatedAt, history };
    });
    return { own, updatedAt };
  });
  return { own: doc.own, answered: ownAnswered(doc.own), total: doc.own.length };
}

/* ------------------------------------------------------------------ Notice a pattern */

export const NOTICE_SYSTEM = [
  'You read one chapter of a private reflection notebook: the questions its writer chose to answer, with their answers.',
  'Offer one short observation across the answers: a pattern, a tension or a surprise. Write in plain, warm words, speaking to the writer as "you".',
  'Describe what they do, value and reach for, in terms of what is there. No personality types, scores, labels, diagnoses or advice.',
  'Begin with the observation itself. Never open by talking about the question, the answers or this task.',
  'Then ask one follow-up question that invites them one step further. Keep the observation under 70 words and the question under 25.',
  'Reply with JSON only: {"observation": "...", "question": "..."}'
].join('\n');

const clip = (text, max) => (text.length > max ? `${text.slice(0, max)}…` : text);

/** The model's brief: only this chapter's answered questions and their answers. */
export function noticeBrief(ch, items) {
  const lines = [`Chapter: ${ch.title}`, ''];
  items.forEach(({ prompt, answer }, i) => {
    lines.push(`${i + 1}. ${prompt}`, `Answer: ${clip(answer, PROMPT_ANSWER_MAX)}`, '');
  });
  return lines.join('\n').trim();
}

function parseNotice(text) {
  const match = /\{[\s\S]*\}/.exec(String(text ?? ''));
  let parsed = null;
  try {
    parsed = match ? JSON.parse(match[0]) : null;
  } catch {
    parsed = null;
  }
  const observation = typeof parsed?.observation === 'string' ? parsed.observation.trim() : '';
  const question = typeof parsed?.question === 'string' ? parsed.question.trim() : '';
  if (!observation || !question) reject(502, 'model_failed', 'Nothing came back just now. Try again.');
  return { observation: clip(observation, 1200), question: clip(question, 400) };
}

/** One Sonnet call over a chapter's answers; the result is saved to the chapter's notes. */
export async function notice(store, loadSource, body, { env = process.env, now = Date.now, complete = completeMessage, modelFetch, newId = () => crypto.randomUUID() } = {}) {
  const ch = requireChapter(body?.chapter, ['questions', 'own']);
  let items;
  if (ch.kind === 'own') {
    const { data } = await readDoc(store, KEYS.own);
    items = (data?.own ?? []).filter((entry) => entry.question && entry.answer).map((entry) => ({ prompt: entry.question, answer: entry.answer }));
  } else {
    const [source, { data: doc }] = await Promise.all([loadSource(), readDoc(store, KEYS.chapter(ch.id))]);
    items = (source.byChapter.get(ch.id) ?? [])
      .filter((q) => doc?.answers?.[q.id] && isAnswered(q, doc.answers[q.id].value))
      .map((q) => ({ prompt: q.prompt, answer: describeAnswer(q, doc.answers[q.id].value, chartOf(source, q)) }))
      .filter((item) => item.answer);
  }
  if (items.length < MIN_NOTICE_ANSWERS) reject(400, 'too_few', `Answer at least ${MIN_NOTICE_ANSWERS} questions in this chapter first.`);
  const apiKey = env?.ANTHROPIC_API_KEY;
  if (typeof apiKey !== 'string' || !apiKey) reject(503, 'no_key', 'Notice a pattern isn’t set up on this server.');
  let text;
  try {
    text = await complete({
      apiKey,
      ...(modelFetch ? { fetchImpl: modelFetch } : {}),
      model: DEFAULT_MODEL,
      maxTokens: NOTICE_MAX_TOKENS,
      system: NOTICE_SYSTEM,
      messages: [{ role: 'user', content: noticeBrief(ch, items) }]
    });
  } catch (e) {
    if (e instanceof AnthropicClientError || e?.name === 'AnthropicClientError') reject(502, 'model_failed', 'Nothing came back just now. Try again.');
    throw e;
  }
  const note = { id: newId(), at: iso(now), ...parseNotice(text), answered: items.length };
  const doc = await mutate(store, KEYS.notes(ch.id), (current) => ({ notes: [note, ...(current?.notes ?? [])].slice(0, MAX_NOTES) }));
  return { note, notes: doc.notes, cost: NOTICE_COST };
}
