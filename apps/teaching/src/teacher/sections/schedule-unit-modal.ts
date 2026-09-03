import { ApiClientError } from '@/api/client';
import type { Class, ScheduledLesson, Unit } from '@/schemas';
import { generateScheduleDates } from '@/schedule/generate-dates';
import { resolveScheduleToday } from '@/schedule/today';
import type { CurriculumResponse } from '@/teacher/nav';
import { postScheduleUnit } from '@/teacher/schedule-api';

const WEEKDAY_LABELS: ReadonlyArray<{ day: number; label: string }> = [
  { day: 1, label: 'Mon' },
  { day: 2, label: 'Tue' },
  { day: 3, label: 'Wed' },
  { day: 4, label: 'Thu' },
  { day: 5, label: 'Fri' }
];

const DEFAULT_MEETING_DAYS = [1, 2, 3, 4, 5];

export function openScheduleUnitModal(options: {
  curriculum: CurriculumResponse;
  classId: string;
  onSuccess: (result: {
    class: Class;
    scheduled_lessons: ScheduledLesson[];
  }) => void | Promise<void>;
}): void {
  const cls = options.curriculum.classes.find((entry) => entry.id === options.classId);
  if (!cls) return;

  const units = options.curriculum.units
    .filter((unit) => unit.subject_id === cls.subject_id)
    .sort((a, b) => a.title.localeCompare(b.title));

  const lessonsById = new Map(options.curriculum.lessons.map((lesson) => [lesson.id, lesson]));

  let step = 1;
  let selectedUnitId: string | null = null;
  let meetingDays = normalizeMeetingDays(cls.meeting_days);
  let startDate = defaultStartDate(cls, options.curriculum, meetingDays);
  let submitting = false;

  const backdrop = document.createElement('div');
  backdrop.className = 'schedule-modal';
  backdrop.dataset.scheduleModal = 'backdrop';

  const dialog = document.createElement('div');
  dialog.className = 'schedule-modal__dialog';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', 'schedule-modal-title');

  const title = document.createElement('h2');
  title.id = 'schedule-modal-title';
  title.className = 'schedule-modal__title';
  title.textContent = 'Schedule unit';

  const errorBanner = document.createElement('p');
  errorBanner.className = 'schedule-modal__error';
  errorBanner.hidden = true;
  errorBanner.setAttribute('role', 'alert');

  const body = document.createElement('div');
  body.className = 'schedule-modal__body';

  const footer = document.createElement('div');
  footer.className = 'schedule-modal__footer';

  dialog.append(title, errorBanner, body, footer);
  backdrop.append(dialog);
  document.body.append(backdrop);

  const close = (): void => {
    document.removeEventListener('keydown', onKeyDown);
    backdrop.remove();
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    }
  };

  document.addEventListener('keydown', onKeyDown);

  backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop) {
      close();
    }
  });

  const clearError = (): void => {
    errorBanner.hidden = true;
    errorBanner.textContent = '';
  };

  const showError = (message: string): void => {
    errorBanner.hidden = false;
    errorBanner.textContent = message;
  };

  const selectedUnit = (): Unit | undefined =>
    units.find((unit) => unit.id === selectedUnitId);

  const render = (): void => {
    title.textContent =
      step === 1 ? 'Choose unit' : step === 2 ? 'Meeting pattern' : 'Preview schedule';

    body.replaceChildren();
    footer.replaceChildren();

    if (step === 1) {
      renderStepChooseUnit(body, units, cls, options.curriculum, selectedUnitId, (unitId) => {
        selectedUnitId = unitId;
        clearError();
        render();
      });
      footer.append(
        ghostButton('Cancel', close),
        primaryButton('Next', () => {
          if (!selectedUnitId) return;
          clearError();
          step = 2;
          render();
        }, !selectedUnitId)
      );
      return;
    }

    if (step === 2) {
      renderStepPattern(body, startDate, meetingDays, {
        onStartDateChange: (value) => {
          startDate = value;
          clearError();
        },
        onMeetingDaysChange: (days) => {
          meetingDays = days;
          clearError();
          render();
        }
      });
      const canNext = Boolean(startDate) && meetingDays.length > 0;
      footer.append(
        ghostButton('Back', () => {
          clearError();
          step = 1;
          render();
        }),
        primaryButton('Next', () => {
          if (!canNext) return;
          clearError();
          step = 3;
          render();
        }, !canNext)
      );
      return;
    }

    const unit = selectedUnit();
    if (!unit) {
      step = 1;
      render();
      return;
    }

    const missing = missingLessonIds(unit, cls.id, options.curriculum);
    let dates: string[] = [];
    try {
      dates =
        missing.length === 0
          ? []
          : generateScheduleDates({
              startDate,
              meetingDays,
              lessonCount: missing.length
            });
    } catch {
      dates = [];
    }

    renderStepPreview(body, missing, dates, lessonsById);

    const cancel = ghostButton('Cancel', close);
    const confirm = primaryButton(
      submitting ? 'Scheduling…' : 'Confirm',
      () => {
        void (async () => {
          if (submitting || missing.length === 0 || dates.length === 0) return;
          submitting = true;
          clearError();
          render();
          try {
            const created = await postScheduleUnit(options.classId, {
              unit_id: unit.id,
              start_date: startDate,
              meeting_days: meetingDays
            });
            close();
            await options.onSuccess(created);
          } catch (error) {
            submitting = false;
            const message =
              error instanceof ApiClientError
                ? error.message
                : error instanceof Error
                  ? error.message
                  : 'Unable to schedule unit.';
            showError(message);
            render();
          }
        })();
      },
      submitting || missing.length === 0 || dates.length === 0
    );
    confirm.dataset.scheduleModalAction = 'confirm';

    footer.append(
      ghostButton('Back', () => {
        if (submitting) return;
        clearError();
        step = 2;
        render();
      }),
      cancel,
      confirm
    );
  };

  render();
}

function renderStepChooseUnit(
  body: HTMLElement,
  units: Unit[],
  cls: Class,
  curriculum: CurriculumResponse,
  selectedUnitId: string | null,
  onSelect: (unitId: string) => void
): void {
  if (units.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'schedule-modal__empty';
    empty.textContent = 'No units for this subject.';
    body.append(empty);
    return;
  }

  const list = document.createElement('ul');
  list.className = 'schedule-modal__unit-list';

  for (const unit of units) {
    const fullyScheduled = missingLessonIds(unit, cls.id, curriculum).length === 0;
    const item = document.createElement('li');
    item.className = 'schedule-modal__unit-item';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'schedule-modal__unit-button';
    button.dataset.unitId = unit.id;
    button.disabled = fullyScheduled;
    if (selectedUnitId === unit.id) {
      button.classList.add('is-selected');
    }

    const label = document.createElement('span');
    label.className = 'schedule-modal__unit-title';
    label.textContent = unit.title;

    button.append(label);

    if (fullyScheduled) {
      const badge = document.createElement('span');
      badge.className = 'schedule-modal__unit-badge';
      badge.textContent = 'Already scheduled';
      button.append(badge);
    } else {
      button.addEventListener('click', () => onSelect(unit.id));
    }

    item.append(button);
    list.append(item);
  }

  body.append(list);
}

function renderStepPattern(
  body: HTMLElement,
  startDate: string,
  meetingDays: number[],
  handlers: {
    onStartDateChange: (value: string) => void;
    onMeetingDaysChange: (days: number[]) => void;
  }
): void {
  const startField = document.createElement('label');
  startField.className = 'schedule-modal__field';

  const startLabel = document.createElement('span');
  startLabel.className = 'schedule-modal__label';
  startLabel.textContent = 'Start date';

  const startInput = document.createElement('input');
  startInput.type = 'date';
  startInput.className = 'schedule-modal__date';
  startInput.value = startDate;
  startInput.dataset.scheduleModalField = 'start-date';
  startInput.addEventListener('change', () => {
    handlers.onStartDateChange(startInput.value);
  });

  startField.append(startLabel, startInput);

  const daysField = document.createElement('div');
  daysField.className = 'schedule-modal__field';

  const daysLabel = document.createElement('span');
  daysLabel.className = 'schedule-modal__label';
  daysLabel.textContent = 'Meeting days';

  const toggles = document.createElement('div');
  toggles.className = 'schedule-modal__day-toggles';
  toggles.setAttribute('role', 'group');
  toggles.setAttribute('aria-label', 'Meeting days');

  for (const { day, label } of WEEKDAY_LABELS) {
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'schedule-modal__day-toggle';
    toggle.textContent = label;
    toggle.dataset.day = String(day);
    toggle.setAttribute('aria-pressed', meetingDays.includes(day) ? 'true' : 'false');
    if (meetingDays.includes(day)) {
      toggle.classList.add('is-active');
    }
    toggle.addEventListener('click', () => {
      const next = meetingDays.includes(day)
        ? meetingDays.filter((value) => value !== day)
        : [...meetingDays, day].sort((a, b) => a - b);
      handlers.onMeetingDaysChange(next);
    });
    toggles.append(toggle);
  }

  daysField.append(daysLabel, toggles);
  body.append(startField, daysField);
}

function renderStepPreview(
  body: HTMLElement,
  missing: string[],
  dates: string[],
  lessonsById: Map<string, { title: string }>
): void {
  if (missing.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'schedule-modal__empty';
    empty.textContent = 'Already scheduled';
    body.append(empty);
    return;
  }

  const list = document.createElement('ul');
  list.className = 'schedule-modal__preview-list';

  missing.forEach((lessonId, index) => {
    const item = document.createElement('li');
    item.className = 'schedule-modal__preview-item';
    const date = dates[index] ?? '—';
    const title = lessonsById.get(lessonId)?.title ?? lessonId;
    item.textContent = `${date} · ${title} · ${index + 1}`;
    list.append(item);
  });

  body.append(list);
}

function missingLessonIds(
  unit: Unit,
  classId: string,
  curriculum: CurriculumResponse
): string[] {
  const scheduled = new Set(
    curriculum.scheduled_lessons
      .filter((row) => row.class_id === classId && row.unit_id === unit.id)
      .map((row) => row.lesson_id)
  );
  return unit.lesson_ids.filter((lessonId) => !scheduled.has(lessonId));
}

function normalizeMeetingDays(days: number[] | undefined): number[] {
  if (!days || days.length === 0) return [...DEFAULT_MEETING_DAYS];
  return [...new Set(days.filter((day) => day >= 1 && day <= 5))].sort((a, b) => a - b);
}

function defaultStartDate(
  cls: Class,
  curriculum: CurriculumResponse,
  meetingDays: number[]
): string {
  const classDates = curriculum.scheduled_lessons
    .filter((row) => row.class_id === cls.id)
    .map((row) => row.date)
    .sort();

  const from =
    classDates.length > 0
      ? addUtcDays(classDates[classDates.length - 1], 1)
      : resolveScheduleToday(curriculum.schedule_anchor_date);

  const days = meetingDays.length > 0 ? meetingDays : DEFAULT_MEETING_DAYS;
  return generateScheduleDates({
    startDate: from,
    meetingDays: days,
    lessonCount: 1
  })[0];
}

function addUtcDays(ymd: string, amount: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const cursor = new Date(Date.UTC(y, m - 1, d));
  cursor.setUTCDate(cursor.getUTCDate() + amount);
  const year = cursor.getUTCFullYear();
  const month = String(cursor.getUTCMonth() + 1).padStart(2, '0');
  const day = String(cursor.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function ghostButton(label: string, onClick: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'btn btn--ghost';
  button.textContent = label;
  button.addEventListener('click', onClick);
  return button;
}

function primaryButton(
  label: string,
  onClick: () => void,
  disabled = false
): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'btn btn--primary';
  button.textContent = label;
  button.disabled = disabled;
  button.addEventListener('click', onClick);
  return button;
}
