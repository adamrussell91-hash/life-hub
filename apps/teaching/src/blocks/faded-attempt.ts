export type AttemptVerdict = 'ok' | 'short' | 'odd';

/** A cheap check that a student made a real attempt. A false block on real writing is worse than a mash getting through. */
export function checkAttempt(texts: string[]): AttemptVerdict {
  const words = texts.map((t) => t.trim().split(/\s+/).filter(Boolean));
  if (words.some((w) => w.length < 5)) return 'short';
  const all = words.flat();
  const average = all.join('').length / all.length;
  return all.some((w) => /(.)\1{3}/i.test(w)) || average > 12 ? 'odd' : 'ok';
}
