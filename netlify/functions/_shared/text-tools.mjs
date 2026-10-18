/**
 * Teaching Hub text tools on rich text blocks.
 *
 *   dictionary  Finds the challenging words in a block and writes a short
 *               dictionary card for each (teacher and students).
 *   fry         Rewrites a block as a Fry explainer (teacher only).
 *   techniques  Finds the Periodic Table techniques a passage uses, for the
 *               teacher to approve (see technique-scan.mjs).
 *
 * The live deploy cuts synchronous functions off at about ten seconds, which
 * is shorter than either model call. So a request starts a job record keyed by
 * a hash of the tool and the text, a background function runs it, and the page
 * polls the record. The same text never pays for a second model call: the job
 * record is the cache.
 */
import { createHash } from 'node:crypto';
import { completeMessage as defaultCompleteMessage } from './anthropic-client.mjs';
import { buildFryExplainerSystem } from './fry-explainer-prompt.mjs';
import {
  MAX_TECHNIQUE_SCAN_CHARS,
  parseTechniqueResult,
  requestTechniqueScan as defaultRequestTechniqueScan
} from './technique-scan.mjs';
import { getJSON, setJSON } from './teaching-blobs.mjs';
import { sanitizeRichTextHtml } from './teaching-student.mjs';
import { TextToolError } from './text-tool-error.mjs';

export { TextToolError };

export const TEXT_TOOLS = ['dictionary', 'fry', 'techniques'];
export const TEXT_TOOL_PREFIX = 'text_tools/';
/** Bump when a prompt changes so old cached results are not served. */
export const TEXT_TOOL_VERSION = 4;
export const MAX_TEXT_TOOL_CHARS = 12_000;
export const MAX_DICTIONARY_WORDS = 40;
/** A job still "working" after this long is treated as dead and may restart. */
export const TEXT_TOOL_STALE_MS = 3 * 60_000;
/** After a failure, wait this long before another model call on the same text. */
export const TEXT_TOOL_ERROR_COOLDOWN_MS = 60_000;

const DEFAULT_MODELS = {
  dictionary: 'claude-haiku-4-5',
  fry: 'claude-sonnet-5',
  techniques: 'gpt-4o'
};
const MODEL_ENV = {
  dictionary: 'TEXT_TOOLS_DICTIONARY_MODEL',
  fry: 'TEXT_TOOLS_FRY_MODEL',
  techniques: 'TEXT_TOOLS_TECHNIQUES_MODEL'
};
const MAX_TOKENS = { dictionary: 4096, fry: 4096 };
const KEY_RE = /^[a-f0-9]{64}$/;

export function isTextTool(tool) {
  return TEXT_TOOLS.includes(tool);
}

export function isTextToolKey(key) {
  return typeof key === 'string' && KEY_RE.test(key);
}

export function textToolJobKey(key) {
  return `${TEXT_TOOL_PREFIX}${key}`;
}

export function textToolModel(tool, env = {}) {
  const override = env[MODEL_ENV[tool]];
  return typeof override === 'string' && override.trim() ? override.trim() : DEFAULT_MODELS[tool];
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', mdash: '—', ndash: '–', hellip: '…' };

/** Readable plain text from block HTML: one line per paragraph or list item. */
export function richTextToPlain(html) {
  if (typeof html !== 'string') return '';
  return html
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|li|blockquote|div|h[1-6])>/gi, '\n')
    .replace(/<li\b[^>]*>/gi, '- ')
    .replace(/<[^>]+>/g, '')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (match, name) => ENTITIES[name.toLowerCase()] ?? match)
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Stable cache key: same tool, model and text always lands on the same record. */
export function textToolKey(tool, text, env = {}) {
  return createHash('sha256')
    .update(JSON.stringify({ v: TEXT_TOOL_VERSION, tool, model: textToolModel(tool, env), text }))
    .digest('hex');
}

export function textToolInputError(tool, text) {
  if (!isTextTool(tool)) return 'Unknown text tool.';
  if (!text) return 'This block has no text yet.';
  if (text.length > MAX_TEXT_TOOL_CHARS) {
    return `This block is too long for one pass (${text.length} characters, limit ${MAX_TEXT_TOOL_CHARS}). Split it into smaller blocks.`;
  }
  if (tool === 'techniques' && text.length > MAX_TECHNIQUE_SCAN_CHARS) {
    return `This block is too long for a technique scan (${text.length} characters, limit ${MAX_TECHNIQUE_SCAN_CHARS}). Split it into smaller blocks.`;
  }
  if (tool === 'fry' && countWords(text) < 25) {
    return 'There is not enough here to build an explainer from. Write the key ideas first, at least a few sentences.';
  }
  return null;
}

/** What the client sees. Never echoes the stored source text back. */
export function publicJobView(key, job) {
  if (!job) return { key, status: 'missing' };
  if (job.status === 'done') return { key, status: 'done', tool: job.tool, result: job.result };
  if (job.status === 'error') return { key, status: 'error', tool: job.tool, error: job.error };
  return { key, status: 'working', tool: job.tool };
}

/**
 * Find or create the job for this text. Returns `{ job, kick }`: `kick` is true
 * when the caller must start the background run.
 */
export async function startTextToolJob({ store, env = {}, tool, text, now = Date.now }) {
  const key = textToolKey(tool, text, env);
  const jobKey = textToolJobKey(key);
  const existing = await getJSON(store, jobKey, { consistency: 'strong' });
  const at = now();
  if (existing?.status === 'done') return { key, job: existing, kick: false };
  if (existing?.status === 'working' && at - Date.parse(existing.updated_at) < TEXT_TOOL_STALE_MS) {
    return { key, job: existing, kick: false };
  }
  if (existing?.status === 'error' && at - Date.parse(existing.updated_at) < TEXT_TOOL_ERROR_COOLDOWN_MS) {
    return { key, job: existing, kick: false };
  }
  const job = {
    key,
    tool,
    text,
    status: 'working',
    attempts: (Number(existing?.attempts) || 0) + 1,
    created_at: existing?.created_at ?? new Date(at).toISOString(),
    updated_at: new Date(at).toISOString()
  };
  await setJSON(store, jobKey, job);
  return { key, job, kick: true };
}

export async function readTextToolJob(store, key) {
  if (!isTextToolKey(key)) return null;
  return getJSON(store, textToolJobKey(key), { consistency: 'strong' });
}

/** Fire the background run. A 202 means Netlify accepted it. */
export async function kickTextToolRun(request, runPath, key, fetchImpl = fetch) {
  try {
    const response = await fetchImpl(new URL(runPath, request.url), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(request.headers.get('cookie') ? { cookie: request.headers.get('cookie') } : {}),
        ...(request.headers.get('origin') ? { origin: request.headers.get('origin') } : {})
      },
      body: JSON.stringify({ key }),
      signal: AbortSignal.timeout(5_000)
    });
    return response.status === 202 || response.ok;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------- dictionary

export const DICTIONARY_SYSTEM = `You are the dictionary helper in a school lesson. A student is reading the text you are given. Pick out the words a secondary school student is likely to find challenging, and write a short dictionary card for each.

A word is challenging when one or more of these is true.
- technical: subject-specific or academic vocabulary (photosynthesis, juxtaposition, hypothesis).
- uncommon: low-frequency words most students rarely meet (ubiquitous, recalcitrant, ephemeral).
- foreign: words or phrases borrowed from another language and still felt as foreign (zeitgeist, in medias res, schadenfreude).
- archaic: old-fashioned or literary forms (whence, thou, betwixt).
- long: long multi-syllable words that are hard to decode, even if they are not rare (indistinguishable, disproportionately).
- idiom: a fixed phrase whose meaning is not the sum of its words (a pyrrhic victory).

Do not pick everyday words, even long ones (beautiful, understanding, everything), names of people or places unless they are used as a concept, or words the text itself defines in the same sentence.

For each word give
- word: exactly as it appears in the text, same spelling and case as its first appearance. Phrases are fine when the meaning lives in the phrase.
- kind: one of technical, uncommon, foreign, archaic, long, idiom.
- part_of_speech: noun, verb, adjective, adverb, phrase and so on.
- pronunciation: a simple respelling a student can read aloud, stressed syllable in capitals (ef-EM-er-ul). No IPA.
- definition: the meaning in this text, in one plain sentence a 13 year old understands. Do not use the word itself in the definition.
- etymology: where the word comes from, in one sentence (from Greek ephemeros, lasting a day). Leave it empty when the origin is unknown. Never invent one.
- example: one short everyday sentence using the word in the same sense, different from the text.

Use Australian spelling. Pick at most ${MAX_DICTIONARY_WORDS} words, in the order they first appear. If nothing in the text is challenging, return an empty list.

Reply with JSON only, no prose and no code fence, in this shape.
{"words":[{"word":"","kind":"","part_of_speech":"","pronunciation":"","definition":"","etymology":"","example":""}]}`;

const DICTIONARY_KINDS = new Set(['technical', 'uncommon', 'foreign', 'archaic', 'long', 'idiom']);

function clip(value, max) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** The word occurs in the text as a whole word (phrases may wrap across spaces). */
export function wordAppearsIn(text, word) {
  const pattern = escapeRegExp(word).replace(/\s+/g, '\\s+');
  return new RegExp(`(?<![\\p{L}\\p{N}])${pattern}(?![\\p{L}\\p{N}])`, 'iu').test(text);
}

function firstJsonObject(raw) {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
}

/** Keep only well-formed cards for words that really are in the text. */
export function parseDictionaryResult(raw, text) {
  const parsed = firstJsonObject(String(raw ?? ''));
  if (!parsed || !Array.isArray(parsed.words)) {
    throw new TextToolError('The dictionary reply could not be read. Try again.');
  }
  const seen = new Set();
  const words = [];
  for (const entry of parsed.words) {
    if (!entry || typeof entry !== 'object') continue;
    const word = clip(entry.word, 60);
    const definition = clip(entry.definition, 400);
    if (!word || !definition) continue;
    const id = word.toLowerCase();
    if (seen.has(id) || !wordAppearsIn(text, word)) continue;
    seen.add(id);
    const kind = clip(entry.kind, 20).toLowerCase();
    words.push({
      word,
      kind: DICTIONARY_KINDS.has(kind) ? kind : 'uncommon',
      part_of_speech: clip(entry.part_of_speech, 40),
      pronunciation: clip(entry.pronunciation, 80),
      definition,
      etymology: clip(entry.etymology, 400),
      example: clip(entry.example, 240)
    });
    if (words.length >= MAX_DICTIONARY_WORDS) break;
  }
  return { words };
}

// ----------------------------------------------------------------------- fry

const FRY_ALLOWED_TAGS = new Set(['p', 'br', 'strong', 'em', 'ul', 'ol', 'li', 'blockquote']);

/** Strip anything outside the rich text block's tag set, and every attribute. */
export function cleanFryHtml(html) {
  return sanitizeRichTextHtml(String(html ?? ''))
    .replace(/<\/?([a-z][a-z0-9]*)\b[^>]*>/gi, (tag, name) => {
      const lower = name.toLowerCase();
      if (!FRY_ALLOWED_TAGS.has(lower)) return '';
      return tag.startsWith('</') ? `</${lower}>` : lower === 'br' ? '<br>' : `<${lower}>`;
    })
    .replace(/\s*\n\s*/g, '')
    .trim();
}

export function parseFryResult(raw) {
  const text = String(raw ?? '');
  const explainer = text.match(/<explainer>([\s\S]*?)(?:<\/explainer>|$)/i);
  const html = explainer ? cleanFryHtml(explainer[1]) : '';
  if (!html || !/<p>/.test(html)) {
    throw new TextToolError('The explainer came back empty. Try again.');
  }
  return { html };
}

// ----------------------------------------------------------------------- run

export function countWords(text) {
  return String(text ?? '').split(/\s+/).filter(Boolean).length;
}

/**
 * The rewrite keeps roughly the source's length. Very short blocks get a
 * little headroom, since the moves need a sentence each to exist at all.
 */
export function fryLengthBudget(text) {
  const words = countWords(text);
  return {
    words,
    min: Math.round(words * 0.85),
    max: Math.max(Math.round(words * 1.25), words + 100)
  };
}

export function buildTextToolRequest(tool, text) {
  if (tool === 'fry') {
    const budget = fryLengthBudget(text);
    return {
      system: buildFryExplainerSystem(),
      messages: [{
        role: 'user',
        content: `Here is the text block to rewrite. It is ${budget.words} words. Aim for about ${budget.words} words and stay between ${budget.min} and ${budget.max}.\n\n<block>\n${text}\n</block>`
      }]
    };
  }
  return {
    system: DICTIONARY_SYSTEM,
    messages: [{ role: 'user', content: `<text>\n${text}\n</text>` }]
  };
}

/**
 * Run one job to completion and write the outcome onto its record. Safe to
 * call twice: a finished record is left alone.
 */
export async function runTextToolJob({
  store,
  env = {},
  key,
  completeMessage = defaultCompleteMessage,
  requestTechniqueScan = defaultRequestTechniqueScan,
  nowIso = () => new Date().toISOString()
}) {
  const job = await readTextToolJob(store, key);
  if (!job) return null;
  if (job.status !== 'working') return job;

  let next;
  if (job.tool === 'techniques') {
    try {
      const raw = await requestTechniqueScan({
        env,
        text: job.text,
        model: textToolModel(job.tool, env),
        signal: AbortSignal.timeout(120_000)
      });
      next = { ...job, status: 'done', result: parseTechniqueResult(raw, job.text) };
    } catch (error) {
      next = {
        ...job,
        status: 'error',
        error: error instanceof TextToolError ? error.message : 'The AI service did not answer. Try again in a minute.'
      };
    }
  } else if (!env.ANTHROPIC_API_KEY) {
    next = { ...job, status: 'error', error: 'The AI service is not configured (ANTHROPIC_API_KEY).' };
  } else {
    try {
      const { system, messages } = buildTextToolRequest(job.tool, job.text);
      const raw = await completeMessage({
        apiKey: env.ANTHROPIC_API_KEY,
        model: textToolModel(job.tool, env),
        maxTokens: MAX_TOKENS[job.tool],
        system,
        messages,
        signal: AbortSignal.timeout(120_000)
      });
      const result = job.tool === 'fry' ? parseFryResult(raw) : parseDictionaryResult(raw, job.text);
      next = { ...job, status: 'done', result };
    } catch (error) {
      next = {
        ...job,
        status: 'error',
        error: error instanceof TextToolError ? error.message : 'The AI service did not answer. Try again in a minute.'
      };
    }
  }
  next.updated_at = nowIso();
  await setJSON(store, textToolJobKey(key), next);
  return next;
}
