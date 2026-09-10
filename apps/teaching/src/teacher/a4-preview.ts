import { A4 } from '@/print/a4';
import { openPrintLesson } from '@/print/open-print';
import { renderPrintLesson } from '@/print/render-print-lesson';
import type { Lesson } from '@/schemas/lesson';

export interface A4PreviewHandle {
  update(lesson: Lesson): void;
  dispose(): void;
}

export function mountA4Preview(host: HTMLElement): A4PreviewHandle {
  host.classList.add('a4-preview');

  const meta = document.createElement('div');
  meta.className = 'a4-preview__meta';

  const pages = document.createElement('p');
  pages.className = 'a4-preview__pages';
  pages.textContent = '1 page';

  const printBtn = document.createElement('button');
  printBtn.type = 'button';
  printBtn.className = 'btn btn--secondary';
  printBtn.textContent = 'Print';

  meta.append(pages, printBtn);

  const viewport = document.createElement('div');
  viewport.className = 'a4-preview__viewport';

  const scaleWrap = document.createElement('div');
  scaleWrap.className = 'a4-preview__scale';
  viewport.append(scaleWrap);

  host.replaceChildren(meta, viewport);

  let current: Lesson | null = null;

  function fitScale(): void {
    const paper = scaleWrap.querySelector('.print-document') as HTMLElement | null;
    if (!paper) return;
    const available = viewport.clientWidth - 8;
    const natural = paper.offsetWidth || 1;
    const s = Math.min(1, available / natural);
    scaleWrap.style.transform = `scale(${s})`;
    scaleWrap.style.height = `${paper.offsetHeight * s}px`;
  }

  function update(lesson: Lesson): void {
    current = lesson;
    const paper = renderPrintLesson(lesson);
    scaleWrap.replaceChildren(paper);

    const pagePx = (paper.offsetWidth * A4.heightMm) / A4.widthMm;
    const count = Math.max(1, Math.ceil(paper.scrollHeight / Math.max(pagePx, 1)));
    pages.textContent = count === 1 ? '1 page' : `${count} pages`;
    fitScale();
  }

  printBtn.addEventListener('click', () => {
    if (current) openPrintLesson(current);
  });

  const onResize = () => fitScale();
  window.addEventListener('resize', onResize);

  return {
    update,
    dispose() {
      window.removeEventListener('resize', onResize);
      host.replaceChildren();
    }
  };
}
