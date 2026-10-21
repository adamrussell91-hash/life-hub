import { afterEach, describe, expect, it, vi } from 'vitest';
import tableJson from '@/data/literary-elements.json';
import type { Block } from '@/schemas/block';
import { BlockSchema } from '@/schemas/block';
import { ClassSchema, type Class } from '@/schemas';
import { renderBlock } from '@/blocks/render';
import { createBlock, BLOCK_GROUPS } from '@/blocks/create-block';
import { createBlockEditor } from '@/blocks/editors';
import { setLiteraryElementsForTests, type LiteraryElementsTable } from '@/blocks/literary-elements';
import { resetCurriculumStateForTests } from '@/app/curriculum-state';
import type { CurriculumResponse } from '@/teacher/nav';
import {
  allNames,
  countdownState,
  daysBetween,
  defaultClassId,
  formatClock,
  makeGroups,
  numberChoices,
  parseStudentList,
  pickableNames,
  skipTimer,
  startTimerRun,
  tickTimerRun,
  timerProgress,
  toolsFor
} from '@/blocks/classroom-tools/logic';
import { renderCountdownContent } from '@/blocks/classroom-tools/render';
import { forgetToolboxStateForTests } from '@/blocks/classroom-tools/toolbox';
import { mountClassStudents } from '@/teacher/sections/class-students';
import { filterBlocksForStudent } from '@/blocks/visibility';
import { approveTechniques, createTechniqueScan, normaliseTechniqueFindings } from '@/blocks/technique-scan';
import { defaultApproval } from '@/blocks/technique-review';

const table = tableJson as unknown as LiteraryElementsTable;

type Divider = Extract<Block, { block_type: 'divider' }>;
type Tools = Extract<Block, { block_type: 'classroom_tools' }>;
type Countdown = Extract<Block, { block_type: 'countdown' }>;

const STAMP = { created_at: '2026-10-18T00:00:00.000Z', updated_at: '2026-10-18T00:00:00.000Z', schema_version: 1 };

function divider(content: Record<string, unknown> = {}): Divider {
  return BlockSchema.parse({ id: 'd1', type: 'block', block_type: 'divider', visibility: 'student_teacher', content, ...STAMP }) as Divider;
}

function toolsBlock(content: Record<string, unknown> = {}): Tools {
  return BlockSchema.parse({ id: 't1', type: 'block', block_type: 'classroom_tools', visibility: 'student_teacher', content, ...STAMP }) as Tools;
}

function classRecord(id: string, code: string, students: Array<{ name: string; skip_picker?: boolean }>): Class {
  return ClassSchema.parse({
    id,
    type: 'class',
    title: code,
    slug: code.toLowerCase(),
    schema_version: 1,
    code,
    academic_year: 2026,
    year_id: 'year_9',
    subject_id: 'english',
    active_unit_ids: [],
    status: 'active',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    students
  });
}

function seedCurriculum(classes: Class[], scheduled: Array<{ class_id: string; lesson_id: string; date: string }> = []): void {
  resetCurriculumStateForTests({
    years: [],
    subjects: [],
    units: [],
    lessons: [],
    classes,
    scheduled_lessons: scheduled as CurriculumResponse['scheduled_lessons'],
    scope_sequences: [],
    media: [],
    schedule_anchor_date: '2026-10-18'
  });
}

function chipLabels(root: HTMLElement): string[] {
  return [...root.querySelectorAll<HTMLButtonElement>('.ct-chip[data-tool]')].map((chip) => chip.textContent ?? '');
}

afterEach(() => {
  forgetToolboxStateForTests();
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe('classroom tools logic', () => {
  it('runs a stack of timers, rolling straight into the next one', () => {
    let run = startTimerRun([{ label: 'Reading time', minutes: 5 }, { label: 'Writing time', minutes: 10 }]);
    run = { ...run, running: true };
    let step = tickTimerRun(run, 4 * 60_000);
    expect(step.changed).toBe(0);
    expect(formatClock(step.run.left)).toBe('1:00');
    step = tickTimerRun(step.run, 90_000);
    expect(step.changed).toBe(1);
    expect(step.run.index).toBe(1);
    expect(formatClock(step.run.left)).toBe('9:30');
    expect(timerProgress(step.run)[0]).toBe(1);
    step = tickTimerRun(step.run, 10 * 60_000);
    expect(step.finished).toBe(true);
    expect(step.run.done).toBe(true);
    expect(skipTimer(startTimerRun([{ label: 'A', minutes: 1 }])).done).toBe(true);
  });

  it('falls back to a single five minute timer when nothing is saved', () => {
    const run = startTimerRun([]);
    expect(run.stack).toEqual([{ label: 'Timer', minutes: 5 }]);
  });

  it('gives students the timer, stopwatch, technique, coin and dice only', () => {
    expect(toolsFor('student')).toEqual(['timer', 'stopwatch', 'technique', 'coin', 'dice']);
    expect(toolsFor('teacher')).toContain('names');
  });

  it('leaves skipped students out of the picker but not out of groups', () => {
    const students = [{ name: 'Ava', skip_picker: false }, { name: 'Eli', skip_picker: true }, { name: 'Mia', skip_picker: false }];
    expect(pickableNames(students)).toEqual(['Ava', 'Mia']);
    expect(allNames(students)).toEqual(['Ava', 'Eli', 'Mia']);
  });

  it('makes even groups of about the size asked for', () => {
    const names = Array.from({ length: 22 }, (_, i) => `S${i}`);
    const groups = makeGroups(names, 4, () => 0.5);
    expect(groups.length).toBe(6);
    expect(groups.flat().sort()).toEqual([...names].sort());
    const sizes = groups.map((g) => g.length);
    expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
  });

  it('draws numbers without repeats when asked', () => {
    expect(numberChoices(5, 1)).toEqual([1, 2, 3, 4, 5]);
    expect(numberChoices(1, 5, new Set([2, 4]), true)).toEqual([1, 3, 5]);
  });

  it('counts every calendar day to the due date', () => {
    // Friday to the following Monday: weekends count.
    expect(daysBetween('2026-10-16', '2026-10-19')).toBe(3);
    expect(countdownState({ due_date: '2026-10-30', set_date: '2026-10-11' }, '2026-10-18')).toEqual({
      kind: 'upcoming',
      days: 12,
      total: 19,
      gone: 7
    });
    expect(countdownState({ due_date: '2026-10-18' }, '2026-10-18').kind).toBe('today');
    expect(countdownState({ due_date: '2026-10-15' }, '2026-10-18')).toEqual({ kind: 'past', days: 3 });
    expect(countdownState({ due_date: '' }, '2026-10-18').kind).toBe('unset');
  });

  it("picks today's class, else the most recent, else the next", () => {
    const scheduled = [
      { class_id: 'a', date: '2026-10-10' },
      { class_id: 'b', date: '2026-10-15' },
      { class_id: 'c', date: '2026-10-25' }
    ];
    expect(defaultClassId(['a', 'b', 'c'], scheduled, '2026-10-18')).toBe('b');
    expect(defaultClassId(['a', 'b', 'c'], [...scheduled, { class_id: 'c', date: '2026-10-18' }], '2026-10-18')).toBe('c');
    expect(defaultClassId(['a', 'c'], scheduled, '2026-10-18', 'c')).toBe('c');
    expect(defaultClassId([], scheduled, '2026-10-18')).toBeNull();
  });

  it('reads a pasted class list and keeps skips by name', () => {
    const list = parseStudentList('Ava\n  Noah  \n\nava\nMia\tLeo', [{ name: 'Mia', skip_picker: true }]);
    expect(list).toEqual([
      { name: 'Ava', skip_picker: false },
      { name: 'Noah', skip_picker: false },
      { name: 'Mia', skip_picker: true },
      { name: 'Leo', skip_picker: false }
    ]);
  });
});

describe('divider and Tools block', () => {
  it('old dividers parse with tools on and no saved timers', () => {
    expect(divider().content).toEqual({ tools: true, timer_stack: [] });
    expect(createBlock('divider').content).toEqual({ tools: true, timer_stack: [] });
    expect(BLOCK_GROUPS.find((g) => g.label === 'Teaching')?.types).toEqual(['outcomes', 'classroom_tools', 'countdown']);
  });

  it('shows a faint gear on the divider; the tray slides out and a tool opens in the gap', () => {
    const el = renderBlock(divider(), 'teacher');
    document.body.append(el);
    const host = el.querySelector<HTMLElement>('.ct-host')!;
    const gear = host.querySelector<HTMLButtonElement>('.ct-trigger')!;
    expect(host.classList.contains('is-tray-out')).toBe(false);
    gear.click();
    expect(host.classList.contains('is-tray-out')).toBe(true);
    expect(chipLabels(host)).toEqual(['Timer', 'Stopwatch', 'Names', 'Number', 'Groups', 'Technique', 'Scores', 'Coin', 'Dice']);
    host.querySelector<HTMLButtonElement>('.ct-chip[data-tool="dice"]')!.click();
    expect(host.classList.contains('is-open')).toBe(true);
    expect(host.querySelectorAll('.ct-die').length).toBe(2);
    host.querySelector<HTMLButtonElement>('[aria-label="Close tool"]')!.click();
    expect(host.classList.contains('is-open')).toBe(false);
  });

  it('keeps the tray as the teacher left it when the builder re-renders the block', () => {
    const first = renderBlock(toolsBlock(), 'teacher').querySelector<HTMLElement>('.ct-host')!;
    expect(first.classList.contains('is-tray-out')).toBe(true);
    first.querySelector<HTMLButtonElement>('.ct-trigger')!.click();
    expect(first.classList.contains('is-tray-out')).toBe(false);
    const again = renderBlock(toolsBlock(), 'teacher').querySelector<HTMLElement>('.ct-host')!;
    expect(again.classList.contains('is-tray-out')).toBe(false);
    // A new start tool is a new setting and opens.
    const changed = renderBlock(toolsBlock({ start_tool: 'dice' }), 'teacher').querySelector<HTMLElement>('.ct-host')!;
    expect(changed.classList.contains('is-open')).toBe(true);
  });

  it('students get the student tools only', () => {
    const el = renderBlock(divider(), 'student');
    expect(chipLabels(el)).toEqual(['Timer', 'Stopwatch', 'Technique', 'Coin', 'Dice']);
  });

  it('a divider with tools off, and every divider in print, is just a rule', () => {
    expect(renderBlock(divider({ tools: false }), 'teacher').querySelector('.ct-host')).toBeNull();
    expect(renderBlock(divider(), 'print').querySelector('hr.block-divider')).not.toBeNull();
    expect(renderBlock(divider(), 'print').querySelector('.ct-host')).toBeNull();
  });

  it('opens on the saved timer stack', () => {
    const el = renderBlock(
      toolsBlock({ start_tool: 'timer', timer_stack: [{ label: 'Reading time', minutes: 5 }, { label: 'Writing time', minutes: 10 }] }),
      'student'
    );
    expect(el.querySelector('.ct-big--time')?.textContent).toBe('5:00');
    expect(el.querySelector('.ct-sub')?.textContent).toBe('Reading time · then Writing time');
    // Presets are the teacher's; students just run their own copy.
    expect(el.querySelector('.ct-presets')).toBeNull();
  });

  it('falls back to the tool row when students cannot use the start tool', () => {
    const el = renderBlock(toolsBlock({ start_tool: 'names' }), 'student');
    expect(el.querySelector('.ct-host')?.classList.contains('is-open')).toBe(false);
    expect(el.querySelector('.ct-host')?.classList.contains('is-tray-out')).toBe(true);
  });

  it('saves the timer stack and the tools switch from the divider editor', () => {
    const onChange = vi.fn();
    const editor = createBlockEditor(divider(), onChange);
    document.body.append(editor);
    const preset = [...editor.querySelectorAll<HTMLButtonElement>('.ct-chip')].find((b) => b.textContent === 'Think, Pair, Share')!;
    preset.click();
    expect(onChange.mock.lastCall?.[0].content.timer_stack).toEqual([
      { label: 'Think', minutes: 1 },
      { label: 'Pair', minutes: 2 },
      { label: 'Share', minutes: 3 }
    ]);
    const toggle = editor.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    toggle.checked = false;
    toggle.dispatchEvent(new Event('change'));
    expect(onChange.mock.lastCall?.[0].content.tools).toBe(false);
  });
});

describe('name picker and groups', () => {
  it('reads the class list at run time and never shows a total that gives a skip away', async () => {
    seedCurriculum(
      [
        classRecord('c1', '9ENG2', [{ name: 'Ava' }, { name: 'Eli', skip_picker: true }, { name: 'Mia' }]),
        classRecord('c2', '10ENG1', [])
      ],
      [{ class_id: 'c1', lesson_id: 'l1', date: '2026-10-18' }]
    );
    vi.spyOn(Math, 'random').mockReturnValue(0);
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    const el = renderBlock(toolsBlock({ start_tool: 'names' }), 'teacher', { lessonId: 'l1' });
    document.body.append(el);
    await vi.waitFor(() => expect(el.querySelector('.ct-big--name')).not.toBeNull());
    // Only classes with students are offered.
    expect([...el.querySelectorAll('select option')].map((o) => o.textContent)).toEqual(['9ENG2']);
    expect(el.querySelector('.ct-card__body .ct-sub')?.textContent).toBe('2 still to go');
    el.querySelector<HTMLButtonElement>('.ct-btn--go')!.click();
    expect(el.querySelector('.ct-big--name')?.textContent).toBe('Ava');
    el.querySelector<HTMLButtonElement>('.ct-btn--go')!.click();
    el.querySelector<HTMLButtonElement>('.ct-btn--go')!.click();
    expect(el.querySelector('.ct-big--name')?.textContent).toBe('Everyone has had a go');
    expect(el.textContent).not.toContain('Eli');
    vi.unstubAllGlobals();
  });

  it('groups include skipped students', async () => {
    seedCurriculum([classRecord('c1', '9ENG2', [{ name: 'Ava' }, { name: 'Eli', skip_picker: true }, { name: 'Mia' }, { name: 'Leo' }])]);
    const el = renderBlock(toolsBlock({ start_tool: 'groups' }), 'teacher');
    document.body.append(el);
    await vi.waitFor(() => expect(el.querySelectorAll('.ct-group').length).toBeGreaterThan(0));
    expect(el.querySelector('.ct-groups')?.textContent).toContain('Eli');
  });

  it('says where to add students when no class has a list', async () => {
    seedCurriculum([classRecord('c1', '9ENG2', [])]);
    const el = renderBlock(toolsBlock({ start_tool: 'names' }), 'teacher');
    await vi.waitFor(() => expect(el.querySelector('.ct-empty')?.textContent).toContain('add the students under Students'));
  });
});

describe('Students section on a class page', () => {
  it('saves a pasted list and a skip, and only shows skips here', async () => {
    const cls = classRecord('c1', '9ENG2', []);
    const save = vi.fn(async () => undefined);
    const host = document.createElement('div');
    document.body.append(host);
    mountClassStudents(host, cls, { save });
    host.querySelector<HTMLButtonElement>('.class-students__edit')!.click();
    host.querySelector<HTMLTextAreaElement>('textarea')!.value = 'Ava\nNoah\nMia';
    host.querySelector<HTMLButtonElement>('.btn--primary')!.click();
    await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save.mock.calls[0]).toEqual(['c1', [
      { name: 'Ava', skip_picker: false },
      { name: 'Noah', skip_picker: false },
      { name: 'Mia', skip_picker: false }
    ]]);
    await vi.waitFor(() => expect(host.querySelectorAll('.class-students__row').length).toBe(3));
    const skip = host.querySelector<HTMLInputElement>('#class-students-skip-c1-1')!;
    skip.checked = true;
    skip.dispatchEvent(new Event('change'));
    await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    expect(save.mock.calls[1][1][1]).toEqual({ name: 'Noah', skip_picker: true });
  });

  it('keeps the old list and says why when the save fails', async () => {
    const cls = classRecord('c1', '9ENG2', [{ name: 'Ava' }]);
    const host = document.createElement('div');
    mountClassStudents(host, cls, { save: async () => { throw new Error('Offline'); } });
    host.querySelector<HTMLButtonElement>('.class-students__edit')!.click();
    host.querySelector<HTMLTextAreaElement>('textarea')!.value = 'Ava\nNoah';
    host.querySelector<HTMLButtonElement>('.btn--primary')!.click();
    await vi.waitFor(() => expect(host.querySelector('.class-students__status')?.textContent).toBe('Not saved: Offline'));
    expect(host.querySelector('.class-students__count')?.textContent).toBe('1');
  });
});

describe('countdown header', () => {
  const block = (content: Partial<Countdown['content']>) =>
    BlockSchema.parse({ id: 'c', type: 'block', block_type: 'countdown', visibility: 'student_teacher', content, ...STAMP }) as Countdown;

  it('shows the task, the due day and the days left', () => {
    const el = renderCountdownContent(block({ title: 'Narrative writing task', due_date: '2026-10-30', due_time: '15:00', set_date: '2026-10-11' }), 'student', '2026-10-18');
    expect(el.querySelector('.countdown__title')?.textContent).toBe('Narrative writing task');
    expect(el.querySelector('.countdown__due')?.textContent).toBe('Due Friday 30 October, 3:00 pm');
    expect(el.querySelector('.countdown__n')?.textContent).toBe('12');
    expect(el.querySelectorAll('.countdown__ticks i').length).toBe(19);
    expect(el.querySelectorAll('.countdown__ticks i.is-gone').length).toBe(7);
  });

  it('handles today, past and unset', () => {
    expect(renderCountdownContent(block({ due_date: '2026-10-18' }), 'student', '2026-10-18').textContent).toContain('due today');
    expect(renderCountdownContent(block({ due_date: '2026-10-17' }), 'student', '2026-10-18').textContent).toContain('due yesterday');
    expect(renderCountdownContent(block({}), 'student', '2026-10-18').textContent).toContain('Due date to be set');
  });

  it('rejects a malformed due date', () => {
    expect(() => block({ due_date: '30/10/2026' })).toThrow();
  });
});

describe('technique spinner', () => {
  const findings = normaliseTechniqueFindings(
    [
      { quote: 'clear and sunny', techniques: [{ technique: 'Visual Imagery', confidence: 82, explanation: 'Sight.' }, { technique: 'Foreshadowing', confidence: 35, explanation: 'Too bright.' }] },
      { quote: 'of course', techniques: [{ technique: 'Understatement', confidence: 55, explanation: 'Casual.' }] }
    ],
    table
  );

  it('pre-ticks Likely finds on a fresh scan, then keeps the teacher’s ticks', () => {
    const fresh = createTechniqueScan(findings);
    expect(defaultApproval(fresh)).toEqual(['visual-imagery']);
    const reviewed = approveTechniques(fresh, ['understatement']);
    expect(defaultApproval(reviewed)).toEqual(['understatement']);
  });

  it('only spins through approved techniques, and only those reach students', async () => {
    setLiteraryElementsForTests(table);
    const scan = approveTechniques(createTechniqueScan(findings), ['foreshadowing', 'understatement']);
    const text = BlockSchema.parse({
      id: 'r1',
      type: 'block',
      block_type: 'rich_text',
      visibility: 'student_teacher',
      content: { html: '<p>The morning was clear and sunny, of course.</p>' },
      settings: { technique_scan: scan },
      ...STAMP
    }) as Block;
    const [published] = filterBlocksForStudent([text]);
    const shipped = published.settings?.technique_scan as { findings: Array<{ techniques: Array<Record<string, unknown>> }> };
    expect(shipped.findings.flatMap((f) => f.techniques.map((t) => t.id)).sort()).toEqual(['foreshadowing', 'understatement']);
    expect(JSON.stringify(shipped)).not.toContain('Too bright');

    const el = renderBlock(toolsBlock({ start_tool: 'technique' }), 'student', { pageBlocks: [published] });
    document.body.append(el);
    await vi.waitFor(() => expect(el.querySelectorAll('.ct-tag--tech').length).toBe(2));
    // Scan order: strongest reading first.
    expect([...el.querySelectorAll('.ct-tag--tech')].map((t) => t.textContent)).toEqual(['Understatement', 'Foreshadowing']);
    // Students don't choose the prompt.
    expect(el.querySelector('[id^="ct-tech-mode"]')).toBeNull();
    setLiteraryElementsForTests(null);
  });

  it('tells students when nothing is set yet', async () => {
    setLiteraryElementsForTests(table);
    const el = renderBlock(toolsBlock({ start_tool: 'technique' }), 'student', { pageBlocks: [] });
    await vi.waitFor(() => expect(el.querySelector('.ct-empty')?.textContent).toBe('Your teacher has not set any techniques for this page yet.'));
    setLiteraryElementsForTests(null);
  });
});
