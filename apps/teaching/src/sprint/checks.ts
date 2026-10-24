import type { FeedbackEntry, Part, PhasePayload, SprintCriterion, SprintRequirement, UnderstandStep } from './schema';

/**
 * "Check before you submit": short, kind nudges that say what to add.
 * An empty list means ready. Wording says what to do, never what is wrong.
 */

const MORE = 'Add a little more: say what it shows.';
export const fullSentence = (text: string | undefined): boolean => (text ?? '').trim().split(/\s+/).filter(Boolean).length >= 4;
const crit = (c: { text: string }) => `"${c.text}"`;

/** Understand: one nudge per switched-on step that still needs something. */
export function understandProblems(p: PhasePayload['understand'], steps: Record<UnderstandStep, boolean>, statements: number): string[] {
  const out: string[] = [];
  if (steps.spot && p.spot.length < 3) out.push(`Spot: tap at least 3 words in the brief that stand out. You have ${p.spot.length} so far.`);
  if (steps.audience && !p.audience.who.trim()) out.push('Audience: say who this is for.');
  if (steps.audience && !fullSentence(p.audience.why)) out.push('Audience: say why it matters to them in a full sentence.');
  if (steps.dig && p.dig.filter((d) => d.trim()).length < 2) out.push('Dig: write the surface problem, then ask why at least once.');
  if (steps.say && !fullSentence(p.say)) out.push('Say it: write the problem in your own words, in a full sentence.');
  if (steps.limits) {
    const known = p.limits.can_known.length + p.limits.cant_known.length;
    const unknown = p.limits.can_unknown.length + p.limits.cant_unknown.length;
    if (!known) out.push('Limits: add at least one thing you know.');
    if (!unknown) out.push('Limits: add at least one thing you don’t know yet.');
  }
  if (steps.vote && statements > 0 && !p.star) out.push('Vote: star the problem statement your group should take on.');
  return out;
}

export function sketchProblems(
  p: PhasePayload['sketch'],
  opts: { ideas: number; requirements: readonly SprintRequirement[] }
): string[] {
  const out: string[] = [];
  const reqs = opts.requirements.filter((r) => r.phases.includes('sketch'));
  p.cards.forEach((c, i) => {
    const name = `Idea ${i + 1}`;
    if (!c.title.trim()) out.push(`${name}: give it a title.`);
    for (const field of [c.idea, c.answers, c.evidence]) if (!fullSentence(field)) { out.push(`${name}: ${MORE}`); break; }
    if (!Object.values(c.criteria).some((w) => w.trim())) out.push(`${name}: link it to at least one criterion and quote the line that shows it.`);
    for (const r of reqs) if (!c.requirements[r.id]?.trim()) out.push(`${name}: say where it meets "${r.text}".`);
    if (!fullSentence(c.value_answer)) out.push(`${name}: answer the check question in a full sentence.`);
  });
  if (p.cards.length < opts.ideas) out.push(`Write ${opts.ideas} ideas. You have ${p.cards.length} so far.`);
  const titles = new Set(p.cards.map((c) => c.title.trim().toLowerCase()));
  const ideasText = new Set(p.cards.map((c) => c.idea.trim().toLowerCase()));
  if (titles.size < p.cards.length || ideasText.size < p.cards.length) out.push('Give each idea its own title and its own idea.');
  if (!p.strongest || !fullSentence(p.strongest_why)) out.push('Pick your strongest idea and say why.');
  return out;
}

export function voteProblems(
  p: Pick<PhasePayload['decide'], 'votes' | 'reasons' | 'opened'>,
  criteria: readonly Pick<SprintCriterion, 'id' | 'text'>[],
  sets: readonly string[]
): string[] {
  const out: string[] = [];
  if (sets.some((s) => !p.opened.includes(s))) out.push('Open every set of ideas before you vote.');
  for (const c of criteria) {
    if (!p.votes[c.id]) out.push(`Give ${crit(c)} to one idea.`);
    else if (!fullSentence(p.reasons[c.id])) out.push(`${crit(c)}: say why in a full sentence.`);
  }
  return out;
}

export function partsProblems(parts: readonly Part[]): string[] {
  return parts.filter((p) => !p.criterion).map((p) => `"${p.text}": pick the criterion it serves.`);
}

export function prototypeProblems(
  p: PhasePayload['prototype'],
  criteria: readonly Pick<SprintCriterion, 'id' | 'text'>[],
  requirements: readonly SprintRequirement[]
): string[] {
  const out: string[] = [];
  if (!p.text.trim() && !p.files.length && !p.link) out.push('Add your part: write it, upload a file or add a link.');
  for (const r of requirements.filter((x) => x.phases.includes('prototype'))) if (!p.requirements[r.id]?.trim()) out.push(`Say where your part meets "${r.text}".`);
  for (const c of criteria) if (!p.self[c.id] || !fullSentence(p.self_why[c.id])) out.push(`${crit(c)}: pick Starting, Showing or Strong and say why.`);
  if (!fullSentence(p.value_answer)) out.push('Answer the check question in a full sentence.');
  return out;
}

export function feedbackProblems(f: FeedbackEntry, criteria: readonly Pick<SprintCriterion, 'id' | 'text'>[]): string[] {
  const out: string[] = [];
  for (const c of criteria) if (!f.levels[c.id]) out.push(`Pick a level for ${crit(c)}.`);
  if (!fullSentence(f.worked)) out.push('Say what worked in a full sentence.');
  if (!fullSentence(f.next)) out.push('Give one thing to try next in a full sentence.');
  if (!f.about) out.push('Pick the criterion your comments are about.');
  return out;
}

export function reflectionProblems(p: PhasePayload['test']): string[] {
  const out: string[] = [];
  if (p.reflection.length < 2 || p.reflection.some((r) => !fullSentence(r))) out.push('Answer both reflection questions in full sentences.');
  if (!p.quote.trim()) out.push('Quote one piece of feedback your group received.');
  if (!p.change_criterion) out.push('Pick the criterion your change is about.');
  if (!fullSentence(p.value_answer)) out.push('Answer the check question in a full sentence.');
  return out;
}
