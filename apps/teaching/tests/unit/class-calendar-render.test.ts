import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildClassCalendarModel, type ClassCalendarModel } from '@/schedule/class-calendar-model';
import { renderClassCalendar } from '@/teacher/class-calendar';

function modelForAugust(overrides?: {
  selectedDate?: string;
  today?: string;
  scheduled?: Array<{
    id: string;
    lesson_id: string;
    unit_id: string;
    date: string;
    delivery_status: 'planned' | 'current' | 'delivered' | 'skipped' | 'rescheduled';
    schedule_order?: number;
  }>;
  lessonTitles?: Map<string, string>;
}): ClassCalendarModel {
  return buildClassCalendarModel({
    scheduled: (overrides?.scheduled ?? [
      {
        id: 's1',
        lesson_id: 'l1',
        unit_id: 'u1',
        date: '2026-08-12',
        delivery_status: 'current',
        schedule_order: 1
      }
    ]) as never,
    lessonTitles:
      overrides?.lessonTitles ??
      new Map([['l1', 'Narrative Structure and Unreliable Memory']]),
    today: overrides?.today ?? '2026-08-12',
    selectedDate: overrides?.selectedDate ?? '2026-08-12',
    viewMonth: '2026-08'
  });
}

describe('renderClassCalendar', () => {
  let host: HTMLElement;

  beforeEach(() => {
    document.body.replaceChildren();
    host = document.createElement('div');
    document.body.append(host);
  });

  it('renders 7 weekday headers plus monthDays.length day cells', () => {
    const model = modelForAugust();
    renderClassCalendar(host, model, {
      onSelectDate: vi.fn(),
      onShiftMonth: vi.fn()
    });

    const grid = host.querySelector('[role="grid"]')!;
    const weekdays = grid.querySelectorAll('.class-calendar__weekday');
    const days = grid.querySelectorAll('.class-calendar__day');
    expect(weekdays).toHaveLength(7);
    expect([...weekdays].map((el) => el.textContent)).toEqual(['M', 'T', 'W', 'T', 'F', 'S', 'S']);
    expect(days).toHaveLength(model.monthDays.length);
  });

  it('renders lesson chips inside the day cell and links them', () => {
    const model = modelForAugust();
    renderClassCalendar(host, model, { onSelectDate: vi.fn(), onShiftMonth: vi.fn() });
    const chip = host.querySelector<HTMLAnchorElement>('a.event-chip[href="/lessons/l1"]');
    expect(chip).not.toBeNull();
    expect(chip?.textContent).toContain('Narrative Structure');
    expect(chip?.dataset.tint).toBeTruthy();
  const cell = host.querySelector('.class-calendar__day[data-date="2026-08-12"]');
  expect(cell?.tagName).toBe('DIV');
  expect(cell?.getAttribute('role')).toBe('gridcell');
  });

  it('renders a Today control that selects today', () => {
    const onSelectDate = vi.fn();
    const model = modelForAugust({ selectedDate: '2026-08-01', today: '2026-08-12' });
    renderClassCalendar(host, model, { onSelectDate, onShiftMonth: vi.fn() });
    host.querySelector<HTMLButtonElement>('[data-calendar="today"]')!.click();
    expect(onSelectDate).toHaveBeenCalledWith('2026-08-12');
  });

  it('shows two chips and +N more when a day has more than two lessons', () => {
    const model = modelForAugust({
      scheduled: [1, 2, 3].map((n) => ({
        id: `s${n}`,
        lesson_id: `l${n}`,
        unit_id: 'u1',
        date: '2026-08-12',
        delivery_status: 'planned' as const,
        schedule_order: n
      })),
      lessonTitles: new Map([['l1', 'One'], ['l2', 'Two'], ['l3', 'Three']])
    });
    renderClassCalendar(host, model, { onSelectDate: vi.fn(), onShiftMonth: vi.fn() });
    const day = host.querySelector('.class-calendar__day[data-date="2026-08-12"]')!;
    expect(day.querySelectorAll('a.event-chip')).toHaveLength(2);
    expect(day.querySelector('.event-chip-more')?.textContent).toMatch(/\+1/);
  });

  it('marks today, selected, and outside days', () => {
    const model = modelForAugust();
    renderClassCalendar(host, model, {
      onSelectDate: vi.fn(),
      onShiftMonth: vi.fn()
    });

    const today = host.querySelector('.class-calendar__day[data-today="true"]');
    const selected = host.querySelector('.class-calendar__day[data-selected="true"]');
    const outside = host.querySelector('.class-calendar__day[data-outside="true"]');

    expect(today).not.toBeNull();
    expect(today!.getAttribute('aria-current')).toBe('date');
    expect(selected).not.toBeNull();
    expect(outside).not.toBeNull();
    expect(outside!.getAttribute('data-date')).toBe('2026-07-27');
  });

  it('calls onSelectDate when a button day is clicked', () => {
    const model = modelForAugust({
      scheduled: [],
      selectedDate: '2026-08-10'
    });
    const onSelectDate = vi.fn();
    renderClassCalendar(host, model, {
      onSelectDate,
      onShiftMonth: vi.fn()
    });

    const day = host.querySelector<HTMLElement>(
      '.class-calendar__day[data-date="2026-08-11"]'
    )!;
    expect(day).not.toBeNull();
    day.click();
    expect(onSelectDate).toHaveBeenCalledTimes(1);
    expect(onSelectDate).toHaveBeenCalledWith('2026-08-11');
  });

  it('wires prev/next month buttons', () => {
    const model = modelForAugust();
    const onShiftMonth = vi.fn();
    renderClassCalendar(host, model, {
      onSelectDate: vi.fn(),
      onShiftMonth
    });

    const prev = host.querySelector<HTMLButtonElement>(
      'button[aria-label="Previous month"]'
    )!;
    const next = host.querySelector<HTMLButtonElement>('button[aria-label="Next month"]')!;
    expect(prev.type).toBe('button');
    expect(next.type).toBe('button');
    expect(host.querySelector('.class-calendar__month-label')?.textContent).toBe('August 2026');

    prev.click();
    next.click();
    expect(onShiftMonth).toHaveBeenCalledWith(-1);
    expect(onShiftMonth).toHaveBeenCalledWith(1);
  });

  it('binds month nav handlers only once across consecutive renders', () => {
    const model = modelForAugust();
    const onShiftMonth = vi.fn();
    const options = { onSelectDate: vi.fn(), onShiftMonth };

    renderClassCalendar(host, model, options);
    renderClassCalendar(host, model, options);

    host.querySelector<HTMLButtonElement>('button[aria-label="Previous month"]')!.click();
    expect(onShiftMonth).toHaveBeenCalledTimes(1);
    expect(onShiftMonth).toHaveBeenCalledWith(-1);
  });

  it('shows two chips and +3 more for a five-lesson day', () => {
    const model = modelForAugust({
      scheduled: [
        {
          id: 's1',
          lesson_id: 'l1',
          unit_id: 'u1',
          date: '2026-08-12',
          delivery_status: 'delivered',
          schedule_order: 1
        },
        {
          id: 's2',
          lesson_id: 'l2',
          unit_id: 'u1',
          date: '2026-08-12',
          delivery_status: 'planned',
          schedule_order: 2
        },
        {
          id: 's3',
          lesson_id: 'l3',
          unit_id: 'u1',
          date: '2026-08-12',
          delivery_status: 'skipped',
          schedule_order: 3
        },
        {
          id: 's4',
          lesson_id: 'l4',
          unit_id: 'u1',
          date: '2026-08-12',
          delivery_status: 'rescheduled',
          schedule_order: 4
        },
        {
          id: 's5',
          lesson_id: 'l5',
          unit_id: 'u1',
          date: '2026-08-12',
          delivery_status: 'current',
          schedule_order: 5
        }
      ],
      lessonTitles: new Map([
        ['l1', 'One'],
        ['l2', 'Two'],
        ['l3', 'Three'],
        ['l4', 'Four'],
        ['l5', 'Five']
      ])
    });

    renderClassCalendar(host, model, {
      onSelectDate: vi.fn(),
      onShiftMonth: vi.fn()
    });

    const day = host.querySelector('.class-calendar__day[data-date="2026-08-12"]')!;
    expect(day.tagName).toBe('DIV');
    expect(day.querySelectorAll('a.event-chip')).toHaveLength(2);
    expect(day.querySelector('.event-chip-more')?.textContent).toMatch(/\+3/);
    expect(day.querySelector('.calendar-dot')).toBeNull();
    // Detail list still lists all lessons
    expect(host.querySelectorAll('.class-calendar__detail-lesson')).toHaveLength(5);
  });

  it('applies month motion only when monthDelta is non-zero', () => {
    const model = modelForAugust();
    renderClassCalendar(host, model, {
      onSelectDate: vi.fn(),
      onShiftMonth: vi.fn(),
      monthDelta: 0
    });
    expect(host.querySelector('[role="grid"]')!.getAttribute('data-motion')).toBeNull();

    renderClassCalendar(host, model, {
      onSelectDate: vi.fn(),
      onShiftMonth: vi.fn(),
      monthDelta: 1
    });
    expect(host.querySelector('[role="grid"]')!.getAttribute('data-motion')).toBe('forward');

    renderClassCalendar(host, model, {
      onSelectDate: vi.fn(),
      onShiftMonth: vi.fn(),
      monthDelta: -1
    });
    expect(host.querySelector('[role="grid"]')!.getAttribute('data-motion')).toBe('back');
  });

  it('puts an overflow control on day-detail rows when onLessonOverflow is set', () => {
    const onLessonOverflow = vi.fn();
    const model = modelForAugust();
    renderClassCalendar(host, model, {
      onSelectDate: vi.fn(),
      onShiftMonth: vi.fn(),
      onLessonOverflow
    });

    const overflow = host.querySelector<HTMLButtonElement>(
      '.class-calendar__detail-row [aria-label="More actions"]'
    );
    expect(overflow).not.toBeNull();
    overflow!.click();
    expect(onLessonOverflow).toHaveBeenCalledWith('s1', overflow);
  });

  it('omits calendar overflow when onLessonOverflow is missing', () => {
    renderClassCalendar(host, modelForAugust(), {
      onSelectDate: vi.fn(),
      onShiftMonth: vi.fn()
    });
    expect(host.querySelector('.class-calendar__detail [aria-label="More actions"]')).toBeNull();
  });

  it('renders day detail with lesson links, unit titles, and empty state', () => {
    const withLessons = modelForAugust();
    renderClassCalendar(host, withLessons, {
      onSelectDate: vi.fn(),
      onShiftMonth: vi.fn(),
      unitTitles: new Map([['u1', 'Art of the Fiction Writer']])
    });

    const detail = host.querySelector('.class-calendar__detail')!;
    expect(detail.querySelector('.class-calendar__detail-heading')?.textContent).toBe(
      'Wednesday 12/08/26'
    );
    const row = detail.querySelector<HTMLAnchorElement>('a.class-calendar__detail-lesson')!;
    expect(row.getAttribute('href')).toBe('/lessons/l1');
    expect(row.textContent).toContain('Narrative Structure and Unreliable Memory');
    expect(row.textContent).toContain('Art of the Fiction Writer');
    expect(row.textContent).toContain('current');

    const emptyModel = modelForAugust({
      scheduled: [],
      selectedDate: '2026-08-13',
      today: '2026-08-12'
    });
    renderClassCalendar(host, emptyModel, {
      onSelectDate: vi.fn(),
      onShiftMonth: vi.fn(),
      onScheduleLesson: vi.fn()
    });
    const emptyDetail = host.querySelector('.class-calendar__detail')!;
    expect(emptyDetail.textContent).toContain('No lessons scheduled this day.');
    expect(
      emptyDetail.querySelector('button')?.getAttribute('aria-label')
    ).toBe('Schedule a lesson');
  });

  it('sets accessible names on day cells', () => {
    const model = modelForAugust();
    renderClassCalendar(host, model, {
      onSelectDate: vi.fn(),
      onShiftMonth: vi.fn()
    });

    const cell = host.querySelector('.class-calendar__day[data-date="2026-08-12"]')!;
    expect(cell.getAttribute('aria-label')).toBe(
      '12/08/26, Narrative Structure and Unreliable Memory'
    );
  });

  it('renders week and timeline views from the view tabs', () => {
    const onViewChange = vi.fn();
    const onSelectDate = vi.fn();
    const model = modelForAugust();
    renderClassCalendar(host, model, {
      onSelectDate,
      onShiftMonth: vi.fn(),
      onViewChange,
      view: 'week',
      chipMeta: () => '12ENA6'
    });

    expect(host.querySelector('.class-calendar__week')).not.toBeNull();
    expect(host.querySelector('[role="grid"]')).toBeNull();
    const todayCol = host.querySelector('.class-calendar__week-day[data-today="true"]');
    expect(todayCol?.getAttribute('data-date')).toBe('2026-08-12');
    expect(host.querySelector('.event-chip__meta')?.textContent).toBe('12ENA6');

    host.querySelector<HTMLButtonElement>('[data-calendar-view="timeline"]')!.click();
    expect(onViewChange).toHaveBeenCalledWith('timeline');

    renderClassCalendar(host, model, {
      onSelectDate,
      onShiftMonth: vi.fn(),
      onViewChange,
      view: 'timeline'
    });
    expect(host.querySelector('.class-calendar__timeline')).not.toBeNull();
    expect(host.textContent).toContain('Narrative Structure');
  });
});
