export type AttemptVerdict = 'ok' | 'empty' | 'odd';

/**
 * A cheap check that a student made a real attempt. Only an empty box stops them:
 * a one-word answer ("and") can be exactly right, so length is never a reason to block.
 * A false block on real writing is worse than a mash getting through.
 */
export function checkAttempt(texts: string[]): AttemptVerdict {
  const words = texts.map((t) => t.trim().split(/\s+/).filter(Boolean));
  if (words.some((w) => w.length === 0)) return 'empty';
  const all = words.flat();
  const average = all.join('').length / all.length;
  return all.some((w) => /(.)\1{3}/i.test(w)) || average > 12 ? 'odd' : 'ok';
}

/** The first box with nothing in it, or -1. */
export const firstEmpty = (texts: string[]): number => texts.findIndex((t) => !t.trim());
