/**
 * Public share sheet page `/s/sheets/:token`. noindex, no hub chrome, nothing to type into.
 */
import { apiGet, ApiClientError } from '@/api/client';
import { ensureNoIndex } from '@/student/feedback-view';
import { renderSharedSheet, type SharedSheet } from '@/student/sheet-render';
import { createStudentShell, renderStudentStatus } from '@/student/shell';

export type StudentSheetViewHandle = { dispose(): void };

export function mountStudentSheetView(options: {
  root: HTMLElement;
  token: string;
  isStale?: () => boolean;
}): StudentSheetViewHandle {
  const { root, token, isStale = () => false } = options;
  const clearNoIndex = ensureNoIndex();
  let disposed = false;
  let sheetHandle: ReturnType<typeof renderSharedSheet> | null = null;

  root.replaceChildren();
  const { surface, header, content } = createStudentShell('student-sheet-surface');
  // A sheet is from the sender, so it carries no class site name.
  header.remove();
  root.append(surface);
  renderStudentStatus(content, 'Loading…');

  void (async () => {
    try {
      const sheet = await apiGet<SharedSheet>(`/api/published/sheets/${encodeURIComponent(token)}`);
      if (disposed || isStale()) return;
      document.title = sheet.title;
      sheetHandle = renderSharedSheet(sheet);
      content.replaceChildren(sheetHandle.el);
    } catch (error) {
      if (disposed || isStale()) return;
      const gone = error instanceof ApiClientError && error.code === 'not_found';
      renderStudentStatus(content, gone ? 'This sheet is no longer shared.' : 'This sheet could not load. Refresh to try again.');
    }
  })();

  return {
    dispose() {
      disposed = true;
      sheetHandle?.dispose();
      clearNoIndex();
    }
  };
}
