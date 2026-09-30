/**
 * Day grid + start/end times, painted with the event composer's classes
 * (`.event-compose__cal*`, `.event-compose__time`). Values are wall-local
 * `YYYY-MM-DDTHH:mm` strings in the given zone; callers convert to UTC.
 */
function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function monthTitle(year: number, month: number): string {
  return new Date(year, month, 1).toLocaleString('en-AU', { month: 'long', year: 'numeric' });
}

function split(value: string): { date: string; time: string } {
  const [date = '', time = ''] = value.split('T');
  return { date, time: time.slice(0, 5) };
}

export type ComposeWhen = {
  root: HTMLElement;
  /** The times column, for extra fields (time zone, location). */
  times: HTMLElement;
  value: () => { start: string; end: string };
};

export function mountComposeWhen(options: { start: string; end: string }): ComposeWhen {
  let date = split(options.start).date;
  const startTime = el('input') as HTMLInputElement;
  startTime.type = 'time';
  startTime.value = split(options.start).time;
  startTime.setAttribute('aria-label', 'Start time');
  const endTime = el('input') as HTMLInputElement;
  endTime.type = 'time';
  endTime.value = split(options.end).time;
  endTime.setAttribute('aria-label', 'End time');

  // Moving the start keeps the length of the meeting.
  let lengthMin = minutes(endTime.value) - minutes(startTime.value);
  if (!(lengthMin > 0)) lengthMin = 60;
  startTime.addEventListener('input', () => {
    const next = minutes(startTime.value) + lengthMin;
    if (Number.isFinite(next) && next < 24 * 60) endTime.value = clock(next);
  });
  endTime.addEventListener('input', () => {
    const next = minutes(endTime.value) - minutes(startTime.value);
    if (next > 0) lengthMin = next;
  });

  let viewYear = Number(date.slice(0, 4));
  let viewMonth = Number(date.slice(5, 7)) - 1;
  const cal = el('div', 'event-compose__cal');
  const title = el('h2', 'event-compose__month-title');

  function paint(): void {
    title.textContent = monthTitle(viewYear, viewMonth);
    cal.replaceChildren();
    for (const day of ['M', 'T', 'W', 'T', 'F', 'S', 'S']) cal.append(el('span', 'event-compose__cal-head', day));
    const pad = (new Date(viewYear, viewMonth, 1).getDay() + 6) % 7;
    for (let i = 0; i < pad; i += 1) cal.append(el('span', 'event-compose__cal-day is-muted'));
    const days = new Date(viewYear, viewMonth + 1, 0).getDate();
    for (let day = 1; day <= days; day += 1) {
      const ymd = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const cell = el('button', `event-compose__cal-day${ymd === date ? ' is-on' : ''}`, String(day)) as HTMLButtonElement;
      cell.type = 'button';
      cell.setAttribute('aria-pressed', String(ymd === date));
      cell.addEventListener('click', () => {
        date = ymd;
        paint();
      });
      cal.append(cell);
    }
  }

  const prev = el('button', 'btn btn--ghost', '‹') as HTMLButtonElement;
  prev.type = 'button';
  prev.setAttribute('aria-label', 'Previous month');
  prev.addEventListener('click', () => {
    viewMonth -= 1;
    if (viewMonth < 0) {
      viewMonth = 11;
      viewYear -= 1;
    }
    paint();
  });
  const next = el('button', 'btn btn--ghost', '›') as HTMLButtonElement;
  next.type = 'button';
  next.setAttribute('aria-label', 'Next month');
  next.addEventListener('click', () => {
    viewMonth += 1;
    if (viewMonth > 11) {
      viewMonth = 0;
      viewYear += 1;
    }
    paint();
  });

  const nav = el('div', 'event-compose__month-nav');
  nav.append(prev, next);
  const month = el('div', 'event-compose__month');
  month.append(title, nav);
  const block = el('div', 'event-compose__cal-block');
  block.append(month, cal);

  const startRow = el('label', 'event-compose__time');
  startRow.append(el('span', 'event-compose__label', 'Starts'), startTime);
  const endRow = el('label', 'event-compose__time');
  endRow.append(el('span', 'event-compose__label', 'Ends'), endTime);
  const times = el('div', 'event-compose__times');
  times.append(startRow, endRow);

  const root = el('div', 'event-compose__when');
  root.append(block, times);
  paint();

  return {
    root,
    times,
    value: () => ({ start: `${date}T${startTime.value}`, end: `${date}T${endTime.value}` })
  };
}

function minutes(value: string): number {
  const [h, m] = value.split(':').map(Number);
  return (h ?? NaN) * 60 + (m ?? NaN);
}

function clock(total: number): string {
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}
