export interface ScheduleOverflowOptions {
  currentDate: string;
  isCurrent: boolean;
  onSetCurrent: () => void;
  onChangeDate: (date: string) => void;
}

let openMenu: HTMLElement | null = null;
let onDocPointer: ((event: PointerEvent) => void) | null = null;
let onDocKey: ((event: KeyboardEvent) => void) | null = null;

export function closeScheduleOverflow(): void {
  openMenu?.remove();
  openMenu = null;
  if (onDocPointer) {
    document.removeEventListener('pointerdown', onDocPointer, true);
    onDocPointer = null;
  }
  if (onDocKey) {
    document.removeEventListener('keydown', onDocKey);
    onDocKey = null;
  }
}

export function openScheduleOverflow(
  anchor: HTMLElement,
  options: ScheduleOverflowOptions
): void {
  closeScheduleOverflow();

  const menu = document.createElement('div');
  menu.className = 'schedule-overflow';
  menu.setAttribute('role', 'menu');

  if (!options.isCurrent) {
    const setCurrent = document.createElement('button');
    setCurrent.type = 'button';
    setCurrent.className = 'schedule-overflow__item';
    setCurrent.dataset.scheduleAction = 'set-current';
    setCurrent.setAttribute('role', 'menuitem');
    setCurrent.textContent = 'Set as current';
    setCurrent.addEventListener('click', () => {
      closeScheduleOverflow();
      options.onSetCurrent();
    });
    menu.append(setCurrent);
  }

  const changeDate = document.createElement('button');
  changeDate.type = 'button';
  changeDate.className = 'schedule-overflow__item';
  changeDate.dataset.scheduleAction = 'change-date';
  changeDate.setAttribute('role', 'menuitem');
  changeDate.textContent = 'Change date';
  changeDate.addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'date';
    input.className = 'schedule-overflow__date';
    input.value = options.currentDate;
    input.setAttribute('aria-label', 'Lesson date');
    input.addEventListener('change', () => {
      const next = input.value;
      if (!next || next === options.currentDate) return;
      closeScheduleOverflow();
      options.onChangeDate(next);
    });
    changeDate.replaceWith(input);
    input.focus();
    try {
      input.showPicker?.();
    } catch {
      // Native picker is optional (jsdom / some browsers).
    }
  });
  menu.append(changeDate);

  document.body.append(menu);
  openMenu = menu;

  const rect = anchor.getBoundingClientRect();
  const margin = 8;
  const menuWidth = menu.offsetWidth;
  const menuHeight = menu.offsetHeight;
  let left = rect.right - menuWidth;
  left = Math.min(Math.max(margin, left), window.innerWidth - menuWidth - margin);
  let top = rect.bottom + 4;
  if (top + menuHeight > window.innerHeight - margin) {
    top = Math.max(margin, rect.top - menuHeight - 4);
  }
  menu.style.position = 'fixed';
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;

  onDocPointer = (event: PointerEvent) => {
    const target = event.target;
    if (!(target instanceof Node)) return;
    if (menu.contains(target) || anchor.contains(target)) return;
    closeScheduleOverflow();
  };
  onDocKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape') closeScheduleOverflow();
  };
  document.addEventListener('pointerdown', onDocPointer, true);
  document.addEventListener('keydown', onDocKey);
}
