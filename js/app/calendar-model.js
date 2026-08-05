import { buildCalendarMarkers } from '../core/search.js';
import { addCalendarDays, enumerateDateKeys, getSydneyWeekStart, isCalendarDate } from '../core/time.js';

const weekdayLetter = date => new Intl.DateTimeFormat('en-AU', {
  weekday: 'narrow'
}).format(new Date(`${date}T12:00:00+10:00`));

const monthLabel = yearMonth => new Intl.DateTimeFormat('en-AU', {
  month: 'long',
  year: 'numeric',
  timeZone: 'Australia/Sydney'
}).format(new Date(`${yearMonth}-01T12:00:00+10:00`));

export function yearMonthFromDate(date) {
  if (!isCalendarDate(date)) throw new TypeError(`Invalid calendar date: ${date}`);
  return date.slice(0, 7);
}

export function shiftYearMonth(yearMonth, delta) {
  const [year, month] = yearMonth.split('-').map(Number);
  const index = year * 12 + (month - 1) + delta;
  const nextYear = Math.floor(index / 12);
  const nextMonth = (index % 12) + 1;
  return `${String(nextYear).padStart(4, '0')}-${String(nextMonth).padStart(2, '0')}`;
}

export function monthGridRange(yearMonth) {
  const first = `${yearMonth}-01`;
  if (!isCalendarDate(first)) throw new TypeError(`Invalid year-month: ${yearMonth}`);
  const [year, month] = yearMonth.split('-').map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const last = `${yearMonth}-${String(lastDay).padStart(2, '0')}`;
  const start = getSydneyWeekStart(first);
  const end = addCalendarDays(getSydneyWeekStart(last), 6);
  return { start, end, first, last };
}

export function eventDetailTitle(record, body = '') {
  if (!record) return 'Event';
  switch (record.type) {
    case 'meal':
      return record.meal ? String(record.meal) : 'Meal';
    case 'workout':
      return record.title || 'Workout';
    case 'diary':
      return record.mood ? `Diary · ${record.mood}` : 'Diary';
    case 'skincare': {
      if (String(body).startsWith('Procedure:')) {
        return String(body).split('\n')[0].replace(/^Procedure:\s*/, '').replace(/\.\s*$/, '') || 'Procedure';
      }
      return record.routine === 'am' ? 'Skincare · AM' : record.routine === 'pm' ? 'Skincare · PM' : 'Skincare';
    }
    case 'weight':
    case 'composition':
    case 'measurements':
      return 'Body';
    case 'sleep':
      return 'Sleep';
    default:
      return record.type || 'Event';
  }
}

export function eventsForDate(events, date) {
  return (events ?? [])
    .filter(event => event?.record?.date === date)
    .map(event => ({
      path: event.path,
      type: event.record.type,
      title: eventDetailTitle(event.record, event.body),
      snippet: String(event.body ?? '').trim().slice(0, 160),
      categories: buildCalendarMarkers([event])[date] ?? []
    }))
    .sort((a, b) => a.type.localeCompare(b.type) || a.title.localeCompare(b.title));
}

export function buildCalendarModel({
  events,
  date,
  selectedDate,
  viewMonth
}) {
  if (!date) throw new RangeError('Calendar display date is unavailable');
  const selected = selectedDate && isCalendarDate(selectedDate) ? selectedDate : date;
  const month = viewMonth && /^\d{4}-\d{2}$/.test(viewMonth) ? viewMonth : yearMonthFromDate(selected);
  const markers = buildCalendarMarkers(events ?? []);
  const weekStart = getSydneyWeekStart(date);
  const weekDates = enumerateDateKeys(weekStart, addCalendarDays(weekStart, 6));
  const { start, end } = monthGridRange(month);
  const monthDates = enumerateDateKeys(start, end);

  return {
    date,
    selectedDate: selected,
    viewMonth: month,
    monthLabel: monthLabel(month),
    weekDays: weekDates.map(day => ({
      date: day,
      letter: weekdayLetter(day),
      categories: markers[day] ?? [],
      isToday: day === date,
      isSelected: day === selected
    })),
    monthDays: monthDates.map(day => ({
      date: day,
      day: Number(day.slice(8, 10)),
      categories: markers[day] ?? [],
      inMonth: day.startsWith(month),
      isToday: day === date,
      isSelected: day === selected
    })),
    dayEvents: eventsForDate(events, selected)
  };
}
