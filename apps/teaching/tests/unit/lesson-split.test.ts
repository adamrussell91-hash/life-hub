import { describe, it, expect, vi, afterEach } from 'vitest';
import { openLessonSplit, splitCountSentences, type SplitRequest } from '@/teacher/lesson-split';

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const STATUS = {
  sections: [
    { id: 'sec_a', title: 'Warm-up', has_quiz_questions: false },
    { id: 'sec_b', title: 'Close reading', has_quiz_questions: true },
    { id: 'sec_c', title: 'Viva rehearsal', has_quiz_questions: false }
  ],
  mode: 'lesson',
  can_split: true,
  splits: []
};

const PREVIEW = {
  problems: [],
  parts: [{ name: 'Viva practice', role: 'support', sections: [{ id: 'sec_c', title: 'Viva rehearsal' }] }],
  counts: { students_with_work: 14, handins: 3, marked: 1, done_marks: 9 },
  notes: ['Quiz attempts stay with their questions.']
};

function fakeCall(overrides: Partial<Record<SplitRequest['action'], unknown>> = {}) {
  return vi.fn(async (body: SplitRequest) => {
    if (body.action in overrides) {
      const value = overrides[body.action];
      if (value instanceof Error) throw value;
      return value;
    }
    if (body.action === 'status') return STATUS;
    if (body.action === 'preview') return PREVIEW;
    if (body.action === 'split') {
      return { split_id: 'split_1', new_lessons: [{ id: 'lesson_new1', title: 'Viva practice', role: 'support' }], published: false };
    }
    return { restored: true };
  });
}

const card = () => document.querySelector<HTMLElement>('.lesson-split')!;
const buttonNamed = (label: string) =>
  [...card().querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === label)!;

function setValue(el: HTMLInputElement | HTMLSelectElement, value: string) {
  el.value = value;
  el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
}

async function fillOnePart() {
  const name = card().querySelector<HTMLInputElement>('.lesson-split__name')!;
  setValue(name, 'Viva practice');
  setValue(card().querySelector<HTMLSelectElement>('.lesson-split__role')!, 'support');
  const moves = card().querySelectorAll<HTMLSelectElement>('.lesson-split__move');
  const option = [...moves[2]!.options].find((o) => o.textContent === 'Viva practice')!;
  setValue(moves[2]!, option.value);
}

afterEach(() => {
  document.body.replaceChildren();
});

describe('openLessonSplit', () => {
  it("shows the reason and only a Close button when the lesson can't be split", async () => {
    const menuButton = document.createElement('button');
    document.body.append(menuButton);
    const call = fakeCall({ status: { ...STATUS, can_split: false, reason: 'A live quiz round is running.' } });
    openLessonSplit({ lessonId: 'lesson_x', call, returnFocus: menuButton });
    await flush();
    expect(card().textContent).toContain('A live quiz round is running.');
    const buttons = card().querySelectorAll('button');
    expect([...buttons].map((b) => b.textContent)).toEqual(['Close']);
    expect(card().querySelector('select')).toBeNull();
    buttonNamed('Close').click();
    expect(document.querySelector('.lesson-split')).toBeNull();
    expect(document.activeElement).toBe(menuButton);
  });

  it('lists sections with a quiz tag, names a new lesson and shows the preview as sentences', async () => {
    const call = fakeCall();
    openLessonSplit({ lessonId: 'lesson_x', call });
    await flush();
    expect(card().getAttribute('role')).toBe('dialog');
    expect(card().contains(document.activeElement)).toBe(true);
    const rows = card().querySelectorAll('.lesson-split__section');
    expect(rows).toHaveLength(3);
    expect(rows[1]!.querySelector('.lesson-split__tag')?.textContent).toBe('quiz');
    expect(rows[0]!.querySelector('.lesson-split__tag')).toBeNull();
    expect(card().textContent).toContain('Anything not in a section stays here.');
    expect(card().querySelector<HTMLSelectElement>('.lesson-split__move')!.value).toBe('');
    // Every control has a label.
    for (const control of card().querySelectorAll<HTMLInputElement | HTMLSelectElement>('input, select')) {
      expect(control.labels?.length ?? 0).toBeGreaterThan(0);
    }

    await fillOnePart();
    expect(buttonNamed('Split').disabled).toBe(true);
    buttonNamed('Check').click();
    await flush();

    expect(call).toHaveBeenLastCalledWith({
      action: 'preview',
      parts: [{ name: 'Viva practice', role: 'support', section_ids: ['sec_c'], whole_class: false }]
    });
    const text = card().querySelector('.lesson-split__preview')!.textContent!;
    expect(text).toContain("14 students have work in the sections you're moving.");
    expect(text).toContain('3 hand-ins and 1 marked piece come across.');
    expect(text).toContain('9 done ticks carry over.');
    expect(text).toContain("Nothing is deleted from this lesson's records, and you can undo the split.");
    expect(text).toContain('Quiz attempts stay with their questions.');
    expect(buttonNamed('Split').disabled).toBe(false);
  });

  it('shows the whole-class box only for non-core lessons and allows up to three', async () => {
    openLessonSplit({ lessonId: 'lesson_x', call: fakeCall() });
    await flush();
    const whole = () => card().querySelector<HTMLElement>('.lesson-split__whole')!;
    expect(whole().hidden).toBe(true);
    setValue(card().querySelector<HTMLSelectElement>('.lesson-split__role')!, 'extension');
    expect(whole().hidden).toBe(false);
    expect(whole().textContent).toContain("Otherwise only students you tick, and anyone who's already started it, will see it.");
    buttonNamed('Add another').click();
    buttonNamed('Add another').click();
    expect(card().querySelectorAll('.lesson-split__part')).toHaveLength(3);
    expect(buttonNamed('Add another').hidden).toBe(true);
  });

  it('keeps Split off when the preview has problems, and asks for names before checking', async () => {
    const call = fakeCall({ preview: { ...PREVIEW, problems: ['Viva practice needs at least one section.'] } });
    openLessonSplit({ lessonId: 'lesson_x', call });
    await flush();
    buttonNamed('Check').click();
    await flush();
    expect(card().querySelector('.lesson-split__problems')?.textContent).toContain('Give each new lesson a name.');
    expect(call).toHaveBeenCalledTimes(1);

    await fillOnePart();
    buttonNamed('Check').click();
    await flush();
    expect(card().querySelector('.lesson-split__problems')?.textContent).toContain(
      'Viva practice needs at least one section.'
    );
    expect(card().textContent).not.toContain('Nothing is deleted');
    expect(buttonNamed('Split').disabled).toBe(true);
  });

  it('clears the preview when any input changes', async () => {
    openLessonSplit({ lessonId: 'lesson_x', call: fakeCall() });
    await flush();
    await fillOnePart();
    buttonNamed('Check').click();
    await flush();
    expect(buttonNamed('Split').disabled).toBe(false);
    setValue(card().querySelector<HTMLInputElement>('.lesson-split__name')!, 'Viva drills');
    expect(card().querySelector('.lesson-split__preview')!.textContent).toBe('');
    expect(buttonNamed('Split').disabled).toBe(true);
    // The section's choice follows the new name.
    const move = card().querySelectorAll<HTMLSelectElement>('.lesson-split__move')[2]!;
    expect(move.selectedOptions[0]!.textContent).toBe('Viva drills');
  });

  it('splits, links the new lessons, reloads, and undoes after an in-page confirm', async () => {
    const call = fakeCall();
    const beforeSplit = vi.fn(async () => undefined);
    const onChanged = vi.fn(async () => undefined);
    const openLesson = vi.fn();
    openLessonSplit({ lessonId: 'lesson_x', call, beforeSplit, onChanged, openLesson });
    await flush();
    await fillOnePart();
    buttonNamed('Check').click();
    await flush();
    buttonNamed('Split').click();
    await flush();

    expect(beforeSplit).toHaveBeenCalledOnce();
    expect(call).toHaveBeenCalledWith(expect.objectContaining({ action: 'split' }));
    expect(onChanged).toHaveBeenCalledOnce();
    const link = card().querySelector<HTMLAnchorElement>('.lesson-split__link')!;
    expect(link.textContent).toBe('Viva practice');
    expect(link.getAttribute('href')).toMatch(/\/lessons\/lesson_new1$/);

    buttonNamed('Undo split').click();
    expect(card().textContent).toContain('Undo this split?');
    buttonNamed('Yes, undo').click();
    await flush();
    await flush();
    expect(call).toHaveBeenCalledWith({ action: 'undo', split_id: 'split_1' });
    expect(onChanged).toHaveBeenCalledTimes(2);
    expect(card().textContent).toContain('Split undone.');
  });

  it('opens a new lesson from its link', async () => {
    const openLesson = vi.fn();
    openLessonSplit({ lessonId: 'lesson_x', call: fakeCall(), openLesson });
    await flush();
    await fillOnePart();
    buttonNamed('Check').click();
    await flush();
    buttonNamed('Split').click();
    await flush();
    card().querySelector<HTMLAnchorElement>('.lesson-split__link')!.click();
    expect(openLesson).toHaveBeenCalledWith('lesson_new1');
    expect(document.querySelector('.lesson-split')).toBeNull();
  });

  it('lists earlier splits that are still in place, each with its own Undo', async () => {
    const call = fakeCall({
      status: {
        ...STATUS,
        splits: [
          { split_id: 'split_old', at: '2026-11-03T02:00:00Z', new_lessons: [{ id: 'l1', title: 'Gothic extension', role: 'extension' }], undone: false },
          { split_id: 'split_gone', at: '2026-10-20T02:00:00Z', new_lessons: [{ id: 'l2', title: 'Old practice', role: 'support' }], undone: true }
        ]
      }
    });
    openLessonSplit({ lessonId: 'lesson_x', call });
    await flush();
    const items = card().querySelectorAll('.lesson-split__earlier-item');
    expect(items).toHaveLength(1);
    expect(items[0]!.textContent).toContain('Gothic extension');
    expect(items[0]!.textContent).toContain('2026');
    items[0]!.querySelector<HTMLButtonElement>('.lesson-split__undo')!.click();
    buttonNamed('Yes, undo').click();
    await flush();
    expect(call).toHaveBeenCalledWith({ action: 'undo', split_id: 'split_old' });
  });

  it('shows server errors inline and does not close on Escape mid-request', async () => {
    let release: (value: unknown) => void = () => undefined;
    const call = vi.fn((body: SplitRequest) => {
      if (body.action === 'status') return Promise.resolve(STATUS);
      if (body.action === 'preview') return new Promise((resolve) => (release = resolve));
      return Promise.reject(new Error('The lesson changed while you were splitting it.'));
    });
    openLessonSplit({ lessonId: 'lesson_x', call });
    await flush();
    await fillOnePart();
    buttonNamed('Check').click();
    expect(buttonNamed('Cancel').disabled).toBe(true);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(document.querySelector('.lesson-split')).not.toBeNull();
    release(PREVIEW);
    await flush();
    buttonNamed('Split').click();
    await flush();
    expect(card().querySelector('.lesson-split__error')?.textContent).toBe('The lesson changed while you were splitting it.');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(document.querySelector('.lesson-split')).toBeNull();
  });
});

describe('splitCountSentences', () => {
  it('uses singulars and skips empty counts', () => {
    expect(splitCountSentences({ students_with_work: 1, handins: 0, marked: 1, done_marks: 1 })).toEqual([
      "1 student has work in the sections you're moving.",
      '1 marked piece comes across.',
      '1 done tick carries over.'
    ]);
    expect(splitCountSentences({ students_with_work: 0, handins: 0, marked: 0, done_marks: 0 })).toEqual([
      "No students have work in the sections you're moving."
    ]);
  });
});
