import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDayTimeline,
  classCodesFrom,
  countMeetingsThisWeek,
  dueLabel,
  formatClock,
  formatLessonWhen,
  hubJumpLines,
  isOpenTask,
  lessonsThisWeek,
  nowTasks,
  readingNow,
  taskSummary,
  upcomingLesson
} from '../../apps/life/js/shell/now-panel-model.js';

const TODAY = '2026-10-10'; // a Saturday

const lesson = (id, date, time, extra = {}) => ({
  path: `teaching:${id}`,
  record: { type: 'scheduled_lesson', id, date, time, duration_min: 60, title: `Lesson ${id}`, class_title: '12ENGADV1', ...extra }
});
const feed = (id, date, time, end) => ({
  path: `ical:${id}`,
  record: { type: 'ical_event', id, date, time, end_time: end, title: `Event ${id}`, feed: 'work' }
});

test('formatClock reads as a person would write the time', () => {
  assert.equal(formatClock(8.8333), '8:50 am');
  assert.equal(formatClock(12), '12:00 pm');
  assert.equal(formatClock(15.5), '3:30 pm');
  assert.equal(formatClock(0), '12:00 am');
});

test('the timeline keeps timed events for the date, drops logs and other days, and lanes overlaps', () => {
  const model = buildDayTimeline({
    events: [
      lesson('a', TODAY, '08:50'),
      feed('b', TODAY, '09:15', '10:00'),
      lesson('c', '2026-10-12', '08:50'),
      { path: 'meal:1', record: { type: 'meal', id: 'm1', date: TODAY, time: '12:00' } }
    ],
    date: TODAY,
    nowMinutes: 8 * 60
  });
  assert.deepEqual(model.blocks.map(block => block.id), ['a', 'b']);
  assert.equal(model.blocks[0].tone, 'lesson');
  assert.equal(model.blocks[1].tone, 'calendar');
  assert.equal(model.blocks[1].lane, 1, 'the overlapping event drops to a second lane');
  assert.equal(model.lanes, 2);
  assert.equal(model.blocks[0].next, true);
});

test('the timeline headline counts what is left today and what is due', () => {
  const tasks = [
    { id: 't1', title: 'Mark essays', status: 'open', due_date: TODAY, due_time: '15:00' },
    { id: 't2', title: 'Physio', status: 'open', due_date: TODAY },
    { id: 't3', title: 'Done already', status: 'done', due_date: TODAY }
  ];
  const evening = buildDayTimeline({ events: [feed('gym', TODAY, '08:00', '09:15')], tasks, date: TODAY, nowMinutes: 17 * 60 + 53 });
  assert.equal(evening.headline, 'Free evening. 2 tasks due today.');
  assert.equal(evening.blocks[0].past, true);
  assert.deepEqual(evening.pins.map(pin => pin.id), ['t1'], 'only a task with a due time gets a pin');

  const morning = buildDayTimeline({ events: [lesson('a', TODAY, '08:50'), lesson('b', TODAY, '10:00')], date: TODAY, nowMinutes: 9 * 60 });
  assert.equal(morning.headline, '1 lesson left. Nothing due today.');
  assert.match(morning.sub, /free from 11:00 am$/);
});

test('another day reads as a plan, with no now line or past', () => {
  const model = buildDayTimeline({ events: [lesson('a', '2026-10-12', '08:50'), lesson('b', '2026-10-12', '09:50')], date: '2026-10-12' });
  assert.equal(model.isToday, false);
  assert.equal(model.headline, '2 lessons, first at 8:50 am. Nothing due.');
  assert.ok(model.blocks.every(block => !block.past));
});

test('the strip fits the day: at least eight hours, covering every block and now', () => {
  const late = buildDayTimeline({ events: [feed('late', TODAY, '21:30', '22:45')], date: TODAY, nowMinutes: 600 });
  assert.deepEqual([late.rangeStart, late.rangeEnd], [10, 23]);
  const school = buildDayTimeline({ events: [lesson('a', '2026-10-12', '08:50'), lesson('b', '2026-10-12', '14:10')], date: '2026-10-12' });
  assert.deepEqual([school.rangeStart, school.rangeEnd], [8, 16]);
  const empty = buildDayTimeline({ events: [], date: TODAY, nowMinutes: 600 });
  assert.deepEqual([empty.rangeStart, empty.rangeEnd], [7, 21]);
});

const CURRICULUM = {
  classes: [{ id: 'c1', code: '12ENGADV1', title: 'Year 12 English Advanced' }],
  lessons: [{ id: 'l1', title: 'Hamlet, Act 3' }],
  scheduled_lessons: [
    { id: 's0', class_id: 'c1', lesson_id: 'l1', date: '2026-10-09', start_time: '09:00', delivery_status: 'planned' },
    { id: 's1', class_id: 'c1', lesson_id: 'l1', date: '2026-10-12', start_time: '08:50', delivery_status: 'planned' },
    { id: 's2', class_id: 'c1', lesson_id: 'l1', date: '2026-10-12', start_time: '11:00', delivery_status: 'cancelled' },
    { id: 's3', class_id: 'c1', lesson_id: 'l1', date: '2026-10-19', start_time: '08:50', delivery_status: 'planned' }
  ]
};

test('the next lesson looks past a weekend to Monday', () => {
  const next = upcomingLesson(CURRICULUM, { date: TODAY, nowMinutes: 18 * 60 });
  assert.equal(next.id, 's1');
  assert.equal(next.classTitle, '12ENGADV1');
  assert.equal(next.lessonTitle, 'Hamlet, Act 3');
  assert.equal(formatLessonWhen(next, TODAY), 'Mon 12/10 8:50 am');
  assert.equal(formatLessonWhen({ date: '2026-10-11', startTime: '09:00' }, TODAY), 'Tomorrow 9:00 am');
});

test('a lesson already started today is not "next"', () => {
  const data = { ...CURRICULUM, scheduled_lessons: [{ id: 'x', class_id: 'c1', date: TODAY, start_time: '09:00' }, ...CURRICULUM.scheduled_lessons] };
  assert.equal(upcomingLesson(data, { date: TODAY, nowMinutes: 10 * 60 }).id, 's1');
  assert.equal(upcomingLesson(data, { date: TODAY, nowMinutes: 8 * 60 }).id, 'x');
});

test('lessons this week counts Monday to Sunday and skips cancelled ones', () => {
  assert.equal(lessonsThisWeek(CURRICULUM, TODAY), 1);
  assert.equal(lessonsThisWeek(CURRICULUM, '2026-10-13'), 1);
});

test('due labels say how late, today, a weekday this week, or the date', () => {
  assert.equal(dueLabel('2026-10-08', TODAY), '2 days late');
  assert.equal(dueLabel('2026-10-09', TODAY), '1 day late');
  assert.equal(dueLabel(TODAY, TODAY), 'Today');
  assert.equal(dueLabel('2026-10-11', TODAY), 'Tomorrow');
  assert.equal(dueLabel('2026-10-14', TODAY), 'Wed');
  assert.equal(dueLabel('2026-10-30', TODAY), '30/10');
  assert.equal(dueLabel(null, TODAY), '');
});

test('the task list orders overdue, today, dated, then undated newest first, and filters by hub', () => {
  const tasks = [
    { id: 'undated-old', title: 'a', status: 'open', domain: 'life', created_at: '2026-01-01' },
    { id: 'undated-new', title: 'b', status: 'open', domain: 'life', created_at: '2026-10-09' },
    { id: 'later', title: 'c', status: 'open', domain: 'teaching', due_date: '2026-10-14' },
    { id: 'today', title: 'd', status: 'open', domain: 'teaching', due_date: TODAY },
    { id: 'over', title: 'e', status: 'open', domain: 'life', due_date: '2026-10-01' },
    { id: 'gone', title: 'f', status: 'done', domain: 'life', due_date: '2026-10-01' }
  ];
  assert.deepEqual(nowTasks(tasks, { today: TODAY }).map(task => task.id), ['over', 'today', 'later', 'undated-new', 'undated-old']);
  assert.deepEqual(nowTasks(tasks, { today: TODAY, domain: 'teaching' }).map(task => task.id), ['today', 'later']);
  assert.equal(nowTasks(tasks, { today: TODAY })[1].hub, 'School');
  assert.deepEqual(taskSummary(tasks, TODAY), { open: 5, overdue: 1, dueToday: 1 });
});

test('Home open work excludes Someday and Goals', () => {
  const board = { id: 'board', title: 'Pay rates', status: 'open', domain: 'life', due_date: TODAY };
  const someday = {
    id: 'someday',
    title: 'See a performance at the Royal Albert Hall',
    status: 'deferred',
    domain: 'life',
    bucket: 'someday',
    someday_kind: 'bucket_list'
  };
  const goal = {
    id: 'goal_1',
    title: 'Run a half marathon',
    status: 'active',
    sphere: 'life',
    structure: 'woop'
  };
  const tasks = [board, someday, goal];
  assert.equal(isOpenTask(board), true);
  assert.equal(isOpenTask(someday), false);
  assert.equal(isOpenTask(goal), false);
  assert.deepEqual(nowTasks(tasks, { today: TODAY }).map(task => task.id), ['board']);
  assert.deepEqual(taskSummary(tasks, TODAY), { open: 1, overdue: 0, dueToday: 1 });
});

test('reading now keeps books marked as reading, most recently touched first', () => {
  const books = readingNow({
    books: [
      { label: 'The Knowledge Gene', reading: { page: 188, updated_at: '2026-10-01T00:00:00Z' }, pages: 400 },
      { label: 'The Enigma of Reason', reading: { page: null, updated_at: '2026-10-09T00:00:00Z' } },
      { label: 'Make It Stick', pages: 300 }
    ]
  });
  assert.deepEqual(books.map(book => book.label), ['The Enigma of Reason', 'The Knowledge Gene']);
  assert.equal(books[1].page, 188);
});

test('hub jump lines come from the same data, and stay null when a hub has not loaded', () => {
  const lines = hubJumpLines({
    curriculum: CURRICULUM,
    tasks: [{ id: 't', status: 'open', due_date: '2026-10-01' }],
    books: [{ label: 'The Knowledge Gene', page: 100, pages: 400 }],
    meetingsThisWeek: 2,
    today: TODAY,
    nowMinutes: 18 * 60
  });
  assert.equal(lines.teaching, 'Next: Mon 12/10 8:50 am · 12ENGADV1');
  assert.equal(lines.knowledge, 'Reading The Knowledge Gene · p. 100');
  assert.equal(lines.tasks, '1 open · 1 overdue');
  assert.equal(lines.professional, '2 meetings this week');
  assert.equal(lines.readingProgress, 0.25);

  const empty = hubJumpLines({ today: TODAY });
  assert.equal(empty.teaching, null);
  assert.equal(empty.tasks, null);
  assert.equal(empty.professional, null);
});

test('meetings this week count professional meetings Monday to Sunday, not cancelled ones', () => {
  const meeting = (id, date, status = 'scheduled') => ({ path: `professional:${id}`, record: { type: 'professional_meeting', id, date, status } });
  const events = [meeting('a', '2026-10-06'), meeting('b', '2026-10-11'), meeting('c', '2026-10-12'), meeting('d', '2026-10-08', 'cancelled')];
  assert.equal(countMeetingsThisWeek(events, TODAY), 2);
});

test('lesson blocks lead with the class code when the curriculum knows it', () => {
  const event = { path: 'teaching:s1', record: { type: 'scheduled_lesson', id: 's1', class_id: 'c1', date: TODAY, time: '08:50', duration_min: 60, title: 'Hamlet, Act 3', class_title: 'Year 12 English Advanced' } };
  const model = buildDayTimeline({ events: [event], date: TODAY, classCodes: classCodesFrom(CURRICULUM) });
  assert.equal(model.blocks[0].title, '12ENGADV1');
  assert.equal(model.blocks[0].meta, 'Hamlet, Act 3');
});
