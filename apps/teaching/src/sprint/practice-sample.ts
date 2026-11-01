import type { SprintClient, SprintStatus } from './api';
import type { Part, PhasePayload, PublicSprint, SprintPhaseKey } from './schema';
import { pairsOf } from './rules';

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
    const payload: PhasePayload['understand'] = {
      notes: [], star: '', stretch: '',
      spot: ['brief', 'audience', 'problem'].map((w) => `${w}${tag}`),
      audience: { who: `The people in ${name}'s brief`, why: `They need a clear answer to the problem ${name} found.` },
      dig: [`The surface problem ${name} sees.`, `Because it hides the real problem for ${name}.`],
      say: `The audience needs a clear way in because ${name} found the real problem underneath.`,
      limits: { can_known: [`What ${name} makes`], cant_known: ['The deadline'], can_unknown: [`How long ${name}'s part takes`], cant_unknown: ['What the audience already knows'] }
    };
    status = await client.save('understand', payload);
    payload.star = status.notes?.[0]?.id ?? '';
    return { payload, status };
  }
  if (key === 'sketch') {
    const n = sprint.phases[1]!.ideas ?? 2;
    const rapid = Array.from({ length: n + 2 }, (_, i) => `${name} rapid idea ${i + 1}`);
    const cards = Array.from({ length: n }, (_, i) => ({
      id: `sample${tag}x${i + 1}`,
      seed: rapid[i]!,
      title: `${name} idea ${i + 1}`,
      idea: `${name} suggests idea number ${i + 1} for the group.`,
      answers: `It answers the group question in way ${i + 1}.`,
      evidence: `The sample evidence for idea ${i + 1} is here.`,
      criteria: Object.fromEntries(criteria.slice(0, 1).map((c) => [c, `The first line of idea ${i + 1} shows it.`])),
      requirements: wheres('sketch', `In the first line of idea ${i + 1}.`),
      value_answer: `Another view would see idea ${i + 1} differently.`
    }));
    return {
      payload: {
        inspiration: [{ from: `An example ${name} has seen`, borrow: 'The way it speaks straight to the audience.' }],
        rapid,
        rapid_started_at: '',
        cards,
        strongest: cards[0]!.id,
        strongest_why: 'It answers the question most clearly of the ideas.'
      },
      status
    };
  }
  if (key === 'decide') {
    if (status.chosen) {
      if (!(status.parts ?? []).length) {
        const parts: Part[] = criteria.slice(0, 2).map((c, i) => ({ id: `part${i + 1}`, text: `Part ${i + 1}`, shows: `What part ${i + 1} shows.`, how: '', criterion: c }));
        status = await client.parts(parts.length ? parts : [{ id: 'part1', text: 'Part 1', shows: '', how: '', criterion: '' }]);
      }
      const parts = status.parts ?? [];
      const me = status.members?.find((m) => m.me);
      const free = parts.find((p) => !(p.assigned ?? []).length) ?? parts[0];
      if (free && me && !parts.some((p) => p.mine)) status = await client.assign(free.id, [...(free.assigned ?? []), me.key].slice(-((status.members?.length ?? 0) > parts.length ? 2 : 1)));
      if (status.assemble && !status.assembler && me) status = await client.setAssembler(me.key);
    }
    // Sample classmates rank the ideas in pool order: the first idea beats the rest, and so on.
    const ids = (status.pool ?? []).map((i) => i.id);
    const duels = pairsOf(ids).map(([a, b]) => ({ a, b, winner: a, stronger: criteria.slice(0, 1), why: '' }));
    return {
      payload: { duels, votes: {}, reasons: {}, opened: [], stretch: '', dots: [] },
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
