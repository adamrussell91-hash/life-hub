// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { setLessonPicks, setUnitDeep } from '@/deep/context';
import { evidenceSteps, targetPieces } from '@/deep/block-tags';
import { pieceLayout, rubricLine, skillLayout, stepOptions } from '@/deep/tag-model';
import { mountTagRow } from '@/deep/tag-row';
import { mountQuestionBuilder } from '@/quiz/builder';
import { untaggedLine, untaggedQuestions } from '@/quiz/untagged';
import type { Block } from '@/schemas/block';
import type { SkillsContinuum } from '@/skills/schema';

vi.mock('@/skills/api', () => ({ loadSkills: () => new Promise(() => undefined) }));

const piece = (id: string, text: string, dot_point?: string) => ({ id, text, tier: 'essential' as const, ...(dot_point ? { dot_point } : {}) });
const du = (id: string, pieces: ReturnType<typeof piece>[], dot_points = ['poetry:U1', 'poetry:R1']) => ({ id, claim: `Claim ${id}`, why: '', dot_points, concept_bullets: ['ARG1'], pieces, shared_piece_ids: [], steps: [] });
const deep = [
  du('du_aaaa11', [piece('kp_aaaa11', 'Form acts out feeling'), piece('kp_aaaa22', 'Repetition fixes a word')]),
  du('du_bbbb22', [piece('kp_bbbb11', 'A voice can be split'), piece('kp_bbbb22', 'Silence carries meaning')], ['poetry:U2', 'poetry:R2'])
];
const continuum = {
  strands: [{ strand: 'reading', name: 'Reading', sub_strands: [
    { id: 'inference', name: 'Inference', points: [{ area: 'poetry', point: 'R2', link: 'shared' }] },
    { id: 'technique', name: 'Technique', points: [{ area: 'poetry', point: 'R1', link: 'shared' }] }
  ] }]
} as unknown as SkillsContinuum;

describe('tag-model', () => {
  it('puts the lesson’s picks first, then the unit by DU with taught pieces ahead', () => {
    const layout = pieceLayout(deep, { picks: ['kp_bbbb22'], taught: new Set(['kp_aaaa22']) });
    expect(layout.suggested.map((c) => c.id)).toEqual(['kp_bbbb22']);
    expect(layout.groups.map((g) => g.pieces.map((c) => c.id))).toEqual([['kp_aaaa22', 'kp_aaaa11'], ['kp_bbbb11']]);
  });
  it('with no picks, opens on the grouped list', () => {
    const layout = pieceLayout(deep);
    expect(layout.suggested).toEqual([]);
    expect(layout.groups).toHaveLength(2);
  });
  it('a DU step brings that DU’s pieces and R skills first', () => {
    expect(pieceLayout(deep, { stepDus: ['du_bbbb22'] }).suggested.map((c) => c.id)).toEqual(['kp_bbbb11', 'kp_bbbb22']);
    const skills = skillLayout(continuum, deep, { stepDus: ['du_bbbb22'] });
    expect(skills.suggested.map((c) => c.ref)).toEqual(['reading.inference']);
    expect(skills.groups[0]!.skills.map((c) => c.ref)).toEqual(['reading.technique']);
  });
  it('words the rubric line and lists every step', () => {
    expect(rubricLine({ skills: 2, pieces: 3, steps: 1 })).toBe('Your marking rubric: 2 skills, 3 pieces, 1 DU step');
    expect(rubricLine({ skills: 1, pieces: 0, steps: 0 })).toBe('Your marking rubric: 1 skill');
    expect(stepOptions(deep)).toHaveLength(8);
  });
});

describe('publish warning', () => {
  const quiz = (id: string, question: Record<string, unknown>, settings: Record<string, unknown> = {}) =>
    ({ id, block_type: 'quiz_question', visibility: 'all', settings, content: { question: { id, kind: 'true_false', marks: 1, ...question } } }) as unknown as Block;
  const blocks = [quiz('q1', { pieces: ['kp_aaaa11'] }), quiz('q2', {}), quiz('q3', { skills: ['reading.inference'] }), quiz('q4', {}), quiz('q5', {}, { deep_skills: ['reading.technique'] }), quiz('q6', {})];
  it('counts questions with no piece and no skill, and finds the first', () => {
    const found = untaggedQuestions(blocks);
    expect(found).toEqual({ total: 6, untagged: ['q2', 'q4', 'q6'] });
  });
  it('words the line for a lesson with and without dot points', () => {
    const found = { total: 6, untagged: ['q2', 'q4'] };
    expect(untaggedLine(found, true)).toBe("2 of 6 questions have no piece or skill, so they only count towards this lesson's dot points.");
    expect(untaggedLine(found, false)).toBe("2 of 6 questions don't reach anything yet.");
    expect(untaggedLine({ total: 3, untagged: [] }, true)).toBeNull();
  });
});

describe('the tag row', () => {
  const click = (root: HTMLElement, key: string) => root.querySelector<HTMLButtonElement>(`[data-key="${key}"]`)!.click();
  it('takes one piece on auto-marked work and replaces older tags', () => {
    const onChange = vi.fn();
    const row = mountTagRow({ value: { steps: [], skills: [], pieces: ['kp_aaaa11', 'kp_bbbb11'] }, deep, parts: { steps: false, skills: false, pieces: 'one' }, onChange });
    expect(row.root.querySelectorAll('[aria-pressed="true"]')).toHaveLength(2);
    click(row.root, 'piece:kp_aaaa22');
    expect(onChange.mock.calls[0]![0].pieces).toEqual(['kp_aaaa22']);
  });
  it('takes up to three expected pieces and three skills on written work', () => {
    const onChange = vi.fn();
    const row = mountTagRow({ value: { steps: [], skills: [], pieces: [] }, deep, parts: { steps: true, skills: true, pieces: 'several' }, rubric: true, onChange });
    for (const id of ['kp_aaaa11', 'kp_aaaa22', 'kp_bbbb11', 'kp_bbbb22']) click(row.root, `piece:${id}`);
    expect(onChange.mock.lastCall![0].pieces).toHaveLength(3);
    expect(row.root.querySelector('.tg-rubric')!.textContent).toBe('Your marking rubric: 3 pieces');
  });
  it('adds several DU steps, each with its own pass checks', () => {
    const onChange = vi.fn();
    const row = mountTagRow({ value: { steps: [], skills: [], pieces: [] }, deep, parts: { steps: true, skills: false, pieces: false }, onChange });
    click(row.root, 'step:add');
    click(row.root, 'step:du_aaaa11:2a');
    click(row.root, 'step:add');
    click(row.root, 'step:du_bbbb22:3');
    const boxes = row.root.querySelectorAll<HTMLTextAreaElement>('.tg-checks__box');
    expect(boxes).toHaveLength(2);
    boxes[1]!.value = 'Names the split\nUses a quote';
    boxes[1]!.dispatchEvent(new Event('input'));
    const steps = onChange.mock.lastCall![0].steps;
    expect(steps.map((s: { du: string; step: string }) => `${s.du}:${s.step}`)).toEqual(['du_aaaa11:2a', 'du_bbbb22:3']);
    expect(steps[1].checks).toEqual(['Names the split', 'Uses a quote']);
  });
});

describe('the question builder', () => {
  const block = { id: 'q1', block_type: 'quiz_question', visibility: 'all', settings: {}, content: {} } as unknown as Block;
  function mount(kind: 'true_false' | 'extended_response', audience: 'teacher' | 'student' = 'teacher') {
    setUnitDeep(deep);
    setLessonPicks({ focus_pieces: ['kp_bbbb22'] });
    let current = block;
    const question = kind === 'true_false' ? { id: 'q1', kind, marks: 1, prompt: 'Is it?', answer: true } : { id: 'q1', kind, marks: 4, prompt: 'Explain.' };
    const builder = mountQuestionBuilder({
      question: question as never,
      audience,
      onChange: () => undefined,
      blockTags: { block: () => current, write: (fn) => { current = fn(current); } }
    });
    return { builder, block: () => current };
  }
  it('shows the row outside the optional fold, with no Outcomes field', () => {
    const { builder } = mount('true_false');
    const row = builder.root.querySelector('.tg')!;
    expect(row).toBeTruthy();
    expect(row.closest('details')).toBeNull();
    expect(builder.root.textContent).not.toMatch(/Outcomes/);
    expect(builder.root.querySelector('.qz-more__summary')!.textContent).toBe('Hint, explanation and picture (optional)');
    // The lesson’s pick comes first.
    expect(row.querySelector('[data-key^="piece:"]')!.textContent).toBe('Silence carries meaning');
  });
  it('saves an auto-marked piece on the question', () => {
    const { builder } = mount('true_false');
    builder.root.querySelector<HTMLButtonElement>('[data-key="piece:kp_bbbb22"]')!.click();
    expect(builder.get().pieces).toEqual(['kp_bbbb22']);
  });
  it('saves a written question’s expected pieces and steps on the block, never on the question', () => {
    const { builder, block: read } = mount('extended_response');
    builder.root.querySelector<HTMLButtonElement>('[data-key="piece:kp_bbbb22"]')!.click();
    builder.root.querySelector<HTMLButtonElement>('[data-key="step:add"]')!.click();
    builder.root.querySelector<HTMLButtonElement>('[data-key="step:du_aaaa11:2a"]')!.click();
    expect(builder.get().pieces).toBeUndefined();
    expect(targetPieces(read())).toEqual(['kp_bbbb22']);
    expect(evidenceSteps(read()).map((s) => s.step)).toEqual(['2a']);
    expect(builder.root.querySelector('.tg-rubric')!.textContent).toBe('Your marking rubric: 1 piece, 1 DU step');
  });
  it('shows no tagging to a student', () => {
    const { builder } = mount('true_false', 'student');
    expect(builder.root.querySelector('.tg')).toBeNull();
  });
});
