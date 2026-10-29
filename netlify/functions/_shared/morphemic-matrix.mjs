/**
 * Morphemic matrices for the lesson word tray.
 *
 * A matrix is one base plus the prefixes and suffixes that attach to it, and
 * the established words they build. Each matrix is built once by the model and
 * kept in a shared library, so every lesson and every student reads the same
 * record and the same base never pays for a second call.
 *
 *   morphemic/matrices/<id>   the matrix (id is the base, lower case)
 *   morphemic/words/<word>    { matrix_id | null } for each word and phrase seen
 *
 * Nothing the model writes reaches a student unchecked. A word is kept only
 * when it spells exactly from its morphemes and the Australian English
 * dictionary (Hunspell en-AU) knows it. Meanings cannot be machine-checked, so
 * new matrices are marked `new` for the teacher to review.
 */
import dictionary from 'dictionary-en-au';
import nspell from 'nspell';
import { deleteKey, getJSON, listJSON, setJSON } from './teaching-blobs.mjs';
import { TextToolError } from './text-tool-error.mjs';

export const MATRIX_PREFIX = 'morphemic/matrices/';
export const MATRIX_WORD_PREFIX = 'morphemic/words/';
export const MAX_MATRIX_WORDS = 16;
/** Fewer real words than this is not worth a matrix. */
export const MIN_MATRIX_WORDS = 3;

const WORD_RE = /^[a-z][a-z' -]{0,58}[a-z]$/;

/** Lower case, single spaces, curly apostrophes straightened. Null for anything that is not a word or phrase. */
export function normaliseMatrixWord(value) {
  const word = String(value ?? '')
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
  return WORD_RE.test(word) ? word : null;
}

export function matrixKey(id) {
  return `${MATRIX_PREFIX}${encodeURIComponent(id)}`;
}

export function matrixWordKey(word) {
  return `${MATRIX_WORD_PREFIX}${encodeURIComponent(word)}`;
}

let speller = null;
/** The en-AU spellchecker, loaded once per function instance (about 70 ms). */
export function isDictionaryWord(word) {
  speller ??= nspell(dictionary);
  return speller.correct(word);
}

export const MORPHEMIC_SYSTEM = `You build morphemic matrices for secondary school English students. You are given one word or short phrase from a lesson text.

A morphemic matrix is one base (a free or bound base) plus the prefixes and suffixes that attach to it, and the established English words they build.

1. Choose the head word. For a single word, that is the word. For a phrase, pick the one word whose base has relatives worth building (in "critical attitudes", pick "critical").
2. Decide whether the head word has a matrix. It has one when its base, with real prefixes and suffixes, builds at least three established words. Everyday words with no prefix or suffix to add (glow, cat, the) have no matrix.
3. Build the matrix around the head word's base.

Rules that matter more than anything else.
- Every word must be an established English word that appears in a standard dictionary. Never invent, coin or guess a word. A shorter list of real words is right; a longer list with one doubtful word is wrong.
- Every word must spell exactly as prefix_1 + prefix_2 + base + suffix, joined with no letter added, dropped or changed. If a real word only forms with a spelling change at a join, leave it out.
- Use Australian spelling (criticise, colour, organisation).
- Meanings are plain classroom definitions a 13 year old understands, in one sentence, without using the word itself. Examples are short, original, everyday sentences.
- The source is the language and form the base comes from (Greek kritikos, Latin scribere). If you are unsure of the origin, leave source empty. Never invent an etymology.
- prefix_1 is an outer prefix that goes before prefix_2 (un- in un + ortho + dox). Most words use only prefix_2 or no prefix. A suffix may be a compound suffix written as one (-ically, -ation).
- Write prefixes with a trailing hyphen (un-, para-) and suffixes with a leading hyphen (-al, -ise). Use an empty string for an unused slot.
- Include the head word itself. At most ${MAX_MATRIX_WORDS} words.

Reply with JSON only, no prose and no code fence, in this shape.
{"head_word":"","has_matrix":true,"base":"","source":"","meaning":"","words":[{"word":"","prefix_1":"","prefix_2":"","suffix":"","definition":"","example":""}]}
When the head word has no matrix, reply {"head_word":"…","has_matrix":false}.`;

export function buildMorphemicRequest(word) {
  return {
    system: MORPHEMIC_SYSTEM,
    messages: [{ role: 'user', content: `<word>${word}</word>` }]
  };
}

function clip(value, max) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
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

const bare = (label) => label.replace(/-/g, '');
const affix = (value, side) => {
  const letters = clip(value, 20).toLowerCase().replace(/[^a-z]/g, '');
  if (!letters) return '';
  return side === 'prefix' ? `${letters}-` : `-${letters}`;
};

/**
 * Turn the model's reply into a matrix, keeping only words that spell from
 * their morphemes and that the dictionary knows. Returns
 * `{ head_word, matrix | null, dropped }`.
 */
export function parseMorphemicResult(raw, word, isWord = isDictionaryWord) {
  const parsed = firstJsonObject(String(raw ?? ''));
  if (!parsed || typeof parsed !== 'object') {
    throw new TextToolError('The morphemic matrix reply could not be read. Try again.');
  }
  const head = normaliseMatrixWord(parsed.head_word) ?? word;
  const base = clip(parsed.base, 30).toLowerCase().replace(/[^a-z]/g, '');
  if (parsed.has_matrix !== true || !base || !Array.isArray(parsed.words)) {
    return { head_word: head, matrix: null, dropped: [] };
  }

  const words = [];
  const dropped = [];
  const seen = new Set();
  for (const entry of parsed.words) {
    if (!entry || typeof entry !== 'object') continue;
    const candidate = normaliseMatrixWord(entry.word);
    if (!candidate || seen.has(candidate)) continue;
    seen.add(candidate);
    const p1 = affix(entry.prefix_1, 'prefix');
    const p2 = affix(entry.prefix_2, 'prefix');
    const suffix = affix(entry.suffix, 'suffix');
    const definition = clip(entry.definition, 300);
    const example = clip(entry.example, 240);
    const spelt = `${bare(p1)}${bare(p2)}${base}${bare(suffix)}`;
    if (spelt !== candidate) {
      dropped.push({ word: candidate, reason: 'does not spell from its morphemes' });
      continue;
    }
    if (!isWord(candidate)) {
      dropped.push({ word: candidate, reason: 'not in the Australian English dictionary' });
      continue;
    }
    if (!definition) {
      dropped.push({ word: candidate, reason: 'no meaning given' });
      continue;
    }
    words.push({ word: candidate, front: bare(p1), prefix: bare(p2), ending: bare(suffix), definition, example, labels: { front: p1, prefix: p2, ending: suffix } });
    if (words.length >= MAX_MATRIX_WORDS) break;
  }
  if (words.length < MIN_MATRIX_WORDS) return { head_word: head, matrix: null, dropped };
  // Two prefix rows only when some word stacks two prefixes (un + ortho + dox); otherwise one Prefix row.
  if (!words.some((entry) => entry.front && entry.prefix)) {
    for (const entry of words) {
      if (!entry.front) continue;
      entry.prefix = entry.front;
      entry.labels.prefix = entry.labels.front;
      entry.front = '';
      entry.labels.front = '';
    }
  }

  const slots = (name) => {
    const out = new Map();
    for (const entry of words) if (entry[name]) out.set(entry[name], { id: entry[name], label: entry.labels[name] });
    return [...out.values()];
  };
  return {
    head_word: head,
    dropped,
    matrix: {
      id: base,
      base,
      source: clip(parsed.source, 80),
      meaning: clip(parsed.meaning, 120),
      fronts: slots('front'),
      prefixes: slots('prefix'),
      endings: slots('ending'),
      words: words.map(({ labels: _labels, ...rest }) => rest)
    }
  };
}

function mergeSlots(a = [], b = []) {
  const out = new Map(a.map((slot) => [slot.id, slot]));
  for (const slot of b) if (!out.has(slot.id)) out.set(slot.id, slot);
  return [...out.values()];
}

/** The library record for a word, or `undefined` when the word has never been looked at. */
export async function lookupMatrixWord(store, word) {
  const index = await getJSON(store, matrixWordKey(word));
  if (!index || typeof index !== 'object') return undefined;
  if (!index.matrix_id) return { matrix: null };
  const matrix = await getJSON(store, matrixKey(index.matrix_id));
  return matrix ? { matrix } : undefined;
}

/**
 * Save a built matrix into the library. A base that already has a matrix gains
 * the new words rather than a duplicate, and goes back to `new` for review.
 * Every word in it, the head word and the asked-for phrase all point at it.
 */
export async function saveMatrixResult(store, word, result, { nowIso = () => new Date().toISOString(), model = '' } = {}) {
  const at = nowIso();
  if (!result.matrix) {
    await setJSON(store, matrixWordKey(word), { matrix_id: null, at });
    if (result.head_word && result.head_word !== word) {
      const existing = await getJSON(store, matrixWordKey(result.head_word));
      if (!existing) await setJSON(store, matrixWordKey(result.head_word), { matrix_id: null, at });
    }
    return null;
  }
  const incoming = result.matrix;
  const existing = await getJSON(store, matrixKey(incoming.id));
  let matrix;
  if (existing) {
    const known = new Set(existing.words.map((entry) => entry.word));
    const added = incoming.words.filter((entry) => !known.has(entry.word));
    matrix = added.length
      ? {
          ...existing,
          fronts: mergeSlots(existing.fronts, incoming.fronts),
          prefixes: mergeSlots(existing.prefixes, incoming.prefixes),
          endings: mergeSlots(existing.endings, incoming.endings),
          words: [...existing.words, ...added].slice(0, MAX_MATRIX_WORDS * 2),
          status: 'new',
          updated_at: at
        }
      : existing;
  } else {
    matrix = { ...incoming, status: 'new', built_from: result.head_word, model, built_at: at, updated_at: at };
  }
  if (matrix !== existing) await setJSON(store, matrixKey(matrix.id), matrix);
  const pointers = new Set([word, result.head_word, ...matrix.words.map((entry) => entry.word)].filter(Boolean));
  await Promise.all([...pointers].map((key) => setJSON(store, matrixWordKey(key), { matrix_id: matrix.id, at })));
  return matrix;
}

export async function listMatrices(store) {
  const records = await listJSON(store, MATRIX_PREFIX);
  return records
    .filter((record) => record && typeof record === 'object' && typeof record.id === 'string')
    .sort((a, b) => (a.status === b.status ? a.base.localeCompare(b.base) : a.status === 'new' ? -1 : 1));
}

/**
 * Teacher edits from the review list: meanings, examples, removed words and
 * the reviewed tick. Words can only be removed or reworded here, never added,
 * so the dictionary check still holds for everything students see.
 */
export async function updateMatrix(store, id, patch, nowIso = () => new Date().toISOString()) {
  const matrix = await getJSON(store, matrixKey(id));
  if (!matrix) return null;
  const edits = new Map(
    (Array.isArray(patch?.words) ? patch.words : [])
      .filter((entry) => entry && typeof entry.word === 'string')
      .map((entry) => [entry.word, entry])
  );
  const keep = Array.isArray(patch?.words)
    ? matrix.words.filter((entry) => edits.has(entry.word))
    : matrix.words;
  const words = keep.map((entry) => {
    const edit = edits.get(entry.word);
    if (!edit) return entry;
    return {
      ...entry,
      definition: clip(edit.definition, 300) || entry.definition,
      example: typeof edit.example === 'string' ? clip(edit.example, 240) : entry.example
    };
  });
  const removed = matrix.words.filter((entry) => !words.some((kept) => kept.word === entry.word));
  const used = (name) => new Set(words.map((entry) => entry[name]).filter(Boolean));
  const next = {
    ...matrix,
    words,
    fronts: matrix.fronts.filter((slot) => used('front').has(slot.id)),
    prefixes: matrix.prefixes.filter((slot) => used('prefix').has(slot.id)),
    endings: matrix.endings.filter((slot) => used('ending').has(slot.id)),
    meaning: typeof patch?.meaning === 'string' ? clip(patch.meaning, 120) : matrix.meaning,
    status: patch?.status === 'checked' ? 'checked' : patch?.status === 'new' ? 'new' : matrix.status,
    updated_at: nowIso()
  };
  await setJSON(store, matrixKey(id), next);
  // A removed word no longer opens this matrix; it is never offered again.
  await Promise.all(removed.map((entry) => setJSON(store, matrixWordKey(entry.word), { matrix_id: null, at: next.updated_at })));
  return next;
}

/** Remove a matrix and its word pointers, so the next request builds it fresh. */
export async function deleteMatrix(store, id) {
  const matrix = await getJSON(store, matrixKey(id));
  if (!matrix) return false;
  await Promise.all(matrix.words.map((entry) => deleteKey(store, matrixWordKey(entry.word))));
  if (matrix.built_from) await deleteKey(store, matrixWordKey(matrix.built_from));
  await deleteKey(store, matrixKey(id));
  return true;
}
