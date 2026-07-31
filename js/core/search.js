import { isCalendarDate } from './time.js';

const CATEGORY = {
  meal: 'nutrition',
  workout: 'fitness',
  diary: 'diary',
  skincare: 'skincare',
  weight: 'body',
  composition: 'body',
  measurements: 'body',
  sleep: 'sleep'
};

function searchText(event) {
  const record = event.record;
  const values = [
    event.body,
    record.title,
    record.meal,
    record.highlights,
    record.challenges,
    ...(Array.isArray(record.tags) ? record.tags : [])
  ];
  return values.filter(value => value !== null && value !== undefined && value !== '').join(' ');
}

export function searchEvents(events, query) {
  const terms = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);

  return events.map((event, index) => {
    const raw = searchText(event);
    return { event, index, raw, text: raw.toLocaleLowerCase() };
  }).filter(({ text }) => terms.every(term => text.includes(term)))
    .sort((a, b) => b.event.record.date.localeCompare(a.event.record.date) || a.index - b.index)
    .map(({ event, raw }) => ({
      id: event.record.id,
      date: event.record.date,
      type: event.record.type,
      snippet: raw.slice(0, 160)
    }));
}

export function buildCalendarMarkers(events) {
  const days = {};
  for (const { record } of events) {
    const category = CATEGORY[record.type];
    if (!category) continue;
    days[record.date] ||= [];
    if (!days[record.date].includes(category)) days[record.date].push(category);
  }
  return days;
}

export function getSearchExtension(currentStart) {
  if (!isCalendarDate(currentStart)) throw new TypeError(`Invalid calendar date: ${currentStart}`);
  const match = /^(\d{4})-(\d{2})-\d{2}$/.exec(currentStart);

  const monthIndex = Number(match[1]) * 12 + Number(match[2]) - 4;
  const year = Math.floor(monthIndex / 12);
  const month = (monthIndex % 12) + 1;
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-01`;
}
