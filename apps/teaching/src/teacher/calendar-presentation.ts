export interface CalendarPresentationOptions {
  onAdd?: () => void;
  addLabel?: string;
}

/**
 * Teaching Hub calendar presentation shared by dashboard and class pages.
 * The underlying calendar keeps its scheduling model, while the reading view
 * stays compact: day numbers only, no persistent compose rail, one add action.
 */
export function applyCalendarPresentation(
  host: HTMLElement,
  options: CalendarPresentationOptions = {}
): void {
  const root = host.querySelector<HTMLElement>(':scope > .class-calendar');
  if (!root) return;

  const workspace = root.querySelector<HTMLElement>('.hub-calendar__workspace');
  const rail = root.querySelector<HTMLElement>('[data-calendar="rail"]');
  if (rail) rail.hidden = true;
  if (workspace) workspace.style.gridTemplateColumns = 'minmax(0, 1fr)';

  for (const dated of root.querySelectorAll<HTMLElement>('[data-date]')) {
    const date = dated.dataset.date;
    const num = dated.querySelector<HTMLElement>('.class-calendar__day-num');
    if (!date || !num || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    num.textContent = String(Number(date.slice(8, 10)));
  }

  for (const dayAdd of root.querySelectorAll<HTMLElement>(
    '.class-calendar__week-heading > .icon-plus-btn'
  )) {
    dayAdd.hidden = true;
  }

  const nav = root.querySelector<HTMLElement>('.hub-calendar__nav');
  let add = root.querySelector<HTMLButtonElement>('[data-calendar-quick-add]');

  if (!options.onAdd) {
    add?.remove();
    return;
  }

  if (!add) {
    add = document.createElement('button');
    add.type = 'button';
    add.className = 'icon-plus-btn class-calendar__quick-add';
    add.dataset.calendarQuickAdd = '';
    nav?.append(add);
  }

  add.textContent = '+';
  add.setAttribute('aria-label', options.addLabel ?? 'Add lessons to calendar');
  add.onclick = () => options.onAdd?.();
}
