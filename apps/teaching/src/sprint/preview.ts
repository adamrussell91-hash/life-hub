import type { Block } from '@/schemas/block';
import { el } from '@/quiz/dom';
import type { FormContext, PhaseForm } from './form-kit';
import type { SprintClient, SprintStatus } from './api';
import type { PublicSprint, SprintPhaseKey } from './schema';
import { mountUnderstand } from './phase-understand';
import { mountSketch } from './phase-sketch';
import { mountDecide } from './phase-decide';
import { mountPrototype } from './phase-prototype';
import { mountTest } from './phase-test';
import { createGroupSheet } from './group-sheet';
import { sprintParts } from './model';

/**
 * What a student sees in one phase, with made-up answers from a sample group,
 * for the teacher's phase tab. It runs the real form; nothing is sent.
 */
const FORMS: Record<SprintPhaseKey, (ctx: FormContext) => PhaseForm> = { understand: mountUnderstand, sketch: mountSketch, decide: mountDecide, prototype: mountPrototype, test: mountTest };

const row = (key: SprintPhaseKey) => ({ key, open: true, due_date: '', due_time: '', state: 'none' as const, late: false, frozen: false, closed: false, count_in: 1 });
const brief = { limits: { can_known: [{ text: 'What we make', count: 3 }, { text: 'Class time', count: 2 }], cant_known: [{ text: 'The deadline', count: 3 }] }, problem: 'Our audience needs a clear way in, because the real problem sits under the brief.', audience: { who: 'The people the brief names', why: 'They need it to work for them.' }, answers: [{ question: 'What does a strong one look like?', answer: 'Your answer to the group shows here.' }] };
const idea = (id: string, title: string, text: string) => ({ id, title, idea: text, answers: 'It solves the problem for the audience because it meets them where they are.', evidence: 'It uses what the class has studied.', file: null, strongest: false });
const members = [{ key: 'm1', initials: 'You', me: true }, { key: 'm2', initials: 'CD', me: false }, { key: 'm3', initials: 'EF', me: false }];

export function sampleStatus(key: SprintPhaseKey, sprint: PublicSprint): SprintStatus {
  const base: SprintStatus = { identity: { need: null, initials: 'AB' }, group: { id: 'g', name: 'Sample group', size: 3, mates: ['CD', 'EF'] }, mine: {}, brief, members };
  if (key === 'understand') return {
    ...base,
    notes: [{ id: 'n1', text: 'A sample problem statement from one student.', mine: true }, { id: 'n2', text: 'Another student’s problem statement, without their name.', mine: false }],
    understand_group: {
      who: [{ text: 'The people the brief names', count: 2 }, { text: 'Their teachers', count: 1 }], why: [{ text: 'They need it to work for them', count: 2 }], audience: null,
      limits: { can_known: [{ text: 'What we make', count: 3 }], cant_known: [{ text: 'The deadline', count: 3 }], can_unknown: [{ text: 'How long each part takes', count: 2 }], cant_unknown: [{ text: 'What the audience already knows', count: 2 }] },
      questions: [{ id: 'q1', text: 'What the audience already knows', count: 2, picked: true, sent: true }, { id: 'q2', text: 'How long each part takes', count: 2, picked: false, sent: false }],
      sent: [{ id: 'q1', text: 'What the audience already knows', answer: 'Your answer arrives here for the group.' }]
    }
  };
  if (key === 'decide') return {
    ...base,
    pool: [idea('i1', 'One student’s strongest idea', 'The idea they starred in Sketch.'), idea('i2', 'Another student’s strongest idea', 'Another way to solve it.'), idea('i3', 'A third student’s strongest idea', 'A third way to solve it.')],
    votes_closed: false, chosen: null, parts: []
  };
  if (key === 'prototype') return {
    ...base,
    chosen: { id: 'i1', title: 'The group’s chosen idea', idea: 'What the group decided to build.' },
    parts: [{ id: 'p1', text: 'Your part', shows: 'What your part must show', how: 'How your group said it would be made', criterion: sprint.criteria[0]?.id ?? '', claimed: 1, mine: true, assigned: ['m1'] }, { id: 'p2', text: 'A teammate’s part', shows: '', how: '', criterion: '', claimed: 1, mine: false, assigned: ['m2'] }],
    assemble: true, assembler: { key: 'm2', initials: 'CD', me: false },
    group_parts: [
      { part_id: 'p1', part: 'Your part', who: 'You', me: true, text: 'What you have written so far.', link: '', files: [], in: false, started: true },
      { part_id: 'p2', part: 'A teammate’s part', who: 'CD', me: false, text: 'What CD has written so far.', link: '', files: [], in: true, started: true }
    ]
  };
  if (key === 'test') return { ...base, received: { levels: Object.fromEntries(sprint.criteria.map((c) => [c.id, [1, 3, 2] as [number, number, number]])), lines: [{ worked: 'It works because it starts somewhere easy.', next: 'Try adding one more example.', about: '' }] } };
  return base;
}

export function phasePreview(key: SprintPhaseKey, sprint: PublicSprint, blocks: Block[]): { el: HTMLElement; dispose(): void } {
  const status = sampleStatus(key, sprint);
  const box = el('div', 'kit-preview');
  const form = FORMS[key]({
    status, sprint, blocks, row: row(key), editable: true,
    // Typing saves to nowhere; anything that would reach the class says it's a preview.
    client: new Proxy({} as SprintClient, { get: (_t, name) => (name === 'save' ? async () => status : async () => { throw new Error('This is a preview. Nothing is sent.'); }) }),
    frames: [], valueCheck: null, support: sprint.support, onStatus() {}, drafts: {}
  });
  const frame = el('div', 'sprint kit-preview__frame');
  // The same group sheet students see at the top of the phase, filled from the sample group.
  const sheet = createGroupSheet({ sprint, challenge: sprintParts(blocks).brief, pageBlocks: blocks });
  sheet.update(status, key);
  const work = el('section', 'sprint-form');
  work.append(form.el);
  frame.append(sheet.el, work);
  box.append(frame);
  return { el: box, dispose: form.dispose };
}
