import { describe, it, expect } from 'vitest';
import { createBlock } from '@/blocks/create-block';
import type { Block } from '@/schemas/block';
import { LessonSchema } from '@/schemas/lesson';
import { conditionsApply, lessonConditions, longestContentRun, studentSequence, type ConditionId } from '@/conditions/lesson-conditions';
import { revisitsFor, spacingPlan, daysBetween } from '@/conditions/spacing';
import { lessonTags, readinessGroups, slotNotes } from '@/conditions/readiness';
import { dotPointWords } from '@/conditions/spacing-panel';
import type { Evidence } from '@/evidence/types';
import type { Alignment } from '@/alignment/schema';

/* Invented lessons, students and syllabus. */

let n = 0;
const block = (type: Parameters<typeof createBlock>[0], patch: Record<string, unknown> = {}): Block =>
  ({ ...createBlock(type, `b${++n}`), ...patch }) as Block;
const text = (html = '<p>Lighthouses guide ships into the harbour.</p>') => block('rich_text', { content: { html } });
const state = (blocks: Block[], id: ConditionId, off: string[] = []) => lessonConditions({ blocks, off }).find((c) => c.id === id)!.state;

describe('lesson conditions', () => {
  it('finds retrieval before the first new content', () => {
    expect(state([block('flashcards'), text()], 'activate')).toBe('present');
    expect(state([text(), block('flashcards')], 'activate')).toBe('missing');
    expect(state([block('question_set')], 'activate')).toBe('not_relevant');
  });

  it('flags a long run of new content with no check', () => {
    const long = [text(), text(), text(), text()];
    expect(state(long, 'chunks')).toBe('missing');
    expect(state([text(), text(), block('hinge_question'), text(), text()], 'chunks')).toBe('present');
    expect(longestContentRun(studentSequence([text(), block('self_check'), text(), text()])).blocks).toHaveLength(2);
  });

  it('flags a single content block that is too long to take in at once', () => {
    const words = Array.from({ length: 700 }, () => 'tide').join(' ');
    expect(state([text(`<p>${words}</p>`), block('self_check')], 'chunks')).toBe('missing');
  });

  it('needs a check between the new content and the end', () => {
    expect(state([text(), block('hinge_question'), text(), block('done')], 'check')).toBe('present');
    // A check that is the very last block is a close, not a mid-lesson check.
    expect(state([text(), block('self_check')], 'check')).toBe('missing');
  });

  it('wants a faded example before independent questions', () => {
    expect(state([text(), block('faded_example'), block('question_set')], 'worked')).toBe('present');
    expect(state([text(), block('question_set')], 'worked')).toBe('missing');
    expect(state([text()], 'worked')).toBe('not_relevant');
  });

  it('checks the lesson ends with writing or recall', () => {
    expect(state([text(), block('done')], 'close')).toBe('present');
    expect(state([block('self_check'), text()], 'close')).toBe('missing');
  });

  it('counts a lens or levelled format as support and extend', () => {
    expect(state([text(), block('question_set', { lenses: [{ id: 'windows_mirrors', config: {} }] })], 'levels')).toBe('present');
    const qs = block('question_set');
    expect(state([text(), { ...qs, content: { ...(qs.content as object), format: 'because_but_so' } } as Block], 'levels')).toBe('present');
    expect(state([text(), block('question_set')], 'levels')).toBe('missing');
  });

  it('reads inside sections, skips teacher-only blocks and structure', () => {
    const section = block('section', { content: { title: '', blocks: [block('flashcards'), text()] } });
    const note = block('callout', { visibility: 'teacher_only' });
    const seq = studentSequence([block('heading'), note, section]);
    expect(seq.map((b) => b.block_type)).toEqual(['flashcards', 'rich_text']);
    expect(state([note, section], 'activate')).toBe('present');
  });

  it('keeps a set-aside condition off, but not one that is not relevant', () => {
    expect(state([text()], 'close', ['close'])).toBe('off');
    expect(state([text()], 'worked', ['worked'])).toBe('not_relevant');
  });

  it('does not apply to quiz or assessment lessons', () => {
    expect(conditionsApply('assessment')).toBe(false);
    expect(conditionsApply('quiz')).toBe(false);
    expect(conditionsApply('lesson')).toBe(true);
    expect(conditionsApply(undefined)).toBe(true);
  });

  it('saves set-aside conditions on the lesson and rejects unknown ids', () => {
    const field = LessonSchema.shape.conditions_off;
    expect(field.parse(['close', 'levels'])).toEqual(['close', 'levels']);
    expect(field.parse(undefined)).toBeUndefined();
    expect(field.safeParse(['learning_styles']).success).toBe(false);
  });
});

describe('spacing plan', () => {
  const lessons = [
    { id: 'a', title: 'Reading the harbour', dot_points: ['harbours:U1', 'harbours:U2'], date: '2026-03-02T09:00' },
    { id: 'b', title: 'Mapping the lights', dot_points: ['harbours:U2'], date: '2026-03-03T09:00' },
    { id: 'c', title: 'Tides', dot_points: ['harbours:R1'], date: '2026-03-04T09:00' },
    { id: 'd', title: 'Storm writing', dot_points: ['harbours:U2'], date: '2026-03-10T11:00' },
    { id: 'e', title: 'Revision', date: '2026-03-16T09:00' },
    { id: 'f', title: 'Task', date: '2026-03-18T09:00', assessment: true },
    { id: 'g', title: 'Undated', dot_points: ['harbours:U3'] }
  ];

  it('counts days by calendar date', () => {
    expect(daysBetween('2026-03-02T15:00', '2026-03-03T08:00')).toBe(1);
  });

  it('marks a point taught again days later as spaced', () => {
    const plan = spacingPlan(lessons);
    expect(plan.find((r) => r.ref === 'harbours:U2')!.spaced).toBe(true);
    expect(plan.find((r) => r.ref === 'harbours:U2')!.stops).toEqual([]);
  });

  it('places a taught-once point next lesson, a week on, and before the assessment', () => {
    const u1 = spacingPlan(lessons).find((r) => r.ref === 'harbours:U1')!;
    expect(u1.spaced).toBe(false);
    expect(u1.stops.map((s) => [s.lessonId, s.why, s.gap])).toEqual([
      ['b', 'next', 1],
      ['d', 'week', 8],
      ['e', 'before_assessment', 14]
    ]);
  });

  it('never places a revisit in the assessment or in a lesson that teaches the point', () => {
    for (const row of spacingPlan(lessons)) {
      for (const stop of row.stops) {
        expect(stop.lessonId).not.toBe('f');
        expect(lessons.find((l) => l.id === stop.lessonId)!.dot_points ?? []).not.toContain(row.ref);
      }
    }
  });

  it('leaves out undated lessons and lists points needing spacing first', () => {
    const plan = spacingPlan(lessons);
    expect(plan.some((r) => r.ref === 'harbours:U3')).toBe(false);
    expect(plan[0]!.spaced).toBe(false);
  });

  it('tells a lesson which earlier points to bring back', () => {
    const forD = revisitsFor(spacingPlan(lessons), 'd').map((r) => r.row.ref);
    expect(forD).toEqual(expect.arrayContaining(['harbours:U1', 'harbours:R1']));
  });

  it('labels a dot point from the alignment, or falls back to its id', () => {
    const doc = { focus_areas: [{ id: 'harbours', points: [{ id: 'U1', short: 'Read the harbour' }] }] } as unknown as Alignment;
    expect(dotPointWords(doc, 'harbours:U1')).toBe('U1 Read the harbour');
    expect(dotPointWords(null, 'harbours:U1')).toBe('U1');
  });
});

describe('readiness', () => {
  const ev = (student: string, tag: string, share: number | null): Evidence =>
    ({ item: `${student}-${tag}-${share}`, tags: [tag], share, why: [], student, source: 'quiz1', date: '2026-03-01', confidence: null }) as Evidence;

  it('builds the tags a lesson is about', () => {
    expect(lessonTags({ dot_points: ['harbours:U1'], focus_pieces: ['p1'], focus_skills: ['analysis.a1'] })).toEqual(['dp:harbours:U1', 'kp:p1', 'skill:analysis.a1']);
  });

  it('groups by the markbook bands on the lesson’s tags only', () => {
    const evidence = [
      ev('ana', 'dp:harbours:U1', 0.2), ev('ana', 'dp:harbours:U1', 0.3),
      ev('ben', 'dp:harbours:U1', 0.9), ev('ben', 'kp:p1', 1),
      ev('cal', 'dp:harbours:U1', 0.6), ev('cal', 'dp:harbours:U1', 0.7),
      ev('dee', 'dp:harbours:U1', 0.9), ev('dee', 'dp:storms:U1', 0.9),
      ev('eli', 'dp:harbours:U1', null), ev('eli', 'dp:harbours:U1', null)
    ];
    const groups = readinessGroups(evidence, ['ana', 'ben', 'cal', 'dee', 'eli'], ['dp:harbours:U1', 'kp:p1']);
    expect(groups).toEqual({ support: ['ana'], core: ['cal'], extend: ['ben'], unknown: ['dee', 'eli'] });
  });

  it('notes late, after-lunch and Friday slots, and nothing for a morning', () => {
    const notes = slotNotes([
      { className: '9A', date: '2026-03-02', start_time: '09:00' },
      { className: '9B', date: '2026-03-03', start_time: '14:10' },
      { className: '9C', date: '2026-03-04', start_time: '12:50' },
      { className: '9D', date: '2026-03-06', start_time: '09:00' }
    ]);
    expect(notes.map((x) => x.className)).toEqual(['9B', '9C', '9D']);
    expect(notes[0]!.reason).toContain('late in the day');
    expect(notes[1]!.reason).toContain('after lunch');
    expect(notes[2]!.reason).toContain('Friday');
  });
});

describe('conditions panel', () => {
  const lessonWith = (blocks: Block[], extra: Record<string, unknown> = {}) =>
    ({ id: 'l1', title: 'Harbour lights', blocks, ...extra }) as unknown as import('@/schemas/lesson').Lesson;

  it('shows gaps on the chip, asks the agent, and sets a gap aside', async () => {
    const { mountConditionsPanel } = await import('@/conditions/conditions-panel');
    let lesson = lessonWith([text(), text()]);
    const asked: string[] = [];
    const handle = mountConditionsPanel({
      getLesson: () => lesson,
      onOff: (ids) => { lesson = lessonWith(lesson.blocks, { conditions_off: ids }); handle.refresh(); },
      onAsk: (m) => asked.push(m)
    });
    document.body.append(handle.chip, handle.panel);
    handle.refresh();
    expect(handle.chip.textContent).toMatch(/to look at/);
    expect(handle.panel.hidden).toBe(true);
    handle.chip.click();
    expect(handle.panel.hidden).toBe(false);
    const close = handle.panel.querySelector<HTMLElement>('[data-condition="close"]')!;
    expect(close.className).toContain('lc__row--missing');
    [...close.querySelectorAll('button')].find((b) => b.textContent === 'Suggest a block')!.click();
    expect(asked[0]).toMatch(/closing block/);
    [...close.querySelectorAll('button')].find((b) => b.textContent === 'Not for this lesson')!.click();
    expect(lesson.conditions_off).toEqual(['close']);
    expect(handle.panel.querySelector('[data-condition="close"]')!.className).toContain('lc__row--off');
    // No score or percentage anywhere.
    expect(handle.panel.textContent).not.toMatch(/%|score/i);
    handle.chip.remove();
    handle.panel.remove();
  });

  it('says the check does not apply to a quiz lesson', async () => {
    const { mountConditionsPanel } = await import('@/conditions/conditions-panel');
    const handle = mountConditionsPanel({ getLesson: () => lessonWith([text()], { pedagogical_mode: 'quiz' }), onOff: () => {} });
    handle.chip.click();
    expect(handle.panel.textContent).toMatch(/do not apply/);
    expect(handle.panel.querySelector('[data-condition]')).toBeNull();
  });

  it('loads a class’s markbook on request and shows the three groups', async () => {
    const { mountConditionsPanel } = await import('@/conditions/conditions-panel');
    const ev = (student: string, share: number) => ({ item: `${student}${share}`, tags: ['dp:harbours:U1'], share, why: [], student, source: 'q', date: '2026-03-01', confidence: null });
    const handle = mountConditionsPanel({
      getLesson: () => lessonWith([text()], { dot_points: ['harbours:U1'] }),
      onOff: () => {},
      classes: () => [{ id: 'c1', name: '9A' }],
      loadClass: async () => ({
        students: [{ id: 's1', name: 'Rowan' }, { id: 's2', name: 'Kai' }],
        evidence: [ev('s1', 0.1), ev('s1', 0.2), ev('s2', 0.95), ev('s2', 0.9)] as Evidence[],
        scores: new Map(),
        took: {}
      })
    });
    handle.chip.click();
    [...handle.panel.querySelectorAll('button')].find((b) => b.textContent === 'Groups for 9A')!.click();
    await new Promise((r) => setTimeout(r, 0));
    const support = handle.panel.querySelector('.lc__group--support')!;
    const extend = handle.panel.querySelector('.lc__group--extend')!;
    expect(support.textContent).toContain('Rowan');
    expect(extend.textContent).toContain('Kai');
  });
});

describe('spacing panel on the unit map', () => {
  it('lists taught-once points with links to the lessons to bring them back in', async () => {
    const { mountSpacingPanel } = await import('@/conditions/spacing-panel');
    const host = document.createElement('div');
    mountSpacingPanel(host, {
      lessons: [
        { id: 'a', title: 'Reading the harbour', href: '/lessons/a', dot_points: ['harbours:U1'] },
        { id: 'b', title: 'Mapping the lights', href: '/lessons/b' },
        { id: 'c', title: 'Task', href: '/lessons/c', assessment: true }
      ],
      dates: new Map([['a', '2026-03-02T09:00'], ['b', '2026-03-09T09:00'], ['c', '2026-03-12T09:00']])
    });
    const links = [...host.querySelectorAll<HTMLAnchorElement>('a.lc-spacing__stop')];
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['/lessons/b']);
    expect(links[0]!.textContent).toContain('+7d');
    expect(host.textContent).toContain('Taught in “Reading the harbour”');
  });

  it('draws nothing when every point is spaced', async () => {
    const { mountSpacingPanel } = await import('@/conditions/spacing-panel');
    const host = document.createElement('div');
    mountSpacingPanel(host, {
      lessons: [{ id: 'a', title: 'A', dot_points: ['harbours:U1'] }, { id: 'b', title: 'B', dot_points: ['harbours:U1'] }],
      dates: new Map([['a', '2026-03-02T09:00'], ['b', '2026-03-09T09:00']])
    });
    expect(host.childElementCount).toBe(0);
  });
});
