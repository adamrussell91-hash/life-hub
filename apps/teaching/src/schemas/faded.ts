import { z } from 'zod';

/** Imports only zod: lecture scenes and the server bundles pull this in. */

export const FadedStepSchema = z.object({
  /** Absent only on content converted from the old shape: the key is then the block id. */
  id: z.string().min(1).optional(),
  /** Only when this step needs different wording from the block's question. */
  prompt: z.string().max(300).optional(),
  extract: z.string().max(2000),
  answers: z.array(z.string().max(600)).min(1).max(4),
  blanks: z.array(z.number().int().min(0).max(3)).max(4),
  /** Worked steps: one question about why the example works. */
  question: z
    .object({
      prompt: z.string().max(300),
      choices: z.array(z.string().max(200)).min(2).max(4),
      correct: z.number().int().min(0).max(3)
    })
    .optional()
});

const FadedShape = z.object({
  prompt: z.string().max(300),
  part_labels: z.array(z.string().min(1).max(40)).min(1).max(4),
  steps: z.array(FadedStepSchema).min(1).max(6),
  /** What a strong answer does, by part label. */
  criteria: z.record(z.string(), z.array(z.string().max(160)).max(4)),
  /** A block with a writing step is a gate unless switched off. */
  gate: z.boolean().optional()
});

export type FadedContent = z.infer<typeof FadedShape>;
export type FadedStep = FadedContent['steps'][number];

const GENERIC_CRITERIA = ['Answers the question', 'Uses words from the extract', 'Says what those words show'];

/** Reads either shape and always returns the new one. Safe on already-new content. */
export function upgradeFaded(raw: unknown): unknown {
  const c = (raw ?? {}) as Record<string, unknown>;
  if (Array.isArray(c.steps)) return raw;
  const parts = Array.isArray(c.parts) ? (c.parts as Array<{ label: string; answer: string }>) : [];
  const blanks = Array.isArray(c.blanks) ? (c.blanks as number[]) : [];
  const labels = parts.map((p) => p.label);
  return {
    prompt: typeof c.prompt === 'string' ? c.prompt : '',
    part_labels: labels,
    steps: parts.length ? [{ extract: typeof c.extract === 'string' ? c.extract : '', answers: parts.map((p) => p.answer), blanks }] : [],
    criteria: Object.fromEntries(blanks.filter((i) => i < labels.length).map((i) => [labels[i], GENERIC_CRITERIA])),
    ...(typeof c.gate === 'boolean' ? { gate: c.gate } : {})
  };
}

export const FadedContentSchema = z.preprocess(
  upgradeFaded,
  FadedShape.superRefine((c, ctx) => {
    c.steps.forEach((step, s) => {
      const issue = (message: string, key: string) => ctx.addIssue({ code: 'custom', message, path: ['steps', s, key] });
      if (step.answers.length !== c.part_labels.length) issue('Each step needs one answer per part.', 'answers');
      if (new Set(step.blanks).size !== step.blanks.length || step.blanks.some((i) => i >= c.part_labels.length)) {
        issue('Each blank must name a different part of the example.', 'blanks');
      }
      if (step.question && step.question.correct >= step.question.choices.length) issue('The correct choice must be one of the choices.', 'question');
    });
  })
);

/** Every reader uses this: stored lessons reach the tutorial player unparsed. Empty content gives no steps. */
export function fadedContent(block: { content: unknown }): FadedContent {
  const c = upgradeFaded(block.content) as Partial<FadedContent>;
  return { prompt: c.prompt ?? '', part_labels: c.part_labels ?? [], steps: c.steps ?? [], criteria: c.criteria ?? {}, ...(c.gate === undefined ? {} : { gate: c.gate }) };
}

export const fadedStepKey = (block: { id: string }, step: FadedStep): string => step.id ?? block.id;
export const fadedWritingSteps = (c: FadedContent): FadedStep[] => c.steps.filter((s) => s.blanks.length > 0);

/** Blanks for step `index`: none first, then one more from the last part backward. */
export function suggestedBlanks(index: number, partCount: number): number[] {
  return Array.from({ length: Math.min(index, partCount) }, (_, i) => partCount - 1 - i).reverse();
}

/** Teacher warnings. They never block publishing. */
export function fadedWarnings(c: FadedContent): string[] {
  const out: string[] = [];
  if (c.steps.length === 1) out.push('One step does not fade. Add steps so students take over part by part.');
  if (c.steps[0] && c.steps[0].blanks.length > 0) out.push('Start with a fully worked step.');
  c.steps.forEach((s, i) => {
    const before = c.steps[i - 1];
    if (before && s.blanks.length < before.blanks.length) out.push(`Step ${i + 1} asks for less than step ${i}.`);
    if (s.blanks.length === 0 && !s.question?.prompt.trim()) out.push(`Step ${i + 1} is worked and has no question about it.`);
  });
  const extracts = c.steps.map((s) => s.extract.trim()).filter(Boolean);
  if (new Set(extracts).size < extracts.length) out.push('Two steps use the same extract.');
  return out;
}
