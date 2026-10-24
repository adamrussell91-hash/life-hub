import { describe, expect, it } from 'vitest';
import { fillPhaseSample } from '@/sprint/practice-sample';
import { prototypeProblems, reflectionProblems, sketchProblems, understandProblems, voteProblems } from '@/sprint/checks';
import { newSprintSettings } from '@/sprint/defaults';
import type { SprintClient, SprintStatus } from '@/sprint/api';
import type { PublicSprint } from '@/sprint/schema';

const settings = newSprintSettings('c1');
const sprint = { ...settings, criteria: [{ id: 'c1', text: 'Uses sources' }, { id: 'c2', text: 'Why it matters' }], requirements: [{ id: 'r1', text: 'Has a title', phases: ['sketch', 'prototype'] }] } as unknown as PublicSprint;
const status = { identity: { need: null, initials: 'S1' }, group: null, notes: [{ id: 'n1', text: 'x', mine: true }], gallery: [{ id: 'set1', ideas: [{ id: 'i1' }] }] } as unknown as SprintStatus;
const client = { save: async () => status } as unknown as SprintClient;
const fill = (key: Parameters<typeof fillPhaseSample>[0]) => fillPhaseSample(key, { status, sprint, client, name: 'Student 1' }).then((r) => r.payload as never);

describe('fillPhaseSample', () => {
  it('passes every phase’s checks', async () => {
    expect(understandProblems(await fill('understand'), 3)).toEqual([]);
    expect(sketchProblems(await fill('sketch'), { ideas: 3, requirements: sprint.requirements })).toEqual([]);
    expect(voteProblems(await fill('decide'), sprint.criteria, ['set1'])).toEqual([]);
    expect(prototypeProblems(await fill('prototype'), sprint.criteria, sprint.requirements)).toEqual([]);
    expect(reflectionProblems(await fill('test'))).toEqual([]);
  });
});
