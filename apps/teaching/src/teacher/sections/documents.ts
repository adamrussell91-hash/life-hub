import { renderBlock } from '@/blocks/render';
import type { CurriculumResponse } from '@/teacher/nav';
import { renderPageHeader } from '@/teacher/page-header';

function importDate(iso: string | undefined): string {
  const date = iso ? new Date(iso) : null;
  if (!date || Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** Read-only page for an imported document (a Syllabus). Editing is out of scope for now. */
export function renderDocumentPage(
  canvas: HTMLElement,
  curriculum: CurriculumResponse,
  documentId: string
): { dispose: () => void } {
  canvas.replaceChildren();
  const doc = (curriculum.documents ?? []).find((entry) => entry.id === documentId);
  if (!doc) {
    renderPageHeader(canvas, { eyebrow: 'Syllabus', title: 'Document not found' });
    const status = document.createElement('p');
    status.className = 'teacher-layout__canvas-status';
    status.textContent = 'Document not found.';
    canvas.append(status);
    return { dispose: () => undefined };
  }

  const subject = curriculum.subjects.find((entry) => entry.id === doc.subject_id);
  renderPageHeader(canvas, { eyebrow: subject?.title ?? 'Syllabus', title: doc.title });

  const note = document.createElement('p');
  note.className = 'units-index__meta';
  note.dataset.documentSource = '';
  const when = importDate(doc.source?.imported_at);
  note.textContent = when ? `Imported from Notion on ${when}. Read-only.` : 'Imported from Notion. Read-only.';
  canvas.append(note);

  const body = document.createElement('div');
  body.className = 'document-page__blocks';
  for (const block of doc.blocks) body.append(renderBlock(block, 'teacher'));
  canvas.append(body);
  return { dispose: () => undefined };
}
