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

/** Live lessons for the chat picker, by title, always including the default. */
export function chatLessonOptions(
  curriculum: CurriculumResponse,
  defaultId: string
): Array<{ id: string; title: string }> {
  return curriculum.lessons
    .filter((lesson) => lesson.id === defaultId || (lesson.status !== 'trashed' && lesson.status !== 'archived'))
    .map((lesson) => ({ id: lesson.id, title: lesson.title }))
    .sort((a, b) => (a.title || '').localeCompare(b.title || ''));
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

  const picker = document.createElement('label');
  picker.className = 'teacher-chat__lesson';
  const pickerLabel = document.createElement('span');
  pickerLabel.className = 'create-modal__label';
  pickerLabel.textContent = 'Lesson';
  const select = document.createElement('select');
  select.className = 'create-modal__select';
  for (const lesson of chatLessonOptions(curriculum, lessonId)) {
    const option = document.createElement('option');
    option.value = lesson.id;
    option.textContent = lesson.title?.trim() || 'Untitled lesson';
    select.append(option);
  }
  select.value = lessonId;
  const openLesson = document.createElement('button');
  openLesson.type = 'button';
  openLesson.className = 'btn';
  openLesson.textContent = 'Open lesson';
  openLesson.addEventListener('click', () => navigate(`/lessons/${select.value}`));
  picker.append(pickerLabel, select);
  const pickerRow = document.createElement('div');
  pickerRow.className = 'teacher-chat__lesson-row';
  pickerRow.append(picker, openLesson);

  const host = document.createElement('div');
  host.className = 'teacher-chat__panel';
  const status = document.createElement('p');
  status.className = 'metric-caption';
  root.append(pickerRow, status, host);

  let panel: AiPanelHandle | null = null;
  let cancelled = false;
  let loadToken = 0;

  function load(id: string): void {
    const token = ++loadToken;
    panel?.dispose();
    panel = null;
    host.replaceChildren();
    status.textContent = 'Loading chat…';
    void getLesson(id)
      .then((lesson) => {
        if (cancelled || token !== loadToken) return;
        const title = lesson.title?.trim() || 'Untitled lesson';
        status.textContent = `Talking about ${title}. To apply edits, open the lesson and use its chat panel.`;
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
        if (cancelled || token !== loadToken) return;
        status.textContent = 'Chat could not load that lesson. Pick another lesson above.';
      });
  }

  select.addEventListener('change', () => load(select.value));
  load(lessonId);

  return {
    dispose() {
      cancelled = true;
      panel?.dispose();
      panel = null;
      root.replaceChildren();
    }
  };
}
