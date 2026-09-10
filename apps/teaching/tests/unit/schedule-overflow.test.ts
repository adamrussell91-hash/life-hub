import { afterEach, describe, expect, it, vi } from 'vitest';
import { openScheduleOverflow } from '@/teacher/schedule-overflow';

describe('openScheduleOverflow', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it('opens Set as current and Change date, then set-current calls through', () => {
    const anchor = document.createElement('button');
    document.body.append(anchor);
    const onSetCurrent = vi.fn();
    const onChangeDate = vi.fn();

    openScheduleOverflow(anchor, {
      currentDate: '2026-08-13',
      isCurrent: false,
      onSetCurrent,
      onChangeDate
    });

    const menu = document.querySelector('.schedule-overflow');
    expect(menu).not.toBeNull();
    const setCurrent = document.querySelector<HTMLButtonElement>(
      '[data-schedule-action="set-current"]'
    );
    expect(setCurrent?.textContent).toMatch(/Set as current/i);
    expect(document.querySelector('[data-schedule-action="change-date"]')).not.toBeNull();

    setCurrent?.click();
    expect(onSetCurrent).toHaveBeenCalledTimes(1);
    expect(document.querySelector('.schedule-overflow')).toBeNull();
  });

  it('omits Set as current when the lesson is already current', () => {
    const anchor = document.createElement('button');
    document.body.append(anchor);

    openScheduleOverflow(anchor, {
      currentDate: '2026-08-12',
      isCurrent: true,
      onSetCurrent: vi.fn(),
      onChangeDate: vi.fn()
    });

    expect(document.querySelector('[data-schedule-action="set-current"]')).toBeNull();
    expect(document.querySelector('[data-schedule-action="change-date"]')).not.toBeNull();
  });

  it('patches date from the date field', () => {
    const anchor = document.createElement('button');
    document.body.append(anchor);
    const onChangeDate = vi.fn();

    openScheduleOverflow(anchor, {
      currentDate: '2026-08-13',
      isCurrent: true,
      onSetCurrent: vi.fn(),
      onChangeDate
    });

    document.querySelector<HTMLButtonElement>('[data-schedule-action="change-date"]')?.click();
    const input = document.querySelector<HTMLInputElement>('input[type="date"]');
    expect(input?.value).toBe('2026-08-13');
    input!.value = '2026-09-01';
    input!.dispatchEvent(new Event('change', { bubbles: true }));
    expect(onChangeDate).toHaveBeenCalledWith('2026-09-01');
    expect(document.querySelector('.schedule-overflow')).toBeNull();
  });
});
