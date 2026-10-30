/** The `/mark/:classId/:columnId` page: loads the class's handed-in pieces and walks them one student at a time. */
import { apiPost } from '@/api/client';
import { el } from '@/quiz/dom';
import { errorText } from '@/quiz/dom';
import { markPieceView, type MarkPieceData } from './mark-piece';

type ListedStudent = { id: string; initials: string; name: string; handed_in_at: string | null; status: 'not_in' | 'waiting' | 'marking' | 'returned' };
type ListResponse = { column: { id: string; title: string }; students: ListedStudent[] };
type LoadResponse = Omit<MarkPieceData, 'position'>;

export function mountMarkPage(canvas: HTMLElement, classId: string, columnId: string, startStudent: string | null): { dispose: () => void } {
  let disposed = false;
  const call = <T>(body: Record<string, unknown>): Promise<T> =>
    apiPost<T>(`/api/classes/${encodeURIComponent(classId)}/pieces`, { column_id: columnId, ...body });
  canvas.replaceChildren(el('p', 'pm-empty', 'Loading the work…'));

  const fail = (error: unknown): void => {
    if (!disposed) canvas.replaceChildren(el('p', 'pm-empty', errorText(error, 'Couldn’t load this piece. Try again.')));
  };

  void call<ListResponse>({ action: 'list' }).then((list) => {
    if (disposed) return;
    const handed = list.students.filter((s) => s.status !== 'not_in');
    if (!handed.length) {
      canvas.replaceChildren(el('h2', 'mk-bar__name', list.column.title), el('p', 'pm-empty', 'Nobody has handed this in yet.'));
      return;
    }
    const firstWaiting = handed.find((s) => s.status === 'waiting') ?? handed[0]!;
    const open = (id: string): void => {
      const index = handed.findIndex((s) => s.id === id);
      void call<LoadResponse>({ action: 'load', student_id: id }).then((data) => {
        if (disposed) return;
        const url = new URL(window.location.href);
        url.searchParams.set('student', id);
        window.history.replaceState(null, '', url);
        const act = {
          save: (body: { tags: unknown[]; comment: string; steps: Record<string, string> }) => call({ action: 'save', student_id: id, ...body }),
          returnIt: () => call({ action: 'return', student_id: id }),
          takeBack: () => call({ action: 'take_back', student_id: id }),
          move: (by: -1 | 1) => {
            const target = handed[index + by];
            if (target) open(target.id);
          }
        };
        canvas.replaceChildren(markPieceView({ ...data, position: { index, total: handed.length } }, act));
      }, fail);
    };
    open((startStudent && handed.find((s) => s.id === startStudent)?.id) || firstWaiting.id);
  }, fail);

  return { dispose: () => { disposed = true; } };
}
