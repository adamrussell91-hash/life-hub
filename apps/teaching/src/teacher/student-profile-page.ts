/**
 * The teacher's `/classes/:classId/students/:studentId` page: the student's own progress page,
 * drawn by the same view, read through the operator route. Opening a piece here leaves it new for them.
 */
import { apiPost } from '@/api/client';
import { el, errorText } from '@/quiz/dom';
import { navigate } from '@/app/router';
import { withAppBase } from '@/app/base-path';
import type { ReturnedItem } from '@/progress/types';
import type { PiecePayload } from '@/student/returned-view';
import { renderProfile, type ProfilePayload } from '@/student/profile-view';

export function mountTeacherStudentProfile(canvas: HTMLElement, classId: string, studentId: string): { dispose: () => void } {
  let disposed = false;
  const call = <T>(action: 'progress' | 'returned' | 'piece', extra: Record<string, unknown> = {}): Promise<T> =>
    apiPost<T>(`/api/classes/${encodeURIComponent(classId)}/profile`, { action, student_id: studentId, ...extra });

  const back = el('a', 'pm-back', '← Back to the markbook');
  const classPath = `/classes/${encodeURIComponent(classId)}`;
  back.href = withAppBase(classPath);
  back.addEventListener('click', (event) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey) return;
    event.preventDefault();
    navigate(classPath);
  });
  const body = el('div', 'pm-teacher__body');
  body.append(el('p', 'pm-empty', 'Loading their progress…'));
  const page = el('div', 'pm-teacher');
  page.append(back, body);
  canvas.replaceChildren(page);

  void call<ProfilePayload & { name: string }>('progress').then(
    (payload) => {
      if (disposed) return;
      body.replaceChildren(
        renderProfile(payload, {
          classId,
          teacher: { name: payload.name },
          loadReturned: () => call<{ items: ReturnedItem[] }>('returned').then((r) => r.items),
          loadPiece: (id) => call<PiecePayload>('piece', { item: id })
        })
      );
    },
    (error: unknown) => {
      if (!disposed) body.replaceChildren(el('p', 'pm-empty', errorText(error, 'Couldn’t load their progress. Try again.')));
    }
  );

  return { dispose: () => { disposed = true; } };
}
