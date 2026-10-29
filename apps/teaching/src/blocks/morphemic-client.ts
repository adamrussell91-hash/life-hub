/**
 * Morphemic matrices from the shared library (netlify/functions/_shared/morphemic-matrix.mjs).
 *
 * The built-in matrices answer first and cost nothing. Any other word asks the
 * server, which answers from the library or builds the matrix once for
 * everyone; a build takes a few seconds, so the call polls until it is done.
 * Answers are kept for the page's life so a word is only ever asked once.
 */
import { apiGet, apiPost } from '@/api/client';
import { findMorphology, type MorphologyFamily } from '@/blocks/morphology';
import { pollTextToolJob, type PollOptions } from '@/blocks/text-tools-client';

type MatrixJob = {
  key: string;
  status: 'working' | 'done' | 'error' | 'missing';
  result?: { matrix?: unknown };
  error?: string;
};

/** Where the word was tapped: the teacher's own lesson, or a published one a student is reading. */
export type MatrixSource = { kind: 'teacher' } | { kind: 'student'; lessonId: string; blockId: string };

export type MatrixStatus = 'ready' | 'building' | 'none';

const WORD_RE = /^[a-z][a-z' -]{0,58}[a-z]$/;

export function normaliseMatrixWord(value: string): string | null {
  const word = value.toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim();
  return WORD_RE.test(word) ? word : null;
}

function text(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function slots(value: unknown): MorphologyFamily['fronts'] {
  if (!Array.isArray(value)) return [];
  return value
    .map((slot) => ({ id: text((slot as { id?: unknown })?.id, 20), label: text((slot as { label?: unknown })?.label, 24) }))
    .filter((slot) => slot.id && slot.label);
}

/** A matrix from the server in the shape the matrix view reads, or null when it is malformed. */
export function readMatrix(value: unknown): MorphologyFamily | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const base = text(raw.base, 30);
  const words = Array.isArray(raw.words)
    ? raw.words
        .map((entry) => {
          const item = (entry ?? {}) as Record<string, unknown>;
          return {
            word: text(item.word, 60),
            front: text(item.front, 20),
            prefix: text(item.prefix, 20),
            ending: text(item.ending, 20),
            definition: text(item.definition, 300),
            example: text(item.example, 240)
          };
        })
        .filter((entry) => entry.word && entry.definition)
    : [];
  if (!base || words.length === 0) return null;
  return {
    id: text(raw.id, 40) || base,
    base,
    source: text(raw.source, 80),
    meaning: text(raw.meaning, 120),
    fronts: slots(raw.fronts),
    prefixes: slots(raw.prefixes),
    endings: slots(raw.endings),
    words
  };
}

const answers = new Map<string, Promise<MorphologyFamily | null>>();

function start(word: string, source: MatrixSource, signal?: AbortSignal): Promise<MatrixJob> {
  return source.kind === 'teacher'
    ? apiPost<MatrixJob>('/api/morphemic', { word }, { signal })
    : apiPost<MatrixJob>(`/api/published/morphemic/${encodeURIComponent(source.lessonId)}`, { block_id: source.blockId, word }, { signal });
}

function poll(key: string, source: MatrixSource, signal?: AbortSignal): Promise<MatrixJob> {
  return source.kind === 'teacher'
    ? apiGet<MatrixJob>(`/api/morphemic/job/${encodeURIComponent(key)}`, { signal })
    : apiGet<MatrixJob>(`/api/published/morphemic/${encodeURIComponent(source.lessonId)}/${encodeURIComponent(key)}`, { signal });
}

/**
 * The word's matrix: built-in, from the library, or built now. Null when the
 * word has no prefix or suffix to build with, or the build could not finish.
 */
export function loadMatrix(word: string, source: MatrixSource, options: PollOptions = {}): Promise<MorphologyFamily | null> {
  const local = findMorphology(word);
  if (local) return Promise.resolve(local);
  const key = normaliseMatrixWord(word);
  if (!key) return Promise.resolve(null);
  const cached = answers.get(key);
  if (cached) return cached;
  const pending = pollTextToolJob(
    () => start(key, source, options.signal),
    (jobKey) => poll(jobKey, source, options.signal),
    { intervalMs: 1500, timeoutMs: 120_000, ...options }
  )
    .then((result) => readMatrix((result as MatrixJob['result'])?.matrix))
    .catch(() => {
      // A failed build is not remembered: the next tap may try again.
      answers.delete(key);
      return null;
    });
  answers.set(key, pending);
  return pending;
}

/**
 * Teacher strip: where a pinned word's matrix stands, without waiting for a
 * build. Asking starts the build, so pinned words are ready before students tap.
 */
export async function matrixStatus(word: string): Promise<MatrixStatus> {
  if (findMorphology(word)) return 'ready';
  const key = normaliseMatrixWord(word);
  if (!key) return 'none';
  try {
    const view = await start(key, { kind: 'teacher' });
    if (view.status === 'working') return 'building';
    return view.status === 'done' && readMatrix(view.result?.matrix) ? 'ready' : 'none';
  } catch {
    return 'none';
  }
}

/** Forget remembered answers (after a teacher edits or rebuilds a matrix). */
export function forgetMatrices(): void {
  answers.clear();
}
