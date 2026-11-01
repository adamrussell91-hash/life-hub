import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ScheduledLesson, Unit } from '@/schemas';
import { renderUnitSequence } from '@/teacher/unit-sequence';

class MemoryStorage implements Storage {
  private readonly store = new Map<string, string>();

  get length(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }

  key(index: number): string | null {
    return [...this.store.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
}

const ISO = '2026-01-01T00:00:00.000Z';
const CLASS_ID = 'class_12ena6';
const STORAGE_KEY = `th:class:${CLASS_ID}:openUnits`;

function unit(partial: Partial<Unit> & Pick<Unit, 'id' | 'title'>): Unit {
  return {
    type: 'unit',
    slug: partial.id,
    status: 'active',
    created_at: ISO,
    updated_at: ISO,
    schema_version: 1,
    year_id: 'year_12',
    subject_id: 'subject_engadv',
    lesson_ids: [],
    ...partial
  };
}

function scheduled(
  partial: Partial<ScheduledLesson> &
    Pick<ScheduledLesson, 'id' | 'lesson_id' | 'unit_id' | 'date' | 'schedule_order' | 'delivery_status'>
): ScheduledLesson {
  return {
    type: 'scheduled_lesson',
    class_id: CLASS_ID,
    created_at: ISO,
    updated_at: ISO,
    schema_version: 1,
    ...partial
  };
}

const units: Unit[] = [
  unit({
    id: 'unit_later',
    title: 'Later Unit',
    start_date: '2026-09-01',
    end_date: '2026-09-20'
  }),
  unit({
    id: 'unit_lkeep',
    title: 'The Lantern Keeper',
    start_date: '2026-08-10',
    end_date: '2026-09-04'
  }),
  unit({ id: 'unit_empty', title: 'Unscheduled Unit' })
];

const scheduledLessons: ScheduledLesson[] = [
  scheduled({
    id: 's2',
    lesson_id: 'l2',
    unit_id: 'unit_lkeep',
    date: '2026-08-12',
    schedule_order: 2,
    delivery_status: 'current'
  }),
  scheduled({
    id: 's1',
    lesson_id: 'l1',
    unit_id: 'unit_lkeep',
    date: '2026-08-10',
    schedule_order: 1,
    delivery_status: 'delivered'
  }),
  scheduled({
    id: 's3',
    lesson_id: 'l3',
    unit_id: 'unit_later',
    date: '2026-09-02',
    schedule_order: 10,
    delivery_status: 'planned'
  })
];

const lessonTitles = new Map([
  ['l1', 'Opening Moves'],
  ['l2', 'Narrative Structure'],
  ['l3', 'Later Lesson']
]);

describe('renderUnitSequence', () => {
  let host: HTMLElement;
  let dispose: (() => void) | undefined;

  beforeEach(() => {
    document.body.replaceChildren();
    host = document.createElement('div');
    document.body.append(host);
    vi.stubGlobal('localStorage', new MemoryStorage());
  });

  afterEach(() => {
    dispose?.();
    dispose = undefined;
    vi.unstubAllGlobals();
  });

  function render(overrides?: {
    currentUnitId?: string;
    today?: string;
    readOnly?: boolean;
    onOverflow?: (scheduledId: string, anchor: HTMLElement) => void;
    onNavigate?: (path: string) => void;
  }) {
    const result = renderUnitSequence(host, {
      units,
      scheduled: scheduledLessons,
      lessonTitles,
      currentUnitId: overrides?.currentUnitId ?? 'unit_lkeep',
      classId: CLASS_ID,
      today: overrides?.today ?? '2026-08-20',
      readOnly: overrides?.readOnly,
      onOverflow: overrides?.onOverflow,
      onNavigate: overrides?.onNavigate
    });
    dispose = result.dispose;
    return result;
  }

  it('renders one details per unit in schedule order', () => {
    render();

    const details = [...host.querySelectorAll('details')];
    expect(details).toHaveLength(3);
    expect(details.map((el) => el.getAttribute('data-unit-id'))).toEqual([
      'unit_lkeep',
      'unit_later',
      'unit_empty'
    ]);
  });

  it('opens only the current unit on first visit', () => {
    render({ currentUnitId: 'unit_lkeep' });

    const open = host.querySelectorAll('details[open]');
    expect(open).toHaveLength(1);
    expect(open[0].getAttribute('data-unit-id')).toBe('unit_lkeep');
  });

  it('shows title, lesson count, and date range in the summary', () => {
    render();

    const summary = host.querySelector('details[data-unit-id="unit_lkeep"] summary')!;
    expect(summary.textContent).toContain('The Lantern Keeper');
    expect(summary.textContent).toContain('2 lessons');
    expect(summary.textContent).toMatch(/10\/08\/26\s*[–-]\s*04\/09\/26/);

    const titleLink = summary.querySelector<HTMLAnchorElement>('a[href="/units/unit_lkeep"]')!;
    expect(titleLink).not.toBeNull();
    expect(titleLink.textContent).toBe('The Lantern Keeper');
  });

  it('shows a progress bar from unitDateProgress when a span exists', () => {
    render({ today: '2026-08-20' });

    const bar = host.querySelector<HTMLElement>(
      'details[data-unit-id="unit_lkeep"] .seq__progress-bar'
    );
    expect(bar).not.toBeNull();
    expect(bar!.style.width).toMatch(/%$/);
    expect(Number.parseFloat(bar!.style.width)).toBeGreaterThan(0);
    expect(Number.parseFloat(bar!.style.width)).toBeLessThan(100);

    expect(
      host.querySelector('details[data-unit-id="unit_empty"] .seq__progress-bar')
    ).toBeNull();
  });

  it('writes open unit ids to localStorage on toggle', () => {
    render();

    const later = host.querySelector<HTMLDetailsElement>('details[data-unit-id="unit_later"]')!;
    later.open = true;
    later.dispatchEvent(new Event('toggle'));

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(stored).toEqual(expect.arrayContaining(['unit_lkeep', 'unit_later']));
    expect(stored).toHaveLength(2);
  });

  it('restores previously open units from storage on re-render', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(['unit_later', 'unit_empty']));

    render({ currentUnitId: 'unit_lkeep' });

    const openIds = [...host.querySelectorAll('details[open]')].map((el) =>
      el.getAttribute('data-unit-id')
    );
    expect(openIds).toEqual(['unit_later', 'unit_empty']);
  });

  it('renders every lesson as a link with number or check, title, date, and status', () => {
    render();

    const rows = [
      ...host.querySelectorAll<HTMLAnchorElement>(
        'details[data-unit-id="unit_lkeep"] a.seq__lesson-link'
      )
    ];
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.getAttribute('href'))).toEqual([
      '/lessons/l1',
      '/lessons/l2'
    ]);
    expect(rows[0].textContent).toContain('✓');
    expect(rows[0].textContent).toContain('Opening Moves');
    expect(rows[0].textContent).toMatch(/10\/08\/26/);
    expect(rows[0].textContent).toContain('delivered');
    expect(rows[1].textContent).toContain('2');
    expect(rows[1].textContent).toContain('Narrative Structure');
    expect(rows[1].textContent).toContain('current');
  });

  it('keeps lesson controls in the DOM without hidden or display:none', () => {
    render();

    const controls = host.querySelector(
      'details[data-unit-id="unit_lkeep"] .seq__row .seq__controls'
    )!;
    expect(controls).not.toBeNull();

    const buttons = [...controls.querySelectorAll('button')];
    expect(buttons.map((btn) => btn.getAttribute('aria-label'))).toEqual(['More actions']);

    for (const btn of buttons) {
      expect(btn.hasAttribute('hidden')).toBe(false);
      expect(btn.style.display).not.toBe('none');
      expect(getComputedStyle(btn).display).not.toBe('none');
    }
    expect(controls.hasAttribute('hidden')).toBe(false);
    expect((controls as HTMLElement).style.display).not.toBe('none');
  });

  it('omits reorder controls in read-only mode', () => {
    render({ readOnly: true });
    expect(host.querySelector('.seq__controls')).toBeNull();
    expect(host.querySelector('a.seq__lesson-link[href="/lessons/l1"]')).not.toBeNull();
  });

  it('wires the overflow callback', () => {
    const onOverflow = vi.fn();
    render({ onOverflow });

    const row = host.querySelector(
      'details[data-unit-id="unit_lkeep"] .seq__lessons .seq__row:nth-child(2)'
    )!;
    const [overflow] = [...row.querySelectorAll('button')];
    overflow.click();

    expect(onOverflow).toHaveBeenCalledWith('s2', overflow);
  });

  it('lists lessons by date even when the schedule order disagrees', () => {
    renderUnitSequence(host, {
      units: [unit({ id: 'unit_dates', title: 'Dates' })],
      scheduled: [
        scheduled({ id: 'late', lesson_id: 'l1', unit_id: 'unit_dates', date: '2026-08-20', schedule_order: 1, delivery_status: 'planned' }),
        scheduled({ id: 'early', lesson_id: 'l2', unit_id: 'unit_dates', date: '2026-08-11', schedule_order: 9, delivery_status: 'planned' })
      ],
      lessonTitles,
      currentUnitId: 'unit_dates',
      classId: CLASS_ID,
      today: '2026-08-01'
    });
    const titles = [...host.querySelectorAll('.seq__lesson-title')].map((n) => n.textContent);
    expect(titles).toEqual(['Narrative Structure', 'Opening Moves']);
  });

  it('uses SPA navigation for unit and lesson links when onNavigate is set', () => {
    const onNavigate = vi.fn();
    render({ onNavigate });

    const unitLink = host.querySelector<HTMLAnchorElement>('a[href="/units/unit_lkeep"]')!;
    const lessonLink = host.querySelector<HTMLAnchorElement>(
      'a.seq__lesson-link[href="/lessons/l1"]'
    )!;

    unitLink.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    lessonLink.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    expect(onNavigate).toHaveBeenCalledWith('/units/unit_lkeep');
    expect(onNavigate).toHaveBeenCalledWith('/lessons/l1');
  });

  it('stops unit title clicks from toggling the disclosure', () => {
    render();

    const details = host.querySelector<HTMLDetailsElement>(
      'details[data-unit-id="unit_later"]'
    )!;
    expect(details.open).toBe(false);

    const titleLink = details.querySelector<HTMLAnchorElement>('a[href="/units/unit_later"]')!;
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    const stopSpy = vi.spyOn(event, 'stopPropagation');
    titleLink.dispatchEvent(event);

    expect(stopSpy).toHaveBeenCalled();
    expect(details.open).toBe(false);
  });
  it('numbers a lesson taught over two slots once and marks each part', () => {
    ({ dispose } = renderUnitSequence(host, {
      units: [unit({ id: 'unit_poems', title: 'Poems' })],
      scheduled: [
        scheduled({ id: 'thu', lesson_id: 'poem', unit_id: 'unit_poems', date: '2026-10-16', schedule_order: 1, delivery_status: 'delivered' }),
        scheduled({ id: 'fri', lesson_id: 'poem', unit_id: 'unit_poems', date: '2026-10-17', schedule_order: 2, delivery_status: 'planned' }),
        scheduled({ id: 'mon', lesson_id: 'next', unit_id: 'unit_poems', date: '2026-10-20', schedule_order: 3, delivery_status: 'planned' })
      ],
      lessonTitles: new Map([['poem', 'The Remedy of Butterflies'], ['next', 'Next Poem']]),
      currentUnitId: 'unit_poems',
      classId: CLASS_ID,
      today: '2026-10-17'
    }));
    const markers = [...host.querySelectorAll('.seq__marker')].map((el) => el.textContent);
    const titles = [...host.querySelectorAll('.seq__lesson-title')].map((el) => el.textContent);
    expect(markers).toEqual(['✓', '1', '2']);
    expect(titles).toEqual([
      'The Remedy of Butterflies · part 1 of 2',
      'The Remedy of Butterflies · part 2 of 2',
      'Next Poem'
    ]);
    expect(host.querySelector('.seq__unit-meta')?.textContent).toContain('2 lessons');
  });
});
