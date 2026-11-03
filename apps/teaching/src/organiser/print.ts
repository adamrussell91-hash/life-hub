import './organiser.css';
import type { Sheet, SheetSection } from './types';

/**
 * Print what is released so far: page 1 the full sheet, page 2 a blank copy to rebuild it from
 * memory. The blank copy leaves "usually hide" columns empty and turns sequence items into ruled lines.
 * Both teacher and student side call this. It fills a host fixed to the body, calls window.print(),
 * and @media print (organiser.css) hides everything else.
 */

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function printSection(section: SheetSection, blank: boolean): HTMLElement {
  const wrap = el('div', 'ko-print__section');
  wrap.append(el('h4', 'ko-print__name', section.name));
  if (section.kind === 'table') {
    const columns = section.columns ?? [];
    const table = el('table', 'ko-print__table');
    const head = el('tr');
    for (const column of columns) head.append(el('th', undefined, column.label));
    table.append(head);
    for (const line of section.lines) {
      const row = el('tr');
      columns.forEach((column, i) => {
        const cell = el('td');
        if (blank && column.hide) cell.classList.add('ko-print__blank');
        else cell.textContent = line.cells[i] ?? '';
        row.append(cell);
      });
      table.append(row);
    }
    wrap.append(table);
    return wrap;
  }
  const list = el(section.kind === 'sequence' ? 'ol' : 'ul', 'ko-print__list');
  for (const line of section.lines) {
    const item = el('li');
    if (blank && section.kind === 'sequence') item.append(el('div', 'ko-print__ruled'));
    else item.textContent = line.cells[0] ?? '';
    list.append(item);
  }
  wrap.append(list);
  return wrap;
}

/** The two pages as one element (exported for tests and previews). */
export function buildPrintPages(sheet: Sheet): HTMLElement {
  const host = el('div', 'ko-print-host');
  const full = el('section', 'ko-print__page');
  full.append(el('h3', 'ko-print__title', `${sheet.title}: organiser`));
  for (const section of sheet.sections) full.append(printSection(section, false));
  const blank = el('section', 'ko-print__page ko-print__page--blank');
  blank.append(el('h3', 'ko-print__title', `${sheet.title}: from memory`));
  blank.append(el('p', 'ko-print__tag', 'Fill in the empty spaces, then check against page 1.'));
  for (const section of sheet.sections) blank.append(printSection(section, true));
  host.append(full, blank);
  return host;
}

export function printOrganiser(sheet: Sheet): void {
  document.querySelectorAll('.ko-print-host').forEach((node) => node.remove());
  const host = buildPrintPages(sheet);
  document.body.append(host);
  const done = (): void => {
    window.removeEventListener('afterprint', done);
    host.remove();
  };
  window.addEventListener('afterprint', done);
  window.print();
}
