import { resolveScheduleToday } from '@/schedule/today';
import { selectTodaySchedule } from '@/teacher/home-model';
import type { CurriculumResponse } from '@/teacher/nav';

export interface SearchAction {
  id: string;
  title: string;
  keywords: string[];
}

export interface SearchActionContext {
  path: string;
  hasLessonEditor: boolean;
  todayClassId?: string;
}

export function listSearchActions(ctx: SearchActionContext): SearchAction[] {
  const actions: SearchAction[] = [
    { id: 'new-lesson', title: 'New Lesson', keywords: ['new', 'create', 'lesson'] },
    { id: 'new-unit', title: 'New Unit', keywords: ['new', 'create', 'unit'] },
    { id: 'new-class', title: 'New Class', keywords: ['new', 'create', 'class'] },
    { id: 'new-subject', title: 'New Subject', keywords: ['new', 'create', 'subject'] },
    { id: 'new-scope', title: 'New Scope & Sequence', keywords: ['new', 'create', 'scope'] },
    { id: 'open-home', title: 'Open Dashboard', keywords: ['home', 'dashboard'] }
  ];
  if (ctx.todayClassId) {
    actions.push({ id: 'open-today-class', title: "Open Today's Class", keywords: ['today', 'class'] });
  }
  if (/^\/(lessons|units|classes)\//.test(ctx.path)) {
    actions.push({ id: 'open-student-view', title: 'Open Student View', keywords: ['student', 'preview'] });
  }
  if (ctx.hasLessonEditor) {
    actions.push({ id: 'open-a4', title: 'Print lesson', keywords: ['print', 'a4'] });
    actions.push({ id: 'publish-lesson', title: 'Publish Lesson', keywords: ['publish'] });
  }
  return actions;
}

export function filterActions(actions: SearchAction[], query: string): SearchAction[] {
  const q = query.trim().toLowerCase();
  if (!q) return actions;
  return actions.filter(
    (a) => a.title.toLowerCase().includes(q) || a.keywords.some((k) => k.includes(q) || q.includes(k))
  );
}

export function resolveTodayClassId(
  curriculum: CurriculumResponse,
  today = resolveScheduleToday(curriculum.schedule_anchor_date)
): string | undefined {
  const entries = selectTodaySchedule(curriculum.scheduled_lessons, today);
  if (entries.length === 0) return undefined;
  const sorted = [...entries].sort((a, b) => a.schedule_order - b.schedule_order);
  return sorted[0]?.class_id;
}
