import type { Unit } from '@/schemas';
import type { CurriculumResponse } from '@/teacher/nav';

function timelineUnitIds(curriculum: CurriculumResponse, subjectId: string): Set<string> {
  const subject = curriculum.subjects.find((entry) => entry.id === subjectId);
  const scope = subject?.scope_id
    ? curriculum.scope_sequences.find((entry) => entry.id === subject.scope_id)
    : undefined;
  return new Set(
    (scope?.timeline_items ?? [])
      .filter((item) => item.kind === 'unit')
      .map((item) => item.unit_id)
  );
}

export function pickerUnits(
  curriculum: CurriculumResponse,
  subjectId: string
): Unit[] {
  const onTimeline = timelineUnitIds(curriculum, subjectId);
  return curriculum.units
    .filter(
      (unit) =>
        unit.status === 'active' &&
        unit.subject_id === subjectId &&
        !onTimeline.has(unit.id)
    )
    .sort((a, b) => a.title.localeCompare(b.title));
}

export function curriculumForScopeTimeline(
  curriculum: CurriculumResponse,
  subjectId: string
): CurriculumResponse {
  const onTimeline = timelineUnitIds(curriculum, subjectId);
  return {
    ...curriculum,
    units: curriculum.units.filter(
      (unit) =>
        unit.subject_id !== subjectId ||
        unit.status === 'active' ||
        onTimeline.has(unit.id)
    )
  };
}

function yearLabel(curriculum: CurriculumResponse, unit: Unit): string | null {
  const year = curriculum.years.find((entry) => entry.id === unit.year_id);
  if (!year) return null;
  return year.year_level ? `Year ${year.year_level}` : year.title;
}

export function enhanceScopeUnitPicker(
  picker: HTMLElement,
  curriculum: CurriculumResponse,
  subjectId: string
): void {
  if (picker.dataset.contextEnhanced === 'true') return;

  const subject = curriculum.subjects.find((entry) => entry.id === subjectId);
  const units = pickerUnits(curriculum, subjectId);
  const buttons = [
    ...picker.querySelectorAll<HTMLButtonElement>('.scope-timeline__picker-unit')
  ];

  buttons.forEach((button, index) => {
    const unit = units[index];
    if (!unit) return;

    button.dataset.unitId = unit.id;
    button.replaceChildren();

    const copy = document.createElement('span');
    copy.className = 'scope-timeline__picker-unit-copy';

    const title = document.createElement('span');
    title.className = 'schedule-modal__unit-title scope-timeline__picker-unit-title';
    title.textContent = unit.title;

    const meta = document.createElement('span');
    meta.className = 'scope-timeline__picker-unit-meta';
    meta.textContent = [
      yearLabel(curriculum, unit),
      subject?.title ?? null,
      unit.primary_term ? `Term ${unit.primary_term}` : null,
      `${unit.lesson_ids.length} ${unit.lesson_ids.length === 1 ? 'lesson' : 'lessons'}`
    ]
      .filter(Boolean)
      .join(' · ');

    copy.append(title, meta);
    button.append(copy);
  });

  picker.dataset.contextEnhanced = 'true';
}
