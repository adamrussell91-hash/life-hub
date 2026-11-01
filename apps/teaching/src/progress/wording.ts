/**
 * Next steps in writing boxes: the wording rule, rung order and bank hash, for
 * the browser and the Teaching AI runtime. A copy of the server's
 * netlify/functions/_shared/next-steps.mjs; tests/unit/next-step-jobs.test.ts
 * checks the two agree. No imports, so it bundles anywhere.
 */
export const RUNG_ORDER = ['below', 'capable', 'skilled', 'accomplished', 'excellent'] as const;
export type LadderRung = (typeof RUNG_ORDER)[number];
export const LADDER_MAX = 160;

/** Index into a ladder or bank. No rung yet means the Capable line. */
export function rungIndex(rung: string | null | undefined): number {
  const i = (RUNG_ORDER as readonly string[]).indexOf(rung ?? '');
  return i === -1 ? 1 : i;
}

const BANNED = /\b(not|no longer|without|never|rather than|instead of|don'?t|doesn'?t|isn'?t|lacks?|weak|fails?)\b|^this is\b/i;

/** Problems with one line of student-facing wording: `empty`, `too_long`, `word:<hit>`. Empty means it passes. */
export function checkWording(line: unknown, max = LADDER_MAX): string[] {
  const out: string[] = [];
  const t = String(line ?? '').trim().replace(/[’‘]/g, "'");
  if (!t) out.push('empty');
  if (t.length > max) out.push('too_long');
  const hit = t.match(BANNED);
  if (hit) out.push(`word:${hit[0].toLowerCase()}`);
  return out;
}

/** What a bank entry was built from, so the builder can tell when it is stale. */
export function bankSource(question: string, skills: readonly string[], ladder: readonly string[] | null | undefined): string {
  const s = JSON.stringify([String(question ?? '').trim(), [...(skills ?? [])].sort(), ladder ?? null]);
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}
