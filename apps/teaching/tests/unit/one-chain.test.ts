import { describe, expect, it } from 'vitest';
import type { Alignment } from '@/alignment/schema';
import { addEvidenceStep, evidenceStepOf, evidenceSteps, passChecks, removeEvidenceStep, taggedSkills, withEvidenceStep, withEvidenceSteps, withPassChecks, withStepChecks, withTaggedSkills } from '@/deep/block-tags';
import { chainFlags, chainGaps, placements, pointsOutsideDus } from '@/deep/derive';
import { picksFirst, piecesOffered, skillsOffered } from '@/deep/lesson-picks';
import { DeepUnderstandingSchema } from '@/deep/schema';
import { circleFor } from '@/deep/track';
import { RUNG_CUTS, RUBRIC_BELOW, rungShare } from '@/evidence/constants';
import { markbookEvidence } from '@/evidence/markbook-evidence';
import { buildPointChain, withPointTags } from '@/evidence/syllabus';
import { rungOf } from '@/evidence/syllabus-grid';
import type { Evidence } from '@/evidence/types';
import type { MarkbookView } from '@/markbook/types';
import { cleanRubric, lowestSkill, rubricRows, rubricTags, rubricTally, stepMoves, studentRubric, suggestedMark, suggestedNextStep, writingTick } from '@/marking/rubric-model';
import { answerEvidence } from '@/quiz/evidence';
import { splitQuestion, QuizQuestionSchema } from '@/quiz/core';
import type { SkillsContinuum } from '@/skills/schema';
import { filterBlocksForStudent } from '@/blocks/visibility';
// @ts-expect-error the server's generated mirror has no types
import * as mirror from '../../../../netlify/functions/_shared/profile-evidence.mjs';

/* An invented unit about harbours: this repository is public. */

const alignment = {
  outcomes: [{ n: 1, code: 'EN-1', text: 'x' }, { n: 2, code: 'EN-2', text: 'x' }, { n: 3, code: 'EN-3', text: 'x' }, { n: 4, code: 'EN-4', text: 'x' }],
  concepts: [],
  focus_areas: [
    { id: 'harbours', name: 'Harbours', points: [
      { id: 'U1', kind: 'U', short: 'Tides', text: 'a', outcomes: [{ n: 1, link: 'shared' }, { n: 4, link: 'related' }], concepts: [], processes: [] },
      { id: 'R1', kind: 'R', short: 'Respond', text: 'b', outcomes: [{ n: 2, link: 'shared' }], concepts: [], processes: [] },
      { id: 'R2', kind: 'R', short: 'Compose', text: 'c', outcomes: [{ n: 3, link: 'shared' }], concepts: [], processes: [] }
    ] },
    { id: 'storms', name: 'Storms', points: [
      { id: 'R1', kind: 'R', short: 'Other', text: 'd', outcomes: [{ n: 4, link: 'shared' }], concepts: [], processes: [] }
    ] }
  ]
} as unknown as Alignment;

const labels = [1, 2, 3, 4].map((n) => ({ id: `o${n}`, code: `EN-${n}`, title: '', group: '' }));

const rung = (name: string) => ({ i_can: `I can ${name}`, indicators: [{ group: 'g', text: `Looks like ${name}` }], build: { next_move: `Move on to ${name}` } });
const continuum = {
  strands: [{ strand: 'arguing', name: 'Arguing', sub_strands: [
    { id: 'thesis', name: 'Thesis', rungs: { capable: rung('capable'), skilled: rung('skilled'), accomplished: rung('accomplished'), excellent: rung('excellent') }, points: [
      { area: 'harbours', point: 'R1', link: 'related' }, { area: 'harbours', point: 'R2', link: 'shared' }, { area: 'storms', point: 'R1', link: 'shared' }, { area: 'harbours', point: 'U1', link: 'shared' }
    ] },
    { id: 'evidence', name: 'Evidence', rungs: {}, points: [{ area: 'harbours', point: 'R1', link: 'related' }] },
    { id: 'elsewhere', name: 'Elsewhere', rungs: {}, points: [{ area: 'storms', point: 'R1', link: 'shared' }] }
  ] }]
} as unknown as SkillsContinuum;

const du = DeepUnderstandingSchema.parse({
  id: 'du_ab12cd', claim: 'Tides keep time', dot_points: ['harbours:U1', 'harbours:R1'], concept_bullets: ['ARG1'],
  pieces: [
    { id: 'kp_linked', text: 'The tide table', tier: 'essential', dot_point: 'harbours:U1' },
    { id: 'kp_nopoint', text: 'The old pier', tier: 'strong' }
  ]
});
const units = [{ id: 'unit1', deep_understandings: [du] }];
const lessons = [{ id: 'L1', unit_id: 'unit1', dot_points: ['harbours:R2'] }, { id: 'L2', unit_id: 'unit1' }];
const chain = () => buildPointChain({ alignment, labels, continuum, units, lessons })!;
const serverChain = () => mirror.buildPointChain({ alignment, labels, continuum, units, lessons });

const ev = (tags: string[], source = 'quiz:L1', share = 1): Evidence => ({ item: 'q1', tags, share, why: [], student: 's1', source, date: '2026-10-01', confidence: null });
const byLesson = new Map([['L1', ['dp:harbours:R2']]]);

describe('the chain', () => {
  const table: Array<[string, string[], string[]]> = [
    ['a piece gives its U', ['kp:kp_linked'], ['kp:kp_linked', 'dp:harbours:U1', 'out:o1']],
    ['a skill gives every R it names in the focus area', ['skill:arguing.thesis'], ['skill:arguing.thesis', 'dp:harbours:R1', 'dp:harbours:R2', 'out:o2', 'out:o3']],
    ['both give both', ['kp:kp_linked', 'skill:arguing.evidence'], ['kp:kp_linked', 'skill:arguing.evidence', 'dp:harbours:U1', 'dp:harbours:R1', 'out:o1', 'out:o2']],
    ['neither falls back to the lesson', ['tech:x'], ['tech:x', 'dp:harbours:R2', 'out:o3']],
    ['a piece with no dot point falls through', ['kp:kp_nopoint'], ['kp:kp_nopoint', 'dp:harbours:R2', 'out:o3']],
    ['a skill with no R in the focus area falls through', ['skill:arguing.elsewhere'], ['skill:arguing.elsewhere', 'dp:harbours:R2', 'out:o3']],
    ['stored outcomes are ignored on quiz items', ['kp:kp_linked', 'out:o4'], ['kp:kp_linked', 'dp:harbours:U1', 'out:o1']]
  ];
  for (const [name, tags, want] of table) {
    it(`${name}, in the app and the server's copy`, () => {
      const [app] = withPointTags([ev(tags)], byLesson, new Map(), chain());
      const [server] = mirror.withPointTags([ev(tags)], byLesson, new Map(), serverChain());
      expect(app!.tags).toEqual(want);
      expect(server.tags).toEqual(want);
    });
  }

  it('keeps the mark when a piece has no dot point', () => {
    const [out] = withPointTags([ev(['kp:kp_nopoint'], 'quiz:L1', 0.5)], byLesson, new Map(), chain());
    expect(out!.share).toBe(0.5);
    expect(out!.tags).toContain('dp:harbours:R2');
  });

  it('reaches nothing when a lesson has no points and the item no tags, and loses no mark', () => {
    const [out] = withPointTags([ev(['tech:x'], 'quiz:L2', 0.5)], new Map(), new Map(), chain());
    expect(out).toEqual(ev(['tech:x'], 'quiz:L2', 0.5));
  });

  it('leaves another focus area’s R points out', () => {
    const [out] = withPointTags([ev(['skill:arguing.thesis'])], byLesson, new Map(), chain());
    expect(out!.tags).not.toContain('dp:storms:R1');
    expect(out!.tags).not.toContain('out:o4');
  });

  it('counts a skill on both its R points and moves no deep understanding', () => {
    const [out] = withPointTags([ev(['skill:arguing.thesis'])], byLesson, new Map(), chain());
    expect(out!.tags.filter((t) => t.startsWith('dp:'))).toEqual(['dp:harbours:R1', 'dp:harbours:R2']);
    expect(out!.tags.some((t) => t.startsWith('kp:') || t.startsWith('du:'))).toBe(false);
    expect(circleFor([out!], 's1', 'kp_linked', '2026-10-02')).toMatchObject({ fill: 'none', ring: 'none' });
  });

  it('takes the focus area from the unit’s deep understandings, else its lessons', () => {
    expect(chain().lessonAreas.get('L2')).toEqual(['harbours']);
    const bare = buildPointChain({ alignment, labels, continuum, units: [{ id: 'unit1' }], lessons: [{ id: 'L1', unit_id: 'unit1', dot_points: ['storms:R1'] }, { id: 'L2', unit_id: 'unit1' }] })!;
    expect(bare.lessonAreas.get('L2')).toEqual(['storms']);
  });

  it('leaves assessment criteria their outcomes', () => {
    const [out] = withPointTags([ev(['out:o4'], 'assess:t1')], byLesson, new Map([['out:o4', ['dp:storms:R1']]]), chain());
    expect(out!.tags).toEqual(['out:o4', 'dp:storms:R1']);
  });

  it('with no alignment there is no chain, and items stay as they were', () => {
    expect(buildPointChain({ alignment: null, labels, continuum, units, lessons })).toBeNull();
    expect(withPointTags([ev(['out:o4'])], byLesson, new Map(), null)[0]!.tags).toEqual(['out:o4', 'dp:harbours:R2']);
  });
});

describe('plan flags', () => {
  it('flags a piece with no U, a U outside the deep understanding, and a missing kind of point', () => {
    const off = { ...du, dot_points: ['harbours:R1'], pieces: [...du.pieces] };
    const f = chainFlags(off);
    expect(f.no_point.map((p) => p.id)).toEqual(['kp_nopoint']);
    expect(f.off_du.map((p) => p.id)).toEqual(['kp_linked']);
    expect(f.no_u).toBe(true);
    expect(f.no_r).toBe(false);
    expect(chainGaps(off)).toEqual(['Needs a U dot point', '1 piece with no U dot point', '1 piece on a U outside this deep understanding']);
    expect(chainGaps({ ...du, pieces: [du.pieces[0]!] })).toEqual([]);
  });
  it('lists the unit’s points that sit in no deep understanding', () => {
    expect(pointsOutsideDus(['harbours:U1', 'harbours:R2'], [du])).toEqual(['harbours:R2']);
  });
});

describe('several steps on one block', () => {
  const block = (settings: Record<string, unknown>) => ({ id: 'b1', block_type: 'question_set', visibility: 'all', content: { title: 'Paragraph' }, settings }) as never;

  it('reads an old single value as a list of one, and old checks as the first step’s', () => {
    const old = block({ deep_step: { du: 'du_ab12cd', step: '3' }, deep_checks: ['Names two poems'] });
    expect(evidenceSteps(old)).toEqual([{ du: 'du_ab12cd', step: '3', checks: ['Names two poems'] }]);
    expect(evidenceStepOf(old)).toEqual({ du: 'du_ab12cd', step: '3' });
    expect(passChecks(old)).toEqual(['Names two poems']);
    // Still passable: its one step moves the student on.
    expect(stepMoves({ steps: { 'du_ab12cd:3': { checks: [true], pass: true } } }, null, { du_ab12cd: '2b' }).moves).toEqual([{ du: 'du_ab12cd', step: '3' }]);
  });

  it('keeps each step’s own checks', () => {
    let b = withEvidenceSteps(block({ deep_step: { du: 'du_ab12cd', step: '2a' }, deep_checks: ['Old line'] }), [{ du: 'du_ab12cd', step: '2a', checks: ['Old line'] }, { du: 'du_cd34ef', step: '3', checks: ['Compares'] }]);
    expect((b as { settings: Record<string, unknown> }).settings.deep_checks).toBeUndefined();
    expect(evidenceSteps(b).map((s) => s.checks)).toEqual([['Old line'], ['Compares']]);
    b = withStepChecks(b, { du: 'du_cd34ef', step: '3' }, ['Compares two']);
    expect(evidenceSteps(b)[1]!.checks).toEqual(['Compares two']);
    b = withPassChecks(b, ['New line']);
    expect(passChecks(b)).toEqual(['New line']);
    b = withEvidenceStep(b, { du: 'du_ab12cd', step: '2b' });
    expect(evidenceSteps(b).map((s) => [s.step, s.checks[0]])).toEqual([['2b', 'New line'], ['3', 'Compares two']]);
    b = removeEvidenceStep(b, { du: 'du_ab12cd', step: '2b' });
    expect(evidenceSteps(b).map((s) => s.step)).toEqual(['3']);
    expect(evidenceSteps(addEvidenceStep(b, { du: 'du_ab12cd', step: '4' })).map((s) => s.step)).toEqual(['3', '4']);
    expect(evidenceSteps(withEvidenceStep(b, null))).toEqual([]);
  });

  it('drops anything unreadable', () => {
    expect(evidenceSteps(block({ deep_step: [{ du: 'x', step: '3' }, { du: 'du_ab12cd', step: '9' }, null, { du: 'du_ab12cd', step: '4' }, { du: 'du_ab12cd', step: '4' }] })).map((s) => s.step)).toEqual(['4']);
  });

  it('lists every task for a step', () => {
    const task = (id: string, settings: Record<string, unknown>) => ({ id, block_type: 'question_set', visibility: 'all', content: { title: id }, settings });
    const p = placements([{ id: 'L1', blocks: [task('a', { deep_step: { du: 'du_ab12cd', step: '3' } }), task('b', { deep_step: [{ du: 'du_ab12cd', step: '3', checks: [] }, { du: 'du_ab12cd', step: '4', checks: [] }, { du: 'du_cd34ef', step: '2a', checks: [] }] })] }] as never, 'du_ab12cd');
    expect(p.steps.get('3')!.map((t) => t.block_id)).toEqual(['a', 'b']);
    expect(p.steps.get('4')!.map((t) => t.block_id)).toEqual(['b']);
    expect(p.steps.has('2a')).toBe(false);
  });

  it('holds skills for work with no question, stripped for students', () => {
    const b = withTaggedSkills(block({}), ['arguing.thesis', 'bad', 'arguing.evidence']);
    expect(taggedSkills(b)).toEqual(['arguing.thesis', 'arguing.evidence']);
    const tagged = block({ deep_skills: ['arguing.thesis'], deep_step: [{ du: 'du_ab12cd', step: '3', checks: ['x'] }], keep: 1 });
    expect((filterBlocksForStudent([tagged])[0] as unknown as { settings: unknown }).settings).toEqual({ keep: 1 });
  });
});

describe('lesson picks', () => {
  it('offers pieces whose U is ticked', () => {
    expect(piecesOffered(['harbours:U1'], [du]).map((x) => [x.du, x.piece.id])).toEqual([['du_ab12cd', 'kp_linked']]);
    expect(piecesOffered([], [du])).toEqual([]);
  });
  it('offers skills that name a ticked R, shared links first', () => {
    expect(skillsOffered(['harbours:R1', 'harbours:U1'], continuum).map((s) => [s.ref, s.link])).toEqual([['arguing.thesis', 'related'], ['arguing.evidence', 'related']]);
    expect(skillsOffered(['harbours:R1', 'storms:R1'], continuum).map((s) => s.ref)).toEqual(['arguing.thesis', 'arguing.elsewhere', 'arguing.evidence']);
  });
  it('puts picks first', () => {
    expect(picksFirst(['a', 'b', 'c'], (x) => x, ['c', 'a'])).toEqual(['c', 'a', 'b']);
    expect(picksFirst(['a', 'b'], (x) => x, undefined)).toEqual(['a', 'b']);
  });
});

describe('the rubric', () => {
  const written = splitQuestion(QuizQuestionSchema.parse({ id: 'q1', kind: 'short_answer', prompt: 'Why the tide?', marks: 4, accepted: ['x'], skills: ['arguing.thesis', 'arguing.evidence'], pieces: ['kp_linked'] }));

  it('reads each rung back through the Grid’s cuts', () => {
    expect((['below', 'capable', 'skilled', 'accomplished', 'excellent'] as const).map((r) => rungOf(rungShare(r)!))).toEqual(['below', 'capable', 'skilled', 'accomplished', 'excellent']);
    expect(rungShare('below')).toBe(RUBRIC_BELOW);
    expect(rungShare('capable')).toBe(RUNG_CUTS.capable);
    expect(rungShare('nope')).toBeNull();
  });

  it('gives two skills on different rungs their own items, each reading back its own rung', () => {
    const items = answerEvidence({ ...written, response: { text: 'x' }, awarded: 3, rungs: { 'arguing.thesis': 'accomplished', 'arguing.evidence': 'below' } });
    const of = (s: string) => items.find((i) => i.tags.includes(`skill:${s}`))!;
    expect(rungOf(of('arguing.thesis').share!)).toBe('accomplished');
    expect(rungOf(of('arguing.evidence').share!)).toBe('below');
    expect(of('arguing.thesis').item).toBe('q1#skill:arguing.thesis');
    // The piece keeps the mark's share, and no rated skill is counted twice.
    const piece = items.find((i) => i.tags.includes('kp:kp_linked'))!;
    expect(piece.share).toBe(0.75);
    expect(piece.tags.some((t) => t.startsWith('skill:'))).toBe(false);
  });

  it('falls back to the mark’s share for a skill with no rung, and with no rubric gives one item', () => {
    const one = answerEvidence({ ...written, response: { text: 'x' }, awarded: 2, rungs: { 'arguing.thesis': 'excellent' } });
    expect(one.find((i) => i.tags.includes('skill:arguing.evidence'))!.share).toBe(0.5);
    expect(answerEvidence({ ...written, response: { text: 'x' }, awarded: 2 })).toHaveLength(1);
    expect(answerEvidence({ ...written, response: { text: 'x' }, awarded: 2, rungs: { 'arguing.thesis': 'nope' } })).toHaveLength(1);
  });

  it('drops the mark’s item when every tag on it is rated, so it never falls back to the lesson', () => {
    const q = splitQuestion(QuizQuestionSchema.parse({ id: 'q2', kind: 'short_answer', prompt: 'p', marks: 2, accepted: ['x'], skills: ['arguing.thesis'], outcomes: ['o9'] }));
    const items = answerEvidence({ ...q, response: { text: 'x' }, awarded: 1, rungs: { 'arguing.thesis': 'skilled' } });
    expect(items.map((i) => i.tags)).toEqual([['skill:arguing.thesis', 'out:o9']]);
    expect(items[0]!.share).toBe(RUNG_CUTS.skilled);
  });

  it('brings rungs on written work and viva takes into the markbook’s evidence', () => {
    const column = { id: 'c1', kind: 'assessment', title: 'T', date: '2026-10-01', criteria: [{ id: 'k1', label: 'L', max: 10, outcomes: ['o1'], skill: 'arguing.thesis' }] };
    const view = {
      markbook: { columns: [column], marks: { c1: { s1: { criteria: { k1: 5 } } } }, hidden_quizzes: [] }, students: [], quizzes: [],
      rubrics: [
        { student: 's1', piece: 'w:L1:b1', lesson_id: 'L1', title: 'Task', at: '2026-10-02T01:00:00Z', skills: { 'arguing.thesis': 'skilled' }, column_id: 'c1' },
        { student: 's1', piece: 'v:L1:b2', lesson_id: 'L1', title: 'Viva', at: '2026-10-03T01:00:00Z', skills: { 'arguing.evidence': 'excellent' } }
      ]
    } as unknown as MarkbookView;
    const { evidence, sources } = markbookEvidence(view);
    expect(evidence.find((e) => e.source === 'assess:c1')!.tags).toEqual(['out:o1']);
    const work = evidence.filter((e) => e.source === 'work:L1');
    expect(work.map((e) => [e.tags[0], rungOf(e.share!)])).toEqual([['skill:arguing.thesis', 'skilled'], ['skill:arguing.evidence', 'excellent']]);
    expect(sources.filter((s) => s.source === 'work:L1')).toHaveLength(1);
    const [chained] = withPointTags(work, new Map(), new Map(), chain());
    expect(chained!.tags).toEqual(['skill:arguing.thesis', 'dp:harbours:R1', 'dp:harbours:R2', 'out:o2', 'out:o3']);
  });

  it('builds its rows from the tags', () => {
    const block = { settings: { deep_targets: ['kp_nopoint'], deep_skills: ['arguing.evidence'], deep_step: [{ du: 'du_ab12cd', step: '3', checks: ['Compares'] }, { du: 'du_gone11', step: '4', checks: [] }] } } as never;
    const tags = rubricTags(block, { skills: ['arguing.thesis'], pieces: ['kp_linked'] });
    const rows = rubricRows(tags, { continuum, deep: [du] });
    expect(rows.skills.map((s) => [s.ref, s.name])).toEqual([['arguing.thesis', 'Thesis'], ['arguing.evidence', 'Evidence']]);
    expect(rows.skills[0]!.rungs.map((r) => r.id)).toEqual(['below', 'capable', 'skilled', 'accomplished', 'excellent']);
    expect(rows.skills[0]!.rungs[2]!.indicators[0]!.text).toBe('Looks like skilled');
    expect(rows.pieces.map((p) => p.text)).toEqual(['The old pier', 'The tide table']);
    expect(rows.steps.map((s) => [s.key, s.du_number, s.checks])).toEqual([['du_ab12cd:3', 1, ['Compares']], ['du_gone11:4', 0, []]]);
  });

  it('suggests a mark from the rungs and a next step from the lowest', () => {
    const skills = { 'arguing.thesis': 'accomplished', 'arguing.evidence': 'capable' } as const;
    expect(suggestedMark({ skills }, 4)).toBe(2.5);
    expect(suggestedMark({ skills: {} }, 4)).toBeNull();
    expect(lowestSkill({ skills })).toEqual({ skill: 'arguing.evidence', rung: 'capable' });
    const ladder = ['l0', 'l1', 'l2', 'l3', 'l4'];
    const code = { id: 'ev', hidden: false, skill: 'arguing.evidence', ladder } as never;
    const bank = { ev: { lines: ['b0', 'b1', 'b2', 'b3', 'b4'], edited: [false, false, false, false, false], source: 's' } };
    expect(suggestedNextStep({ skills }, { codes: [code], bank })).toEqual({ text: 'b1', code_id: 'ev', skill: 'arguing.evidence', rung: 'capable' });
    expect(suggestedNextStep({ skills }, { codes: [code] })?.text).toBe('l1');
    expect(suggestedNextStep({ skills: { 'arguing.thesis': 'skilled' } }, { codes: [], continuum })?.text).toBe('Move on to accomplished');
    expect(suggestedNextStep({ skills: {} }, { codes: [] })).toBeNull();
  });

  it('cleans what the server is sent', () => {
    expect(cleanRubric({ skills: { 'arguing.thesis': 'skilled', bad: 'skilled', 'arguing.evidence': 'huge' }, pieces: { kp_linked: 'used', kp_nopoint: 'maybe' }, steps: { 'du_ab12cd:3': { checks: [true, 'x'], pass: true }, 'du_ab12cd:9': { pass: true } }, next_step: { text: ' Name it. ', code_id: 'ev' } }))
      .toEqual({ skills: { 'arguing.thesis': 'skilled' }, pieces: { kp_linked: 'used' }, steps: { 'du_ab12cd:3': { checks: [true, false], pass: true } }, next_step: { text: 'Name it.', code_id: 'ev' } });
    expect(cleanRubric({ skills: {} })).toBeNull();
    expect(cleanRubric('x')).toBeNull();
  });

  it('tallies, and shows students only their own side', () => {
    const r = { skills: { 'arguing.thesis': 'skilled' }, pieces: { kp_linked: 'used', kp_nopoint: 'missed' }, steps: { 'du_ab12cd:3': { checks: [true, false], pass: true } }, next_step: { text: 'Name it.' } } as const;
    expect(rubricTally(r as never)).toEqual({ skills: 1, lowest: 'skilled', used: 1, missed: 1, checks: 1, passed: 1 });
    expect(writingTick(r as never)).toEqual({ used: ['kp_linked'], missed: ['kp_nopoint'] });
    expect(studentRubric(r as never)).toEqual({ skills: { 'arguing.thesis': 'skilled' }, pieces_used: ['kp_linked'], next_step: 'Name it.' });
  });

  it('moves steps in order, blocks a skipped one, and steps back when a pass comes off', () => {
    const pass = { checks: [], pass: true };
    expect(stepMoves({ steps: { 'du_ab12cd:2b': pass, 'du_ab12cd:2a': pass } }, null, {})).toEqual({ moves: [{ du: 'du_ab12cd', step: '2b' }], blocked: [] });
    expect(stepMoves({ steps: { 'du_ab12cd:4': pass } }, null, { du_ab12cd: '2a' })).toEqual({ moves: [], blocked: ['du_ab12cd:4'] });
    expect(stepMoves({ steps: { 'du_ab12cd:2a': pass } }, null, { du_ab12cd: '3' }).moves).toEqual([]);
    expect(stepMoves({ steps: {} }, { steps: { 'du_ab12cd:3': pass } }, { du_ab12cd: '3' }).moves).toEqual([{ du: 'du_ab12cd', step: '2b' }]);
    expect(stepMoves({ steps: {} }, { steps: { 'du_ab12cd:2a': pass } }, { du_ab12cd: '2a' }).moves).toEqual([{ du: 'du_ab12cd', step: null }]);
    expect(stepMoves({ steps: {} }, { steps: { 'du_ab12cd:2a': pass } }, { du_ab12cd: '3' }).moves).toEqual([]);
  });
});
