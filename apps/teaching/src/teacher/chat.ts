import { navigate } from '@/app/router';
import { mountAiPanel, type AiPanelHandle } from '@/teacher/ai-panel';
import { getLesson } from '@/teacher/lessons-library/api';
import { renderPageHeader } from '@/teacher/page-header';
import type { CurriculumResponse } from '@/teacher/nav';
import { resolveScheduleToday } from '@/schedule/today';

export function pickChatLessonId(curriculum: CurriculumResponse, today = resolveScheduleToday(curriculum.schedule_anchor_date)): string | null {
  const scheduled = (curriculum.scheduled_lessons ?? [])
    .filter((row) => row?.lesson_id && /^\d{4}-\d{2}-\d{2}$/.test(row.date))
    .sort((a, b) => a.date.localeCompare(b.date) || (a.start_time ?? '').localeCompare(b.start_time ?? ''));
  const todayRow = scheduled.find((row) => row.date === today);
  if (todayRow?.lesson_id) return todayRow.lesson_id;
  const upcoming = scheduled.find((row) => row.date >= today);
  if (upcoming?.lesson_id) return upcoming.lesson_id;
  const first = curriculum.lessons.find((lesson) => typeof lesson?.id === 'string' && lesson.id);
  return first?.id ?? null;
}

export function renderTeacherChat(
  canvas: HTMLElement,
  curriculum: CurriculumResponse
): { dispose: () => void } {
  canvas.replaceChildren();
  renderPageHeader(canvas, { eyebrow: 'Teaching Hub', title: 'Chat' });

  const root = document.createElement('div');
  root.className = 'teacher-chat';
  canvas.append(root);

  const lessonId = pickChatLessonId(curriculum);
  if (!lessonId) {
    const empty = document.createElement('p');
    empty.className = 'metric-caption';
    empty.textContent = 'Open a lesson to chat with Ann about it.';
    const toLessons = document.createElement('button');
    toLessons.type = 'button';
    toLessons.className = 'btn btn--primary';
    toLessons.textContent = 'Go to Lessons';
    toLessons.addEventListener('click', () => navigate('/lessons'));
    root.append(empty, toLessons);
    return { dispose() { root.replaceChildren(); } };
  }

  const host = document.createElement('div');
  host.className = 'teacher-chat__panel';
  const status = document.createElement('p');
  status.className = 'metric-caption';
  status.textContent = 'Loading chat…';
  root.append(status, host);

  let panel: AiPanelHandle | null = null;
  let cancelled = false;

  void getLesson(lessonId)
    .then((lesson) => {
      if (cancelled) return;
      const title = lesson.title?.trim() || 'Untitled lesson';
      status.textContent = `Talking about ${title}. Open the lesson to apply edits.`;
      panel = mountAiPanel(host, {
        lessonId: lesson.id,
        getSnapshotAt: () => lesson.updated_at || new Date().toISOString(),
        onAcceptProposal: () => ({
          ok: false,
          message: 'Open the lesson to apply that change.'
        })
      });
    })
    .catch(() => {
      if (cancelled) return;
      status.textContent = 'Chat could not load that lesson.';
      const toLessons = document.createElement('button');
      toLessons.type = 'button';
      toLessons.className = 'btn btn--primary';
      toLessons.textContent = 'Go to Lessons';
      toLessons.addEventListener('click', () => navigate('/lessons'));
      root.append(toLessons);
    });

  return {
    dispose() {
      cancelled = true;
      panel?.dispose();
      panel = null;
      root.replaceChildren();
    }
  };
}
