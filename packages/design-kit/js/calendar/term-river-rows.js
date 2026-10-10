/** Compact Term rows and continuous span tracks. */
import { addDaysKey, buildTimeScale } from '../school-time.js';
import { formatDisplayDate } from '../format-display-date.js';
import { riverWeekLabel, weeksBetween } from './term-river.js';

let serial = 0;

export function mountCompactRiver({ doc, card, lanes, grouped, window: range, terms = [], today, capacity = new Map(), loads = [], nodes = new Map(), phone = false }) {
  const rowHeight = phone ? 44 : 28;
  const weeks = weeksBetween(range.from, range.to);
  const first = weeks[0] ?? range.from;
  const totalDays = Math.max(7, weeks.length * 7);
  // Holiday weeks stay at least 200px wide; school days retain their 1 / .65
  // proportion across week headers, spanning bars and the readiness graph.
  const scale = buildTimeScale({ start: first, end: addDaysKey(first, totalDays), terms, dayWidth: 200 / (7 * .65), holidayFactor: range.holidayFactor ?? .65 });
  const timelineWidth = scale.x(addDaysKey(first, totalDays));
  const weekWidths = weeks.map(week => scale.x(addDaysKey(week, 7)) - scale.x(week));
  const append = (parent, tag, cls, text) => {
    const node = doc.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    parent.append(node);
    return node;
  };
  const element = append(card, 'div', 'tr-rows' + (phone ? ' is-phone' : ''));
  element.setAttribute('data-part', 'compact-river');
  element.style.setProperty('--tr-row-height', rowHeight + 'px');
  element.style.setProperty('--tr-week-count', String(weeks.length));
  element.style.setProperty('--tr-timeline-width', timelineWidth + 'px');
  element.style.setProperty('--tr-week-columns', weekWidths.map(width => width + 'px').join(' '));
  element.setAttribute('aria-label', 'Term commitments by week');
  const scroll = append(element, 'div', 'tr-rows__scroll');
  scroll.tabIndex = 0;
  scroll.setAttribute('aria-label', 'Scroll through term weeks');
  const tooltip = append(doc.body, 'div', 'tr-rows-tooltip');
  tooltip.id = 'tr-rows-title-' + ++serial;
  tooltip.setAttribute('role', 'tooltip');
  tooltip.hidden = true;
  let active = null;
  let hideTimer = null;
  const registered = [];
  const dismiss = () => {
    clearTimeout(hideTimer);
    active?.removeAttribute('aria-describedby');
    active?.classList.remove('is-reading-title');
    active = null;
    tooltip.hidden = true;
  };
  const deferDismiss = () => { clearTimeout(hideTimer); hideTimer = setTimeout(dismiss, 180); };
  tooltip.addEventListener('mouseenter', () => clearTimeout(hideTimer));
  tooltip.addEventListener('mouseleave', dismiss);
  const show = (button, item) => {
    dismiss();
    active = button;
    tooltip.textContent = item.title ?? '';
    tooltip.hidden = false;
    button.setAttribute('aria-describedby', tooltip.id);
    const viewport = button.querySelector('.tr-rows__title');
    const titleText = button.querySelector('.tr-rows__title-text');
    const shift = Math.max(0, (titleText?.scrollWidth ?? 0) - (viewport?.clientWidth ?? 0));
    if (shift > 0) {
      button.style.setProperty('--tr-title-shift', -shift + 'px');
      button.style.setProperty('--tr-title-duration', Math.min(14, 2 + shift / 40) + 's');
      button.classList.add('is-reading-title');
    }
    const bounds = button.getBoundingClientRect();
    const view = doc.defaultView;
    const width = Math.min(420, Math.max(160, (view?.innerWidth ?? 800) - 24));
    tooltip.style.width = width + 'px';
    tooltip.style.left = Math.max(12, Math.min(bounds.left, (view?.innerWidth ?? 800) - width - 12)) + 'px';
    const room = (view?.innerHeight ?? 600) - bounds.bottom - 12;
    const below = room >= 100;
    tooltip.style.maxHeight = Math.max(64, Math.min(240, below ? room - 8 : bounds.top - 20)) + 'px';
    tooltip.style.top = below ? bounds.bottom + 6 + 'px' : '';
    tooltip.style.bottom = below ? '' : Math.max(12, (view?.innerHeight ?? 600) - bounds.top + 6) + 'px';
  };
  const itemButton = (item, parent, bar = false) => {
    const button = append(parent, 'button', 'tr-rows__item' + (bar ? ' tr-rows__bar' : '') + (item.ghost ? ' is-ghost' : ''));
    button.type = 'button';
    button.setAttribute('data-part', item.ghost ? 'ghost' : 'item');
    button.setAttribute('data-id', item.id);
    const when = bar ? formatDisplayDate(item.from) + ' – ' + formatDisplayDate(item.to) : formatDisplayDate(item.date);
    button.setAttribute('aria-label', when + ' · ' + (item.title ?? ''));
    button.title = when + ' · ' + (item.title ?? '');
    if (!bar) {
      append(button, 'span', 'tr-rows__date', formatDisplayDate(item.date));
      const shape = item.shape === 'diamond' || item.type === 'task' ? 'diamond' : 'circle';
      append(button, 'i', 'tr-rows__marker is-' + shape).setAttribute('aria-hidden', 'true');
    }
    append(append(button, 'span', 'tr-rows__title'), 'span', 'tr-rows__title-text', item.title ?? '');
    nodes.set('row:' + item.id, button);
    registered.push(['row:' + item.id, button]);
    button.addEventListener('mouseenter', () => show(button, item));
    button.addEventListener('mouseleave', deferDismiss);
    button.addEventListener('focus', () => show(button, item));
    button.addEventListener('blur', dismiss);
    return button;
  };
  const header = append(scroll, 'div', 'tr-rows__header');
  append(header, 'div', 'tr-rows__label', 'Identity');
  const headings = append(header, 'div', 'tr-rows__weeks');
  for (const week of weeks) {
    const heading = append(headings, 'div', 'tr-rows__week-heading');
    append(heading, 'b', '', riverWeekLabel(week, terms));
    append(heading, 'span', '', formatDisplayDate(week) + ' – ' + formatDisplayDate(addDaysKey(week, 6)));
    if (today >= week && today <= addDaysKey(week, 6)) heading.classList.add('is-current');
  }
  const inRange = item => !item.sample && item.shape !== 'hum' && (item.shape === 'bar'
    ? item.from <= range.to && item.to >= range.from
    : item.date >= range.from && item.date <= range.to);
  for (const lane of lanes) {
    const section = append(scroll, 'section', 'tr-rows__lane is-' + lane.id);
    section.setAttribute('data-lane', lane.id);
    const laneLabel = append(section, 'div', 'tr-rows__label');
    append(laneLabel, 'h3', '', lane.label);
    if (lane.id === 'body' && today >= range.from && today <= range.to && capacity.has(today)) {
      const row = capacity.get(today);
      const value = append(laneLabel, 'p', 'tr-rows__capacity-value', `Today ${row.pct}%${row.forecast ? ' · forecast' : ''}`);
      value.setAttribute('data-part', 'capacity-value');
      if (row.note) value.title = row.note;
    }
    const content = append(section, 'div', 'tr-rows__content');
    const items = [...(grouped[lane.id] ?? [])].filter(inRange).sort((a, b) => String(a.from ?? a.date).localeCompare(String(b.from ?? b.date)) || String(a.title).localeCompare(String(b.title)));
    if (lane.id === 'body') mountCapacity(content);
    const spans = items.filter(item => item.shape === 'bar');
    if (spans.length) {
      const tracks = [];
      const canvas = append(content, 'div', 'tr-rows__spans');
      for (const item of spans) {
        let track = tracks.findIndex(end => end < item.from);
        if (track < 0) track = tracks.length;
        tracks[track] = item.to;
        const button = itemButton(item, canvas, true);
        const start = Math.max(0, scale.x(item.from));
        const end = Math.min(timelineWidth, scale.x(addDaysKey(item.to, 1)));
        button.style.left = start / timelineWidth * 100 + '%';
        button.style.width = Math.max(0, end - start) / timelineWidth * 100 + '%';
        button.style.top = track * rowHeight + 'px';
        button.setAttribute('data-track', String(track));
      }
      canvas.style.height = tracks.length * rowHeight + 'px';
    }
    const columns = append(content, 'div', 'tr-rows__weeks');
    for (const week of weeks) {
      const column = append(columns, 'div', 'tr-rows__week');
      for (const item of items.filter(item => item.shape !== 'bar' && item.date >= week && item.date <= addDaysKey(week, 6))) itemButton(item, column);
    }
  }
  if (loads.length) {
    const section = append(scroll, 'section', 'tr-rows__lane tr-rows__loads');
    section.setAttribute('data-part', 'weekly-load');
    append(section, 'div', 'tr-rows__label', 'Weekly load');
    const columns = append(section, 'div', 'tr-rows__weeks');
    for (const week of weeks) {
      const row = loads.find(load => load.week === week);
      const column = append(columns, 'div', 'tr-rows__load' + (row?.over ? ' is-over' : ''));
      if (row) {
        append(column, 'span', '', row.booked + 'h / ' + row.capacity + 'h');
        column.title = 'Booked discretionary hours / capacity budget' + (row.over ? ' · over capacity' : '');
        const track = append(column, 'div', 'tr-rows__load-track');
        const fill = append(track, 'div', 'tr-rows__load-fill');
        fill.style.width = Math.min(100, row.capacity > 0 ? row.booked / row.capacity * 100 : row.booked > 0 ? 100 : 0) + '%';
      }
    }
  }
  function mountCapacity(parent) {
    const ns = 'http://www.w3.org/2000/svg';
    const graph = doc.createElementNS(ns, 'svg');
    graph.classList.add('tr-rows__capacity');
    graph.setAttribute('data-part', 'capacity');
    graph.setAttribute('viewBox', '0 0 ' + timelineWidth + ' 92');
    graph.setAttribute('preserveAspectRatio', 'none');
    graph.setAttribute('role', 'img');
    graph.setAttribute('aria-label', 'Body capacity from readiness: recorded solid, forecast dashed; 40 percent threshold');
    parent.append(graph);
    const width = timelineWidth;
    const X = date => (scale.x(date) + scale.x(addDaysKey(date, 1))) / 2;
    const Y = pct => 80 - Math.max(0, Math.min(100, Number(pct) || 0)) * 0.68;
    const rows = [...capacity.entries()].filter(([date]) => date >= first && date < addDaysKey(first, totalDays)).sort(([a], [b]) => a.localeCompare(b));
    const svg = (tag, cls, attrs) => {
      const node = doc.createElementNS(ns, tag);
      node.setAttribute('class', cls);
      for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
      graph.append(node);
      return node;
    };
    const coord = (date, pct) => X(date).toFixed(2) + ' ' + Y(pct).toFixed(2);
    const segments = [];
    for (const row of rows) {
      const previous = segments.at(-1);
      const forecast = row[1].forecast === true;
      const contiguous = previous && addDaysKey(previous.rows.at(-1)[0], 1) === row[0];
      if (!previous || previous.forecast !== forecast || !contiguous) segments.push({ forecast, rows: contiguous ? [previous.rows.at(-1), row] : [row] });
      else previous.rows.push(row);
    }
    for (const segment of segments) {
      if (segment.forecast) {
        const forecastRows = segment.rows.filter(([, row]) => row.forecast && Number.isFinite(row.low) && Number.isFinite(row.high));
        const up = forecastRows.map(([date, row], i) => (i ? 'L' : 'M') + coord(date, row.high)).join(' ');
        const down = [...forecastRows].reverse().map(([date, row]) => 'L' + coord(date, row.low)).join(' ');
        if (forecastRows.length) svg('path', 'tr-rows__capacity-band', { d: up + ' ' + down + ' Z' });
      }
      const path = segment.rows.map(([date, row], i) => (i ? 'L' : 'M') + coord(date, row.pct)).join(' ');
      svg('path', 'tr-rows__capacity-line ' + (segment.forecast ? 'is-forecast' : 'is-logged'), { d: path });
    }
    svg('line', 'tr-rows__soften', { x1: 0, x2: width, y1: Y(40), y2: Y(40) });
    svg('text', 'tr-rows__soften-label', { x: width - 8, y: Y(40) - 4, 'text-anchor': 'end' }).textContent = '40%';
  }
  scroll.addEventListener('scroll', dismiss, { passive: true });
  const onKey = event => { if (event.key === 'Escape') dismiss(); };
  element.addEventListener('keydown', onKey);
  return { element, scroll, dispose() {
    dismiss();
    tooltip.remove();
    element.removeEventListener('keydown', onKey);
    scroll.removeEventListener('scroll', dismiss);
    for (const [key, node] of registered) if (nodes.get(key) === node) nodes.delete(key);
  } };
}
