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

const CHAT_LESSON_KEY = 'teaching-chat-lesson';

function readStoredLessonId(): string | null {
  try {
    return localStorage.getItem(CHAT_LESSON_KEY);
  } catch {
    return null;
  }
}

function writeStoredLessonId(id: string): void {
  try {
    localStorage.setItem(CHAT_LESSON_KEY, id);
  } catch {
    /* private mode: the pick just won't survive a reload */
  }
}

/** The lesson the chat opens on: the teacher's last pick if it still exists, else the schedule's. */
export function resolveChatLessonId(curriculum: CurriculumResponse, stored: string | null): string | null {
  if (stored && curriculum.lessons.some((lesson) => lesson.id === stored)) return stored;
  return pickChatLessonId(curriculum);
}

function buildLessonPicker(
  curriculum: CurriculumResponse,
  selectedId: string,
  onChange: (id: string) => void
): HTMLElement {
  const label = document.createElement('label');
  label.className = 'teacher-chat__picker';
  const caption = document.createElement('span');
  caption.className = 'teacher-chat__picker-label';
  caption.textContent = 'Lesson';
  const select = document.createElement('select');
  select.className = 'teacher-chat__picker-select';

  const unitTitle = new Map(curriculum.units.map((unit) => [unit.id, unit.title?.trim() || 'Unit']));
  const groups = new Map<string, HTMLOptGroupElement>();
  const ordered = [...curriculum.lessons].sort((a, b) => a.sequence - b.sequence);
  for (const lesson of ordered) {
    let group = groups.get(lesson.unit_id);
    if (!group) {
      group = document.createElement('optgroup');
      group.label = unitTitle.get(lesson.unit_id) ?? 'Other lessons';
      groups.set(lesson.unit_id, group);
      select.append(group);
    }
    const option = document.createElement('option');
    option.value = lesson.id;
    option.textContent = lesson.title?.trim() || 'Untitled lesson';
    option.selected = lesson.id === selectedId;
    group.append(option);
  }
  select.addEventListener('change', () => onChange(select.value));
  label.append(caption, select);
  return label;
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

  const initialLessonId = resolveChatLessonId(curriculum, readStoredLessonId());
  if (!initialLessonId) {
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
  const picker = buildLessonPicker(curriculum, initialLessonId, (id) => {
    writeStoredLessonId(id);
    void load(id);
  });
  root.append(picker, status, host);

  let panel: AiPanelHandle | null = null;
  let cancelled = false;
  let loadToken = 0;

  async function load(lessonId: string): Promise<void> {
    const token = ++loadToken;
    panel?.dispose();
    panel = null;
    host.replaceChildren();
    status.textContent = 'Loading chat…';
    try {
      const lesson = await getLesson(lessonId);
      if (cancelled || token !== loadToken) return;
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
    } catch {
      if (cancelled || token !== loadToken) return;
      status.textContent = 'Chat could not load that lesson. Pick another above.';
    }
  }

  void load(initialLessonId);

  return {
    dispose() {
      cancelled = true;
      panel?.dispose();
      panel = null;
      root.replaceChildren();
    }
  };
}
