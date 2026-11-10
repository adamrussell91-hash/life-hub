/**
 * Sentence-level writing (the Writing Revolution formats), kept pure for
 * tests: worked-example fading, word counts and the joining-word check.
 */

export type SentenceFormat = 'sentence_combining' | 'appositive' | 'sentence_expansion' | 'note_to_topic';
export const SENTENCE_FORMATS: readonly SentenceFormat[] = ['sentence_combining', 'appositive', 'sentence_expansion', 'note_to_topic'];
export const isSentenceFormat = (format: string | undefined): format is SentenceFormat =>
  !!format && (SENTENCE_FORMATS as readonly string[]).includes(format);

export const JOINING_WORDS = ['because', 'although', 'which', 'when', 'but', 'so', 'while', 'unless', 'whereas', 'since', 'if', 'who'] as const;
export const QUESTION_WORDS = ['who', 'what', 'when', 'where', 'why', 'how'] as const;
export type QuestionWord = (typeof QUESTION_WORDS)[number];

/** Model: study a worked example. Frame: finish a partial sentence. Independent: write it from scratch. */
export type FadeStage = 'model' | 'frame' | 'independent';

/**
 * Worked-example fading across a set of items. One item: independent. Two:
 * model, then independent. Three or more: a model, then frames for about half
 * of the rest, then independent items to finish.
 */
export function fadeStages(count: number, fade = true): FadeStage[] {
  if (count <= 0) return [];
  if (!fade || count === 1) return Array.from({ length: count }, () => 'independent');
  if (count === 2) return ['model', 'independent'];
  const frames = Math.ceil((count - 1) / 2);
  return Array.from({ length: count }, (_, i) => (i === 0 ? 'model' : i <= frames ? 'frame' : 'independent'));
}

/** An item's stage once its content is known: a model needs a model answer, a frame needs a frame or a model to cut one from. */
export function itemStage(stage: FadeStage, item: { model_answer?: string; frame?: string }): FadeStage {
  const model = !!item.model_answer?.trim();
  const frame = !!item.frame?.trim();
  if (stage === 'model') return model ? 'model' : frame ? 'frame' : 'independent';
  if (stage === 'frame') return frame || model ? 'frame' : 'independent';
  return 'independent';
}

export function wordCount(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

/** The frame a middle item starts from: the teacher's, or the first part of the model answer with the rest to write. */
export function frameFor(item: { model_answer?: string; frame?: string }): string {
  const own = item.frame?.trim();
  if (own) return own;
  const words = (item.model_answer ?? '').trim().split(/\s+/).filter(Boolean);
  if (words.length < 3) return '';
  const keep = Math.min(words.length - 1, Math.max(2, Math.round(words.length * 0.4)));
  return `${words.slice(0, keep).join(' ')} …`;
}

/** Whether a sentence uses the joining word (a whole word, any case; "even though" works as a phrase). */
export function usesJoiningWord(text: string, word: string): boolean {
  const w = word.trim();
  if (!w) return true;
  const pattern = w.split(/\s+/).map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+');
  return new RegExp(`(^|[^A-Za-z’'])${pattern}([^A-Za-z’']|$)`, 'i').test(text);
}

/** The words of a limit used so far, and whether it is over. Absent limit: never over. */
export function limitStatus(text: string, limit: number | undefined): { words: number; over: boolean } {
  const words = wordCount(text);
  return { words, over: !!limit && words > limit };
}

/** "who", "when", "why" → "who, when and why". */
export function listWords(words: readonly string[]): string {
  const list = words.map((w) => w.trim()).filter(Boolean);
  if (list.length <= 1) return list[0] ?? '';
  return `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;
}

/** What a frame item's box starts with: the frame minus its closing ellipsis, ready to type on from. */
export function frameStart(frame: string): string {
  const text = frame.trim();
  if (!text) return '';
  const open = text.replace(/\s*(…|\.\.\.)$/, '');
  return open === text ? text : `${open} `;
}
