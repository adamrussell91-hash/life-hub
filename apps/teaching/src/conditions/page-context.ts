import { loadAlignment } from '@/alignment/api';
import type { Alignment } from '@/alignment/schema';
import type { Unit } from '@/schemas/unit';
import type { CurriculumResponse } from '@/teacher/nav';
import { loadClassEvidence, unitClasses, unitSchedule } from '@/teacher/network-context';
import type { ConditionsPanelOptions } from './conditions-panel';
import type { ClassSlot } from './readiness';
import { revisitsFor, spacingPlan, type SpacingLesson } from './spacing';
import { dotPointWords } from './spacing-panel';

/**
 * What the lesson page's Conditions panel needs from the rest of the hub:
 * the unit's spacing plan (read fresh on each draw, so a new date or dot
 * point shows), each class's slot for this lesson, and its markbook.
 */
export function conditionsContext(
  curriculum: CurriculumResponse,
  unit: Unit | undefined,
  lessonId: string,
  onAsk: (message: string) => void
): Omit<ConditionsPanelOptions, 'getLesson' | 'onOff'> {
  let alignment: Alignment | null = null;
  void loadAlignment().then((doc) => { alignment = doc; }).catch(() => { /* Refs stand in for the words. */ });
  if (!unit) return { onAsk };

  const revisits = () => {
    const dates = unitSchedule(curriculum, unit)?.dates;
    const ids = new Set(unit.lesson_ids);
    const lessons: SpacingLesson[] = curriculum.lessons
      .filter((l) => ids.has(l.id) && l.status !== 'trashed')
      .map((l) => {
        const date = dates?.get(l.id);
        return {
          id: l.id,
          title: l.title,
          ...(l.dot_points ? { dot_points: l.dot_points } : {}),
          ...(date ? { date } : {}),
          ...(l.pedagogical_mode === 'assessment' ? { assessment: true } : {})
        };
      });
    return revisitsFor(spacingPlan(lessons), lessonId);
  };

  const slots = (): ClassSlot[] => {
    const names = new Map(unitClasses(curriculum, unit).map((c) => [c.id, c.name] as const));
    const out: ClassSlot[] = [];
    for (const [classId, name] of names) {
      const first = curriculum.scheduled_lessons
        .filter((r) => r.class_id === classId && r.lesson_id === lessonId && r.delivery_status !== 'skipped')
        .sort((a, b) => `${a.date}${a.start_time ?? ''}`.localeCompare(`${b.date}${b.start_time ?? ''}`))[0];
      if (first) out.push({ className: name, date: first.date, start_time: first.start_time ?? null, end_time: first.end_time ?? null });
    }
    return out;
  };

  return {
    onAsk,
    revisits,
    pointLabel: (ref) => dotPointWords(alignment, ref),
    slots,
    classes: () => unitClasses(curriculum, unit),
    loadClass: loadClassEvidence
  };
}
