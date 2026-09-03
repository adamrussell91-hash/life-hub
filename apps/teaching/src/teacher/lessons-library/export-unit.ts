import { apiGet } from '@/api/client';
import { renderPrintLesson } from '@/print/render-print-lesson';
import type { Lesson } from '@/schemas/lesson';
import type { CurriculumResponse } from '@/teacher/nav';

export async function exportUnitPack(curriculum: CurriculumResponse, unitId: string): Promise<void> {
  const unit = curriculum.units.find((entry) => entry.id === unitId);
  const ids = unit?.lesson_ids ?? curriculum.lessons.filter((l) => l.unit_id === unitId).map((l) => l.id);
  const lessons: Lesson[] = [];
  for (const id of ids) {
    try {
      lessons.push(await apiGet<Lesson>(`/api/lessons/${id}`));
    } catch {
      // skip missing drafts
    }
  }
  const frame = window.open('', '_blank', 'noopener,noreferrer');
  if (!frame) {
    window.alert('Allow pop-ups to export a unit pack.');
    return;
  }
  frame.document.write(
    `<!doctype html><title>${unit?.title ?? 'Unit pack'}</title><body></body>`
  );
  const heading = frame.document.createElement('h1');
  heading.textContent = unit?.title ?? 'Unit pack';
  frame.document.body.append(heading);
  for (const lesson of lessons) {
    frame.document.body.append(renderPrintLesson(lesson));
  }
  frame.document.close();
  frame.focus();
  frame.print();
}
