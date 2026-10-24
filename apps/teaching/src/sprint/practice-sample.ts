import type { SprintClient, SprintStatus } from './api';
import type { Part, PhasePayload, PublicSprint, SprintPhaseKey } from './schema';

/**
 * Practice runs only: a sample answer for one phase that passes that phase's
 * checks (checks.ts), so the teacher can step through the whole sprint.
 * Group steps that are their own calls (Understand's star, Decide's parts and
 * claim) are made through the student's client first.
 */
export async function fillPhaseSample(
  key: SprintPhaseKey,
  o: { status: SprintStatus; sprint: PublicSprint; client: SprintClient; name: string }
): Promise<{ payload: PhasePayload[SprintPhaseKey]; status: SprintStatus }> {
  const out = await samplePayload(key, o);
  // Saved as a draft, as typing would, so End class part hands it in.
  return { payload: out.payload, status: await o.client.save(key, out.payload as never) };
}

async function samplePayload(
  key: SprintPhaseKey,
  o: { status: SprintStatus; sprint: PublicSprint; client: SprintClient; name: string }
): Promise<{ payload: PhasePayload[SprintPhaseKey]; status: SprintStatus }> {
  const { sprint, client, name } = o;
  let status = o.status;
  const criteria = sprint.criteria.map((c) => c.id);
  const wheres = (phase: SprintPhaseKey, text: string) => Object.fromEntries(sprint.requirements.filter((r) => r.phases.includes(phase)).map((r) => [r.id, text]));
  const tag = name.replace(/\D/g, '') || '1';

  if (key === 'understand') {
    const n = sprint.phases[0]!.ideas ?? 3;
    const payload: PhasePayload['understand'] = { notes: Array.from({ length: n }, (_, i) => `How might we help ${name} answer question ${i + 1}?`), star: '', stretch: '' };
    status = await client.save('understand', payload);
    payload.star = status.notes?.[0]?.id ?? '';
    return { payload, status };
  }
  if (key === 'sketch') {
    const n = sprint.phases[1]!.ideas ?? 3;
    const cards = Array.from({ length: n }, (_, i) => ({
      id: `sample${tag}x${i + 1}`,
      title: `${name} idea ${i + 1}`,
      idea: `${name} suggests idea number ${i + 1} for the group.`,
      answers: `It answers the group question in way ${i + 1}.`,
      evidence: `The sample evidence for idea ${i + 1} is here.`,
      criteria: Object.fromEntries(criteria.slice(0, 1).map((c) => [c, `The first line of idea ${i + 1} shows it.`])),
      requirements: wheres('sketch', `In the first line of idea ${i + 1}.`),
      value_answer: `Another view would see idea ${i + 1} differently.`
    }));
    return { payload: { cards, strongest: cards[0]!.id, strongest_why: 'It answers the question most clearly of the three.' }, status };
  }
  if (key === 'decide') {
    if (status.chosen) {
      if (!(status.parts ?? []).length) {
        const parts: Part[] = criteria.slice(0, 2).map((c, i) => ({ id: `part${i + 1}`, text: `Part ${i + 1}`, shows: `What part ${i + 1} shows.`, criterion: c }));
        status = await client.parts(parts.length ? parts : [{ id: 'part1', text: 'Part 1', shows: '', criterion: '' }]);
      }
      const parts = status.parts ?? [];
      const free = parts.find((p) => !p.claimed) ?? parts[0];
      if (free && !parts.some((p) => p.mine)) status = await client.claimPart(free.id);
    }
    const sets = status.gallery ?? [];
    const idea = sets.flatMap((s) => s.ideas)[0]?.id ?? '';
    return {
      payload: {
        votes: idea ? Object.fromEntries(criteria.map((c) => [c, idea])) : {},
        reasons: Object.fromEntries(criteria.map((c) => [c, 'This idea meets the criterion most clearly.'])),
        opened: sets.map((s) => s.id),
        stretch: ''
      },
      status
    };
  }
  if (key === 'prototype') {
    return {
      payload: {
        text: `${name} built this sample part of the prototype.`,
        link: '',
        files: [],
        requirements: wheres('prototype', 'In the opening of my part.'),
        self: Object.fromEntries(criteria.map((c) => [c, 2 as const])),
        self_why: Object.fromEntries(criteria.map((c) => [c, 'My part shows this in its opening.'])),
        value_answer: 'Another view would ask for more evidence here.'
      },
      status
    };
  }
  return {
    payload: {
      reflection: ['The feedback showed our idea answers the question well.', 'Next we would add more evidence, because it was thin.'],
      quote: 'Add one more quote as evidence.',
      change_criterion: criteria[0] ?? '',
      value_answer: 'Another view would want a clearer opening.'
    },
    status
  };
}
