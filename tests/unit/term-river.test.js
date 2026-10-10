import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LANES,
  byLane,
  deriveRiverZooms,
  laneFor,
  mergeRiverItems,
  riverItemsFromHubEvents,
  riverWeekLabel,
  weeklyLoad,
  weeksBetween
} from '../../apps/life/js/app/term-river.js';

const TERMS = [
  { term: 3, starts_on: '2026-07-21', ends_on: '2026-09-25' },
  { term: 4, starts_on: '2026-10-13', ends_on: '2026-12-17' }
];

test('lanes are Adam’s identities in About Me order, with Body last', () => {
  assert.deepEqual(LANES.map(l => l.id), ['teacher', 'corey', 'scholar', 'friends', 'body']);
});

test('every kind of item lands in the right lane', () => {
  const cases = [
    [{ type: 'scheduled_lesson', title: 'Y12 English Adv' }, 'teacher'],
    [{ type: 'professional_event', title: 'Courageously Navigating Hard Conversations' }, 'teacher'],
    [{ type: 'project', title: 'Tournament of Minds' }, 'teacher'],
    [{ type: 'calendar_block', kind: 'corey', title: 'Good night: dinner out + a show' }, 'corey'],
    [{ kind: 'protect_block', with: 'corey', title: 'Blue Mountains' }, 'corey'],
    [{ type: 'medical', title: 'Gastroenterologist follow-up' }, 'body'],
    [{ type: 'calendar_block', kind: 'rest', title: 'Wind down' }, 'body'],
    [{ kind: 'event', tags: ['graduation'], title: 'UNSW conferral' }, 'scholar'],
    [{ kind: 'dream', title: 'Study at Harvard, Cambridge, Oxford or Yale' }, 'scholar'],
    [{ title: 'UOW literacy elective' }, 'scholar'],
    [{ title: 'Lunch with Bob' }, 'friends'],
    [{ title: 'Newcastle, 2 days · friends' }, 'friends'],
    [{ title: 'Anything', lane: 'friends' }, 'friends'],
    [{ title: 'Unknown thing' }, 'teacher']
  ];
  for (const [item, lane] of cases) assert.equal(laneFor(item), lane, item.title);
  const grouped = byLane(cases.map(([i]) => i));
  assert.equal(Object.values(grouped).flat().length, cases.length, 'nothing lost, nothing duplicated');
  assert.deepEqual(Object.keys(grouped), LANES.map(l => l.id));
});

test('week labels speak school: T3 W10, Hol W1, Hol W2, T4 W1', () => {
  assert.deepEqual(['2026-09-21', '2026-09-28', '2026-10-05', '2026-10-12', '2026-10-26'].map(w => riverWeekLabel(w, TERMS)),
    ['T3 W10', 'Hol W1', 'Hol W2', 'T4 W1', 'T4 W3']);
  assert.equal(riverWeekLabel('2026-09-21', []), '21/09');
});

test('weeks run Monday to Sunday', () => {
  assert.deepEqual(weeksBetween('2026-09-24', '2026-10-06'), ['2026-09-21', '2026-09-28', '2026-10-05']);
});

test('the load strip uses the capacity model’s rule: classes, Corey time and ghosts never count', () => {
  const pct = d => (d >= '2026-11-16' && d <= '2026-11-22' ? 40 : d < '2026-09-26' ? 60 : 80);
  const reports = Array.from({ length: 5 }, (_, i) => ({ date: `2026-11-${16 + i}`, start: 15.5, end: 20, title: 'Reports' }));
  const load = weeklyLoad({
    from: '2026-09-21', to: '2026-11-22', terms: TERMS,
    commitments: [
      { date: '2026-09-21', start: 10.85, end: 14.85, title: 'Resource day' },
      { date: '2026-09-24', start: 13.25, end: 14.25, title: 'Gastro' },
      { date: '2026-09-22', start: 8.67, end: 9.58, title: 'Y12', isClass: true },
      { date: '2026-09-24', start: 19.5, end: 21.5, title: 'Corey', protected: true },
      { date: '2026-09-26', start: 18, end: 22, title: 'Good night', ghost: true },
      ...reports
    ],
    capacityFor: pct
  });
  const w10 = load.find(w => w.week === '2026-09-21');
  assert.equal(w10.booked, 5, 'resource day 4 h + gastro 1 h');
  assert.equal(w10.capacity, 27.5, '5 days at 60% (18 h) + 2 days at 80% (9.6 h), rounded to the half hour');
  assert.equal(w10.over, false);
  const hol1 = load.find(w => w.week === '2026-09-28');
  assert.equal(hol1.holiday, true);
  assert.equal(hol1.booked, 0);
  const reportWeek = load.find(w => w.week === '2026-11-16');
  assert.equal(reportWeek.booked, 22.5);
  assert.equal(reportWeek.over, true, 'report-writing at 40% runs over');
});

test('deriveRiverZooms: term containing today; year pads first→last term', () => {
  const today = '2026-09-24';
  const zooms = deriveRiverZooms(TERMS, today);
  assert.deepEqual(zooms.term, { from: '2026-07-21', to: '2026-09-25', holidayFactor: 0.65 });
  assert.deepEqual(zooms.year, { from: '2026-07-20', to: '2027-01-10', holidayFactor: 0.5 });
});

test('deriveRiverZooms: after a term ends, picks the next term', () => {
  const zooms = deriveRiverZooms(TERMS, '2026-10-01');
  assert.equal(zooms.term.from, '2026-10-13');
  assert.equal(zooms.term.to, '2026-12-17');
});

test('hub overlays become river points even when visual.RIVER.ITEMS is empty (Year blank bug)', () => {
  const hub = riverItemsFromHubEvents([
    { path: 't:1', record: { type: 'scheduled_lesson', id: 'lesson-1', date: '2026-02-03', time: '09:00', title: 'Y12 English', isClass: true } },
    { path: 'p:1', record: { type: 'professional_communication', id: 'comm-1', date: '2026-02-04', time: '08:40', title: 'Email Nadia' } },
    { path: 'p:2', record: { type: 'professional_meeting', id: 'meet-1', date: '2026-02-05', time: '10:00', title: 'Seth planning' } },
    { path: 'p:3', record: { type: 'professional_event', id: 'pd-1', date: '2026-02-06', time: '15:00', title: 'Warlight PL', event_type: 'professional_development' } },
    { path: 'task:1', record: { type: 'task', id: 'task-1', date: '2026-02-07', title: 'Mark drafts' } },
    { path: 'life:1', record: { type: 'calendar_block', id: 'corey-1', date: '2026-02-07', kind: 'corey', title: 'Tea + TV', time: '19:30', end_time: '21:30' } },
    { path: 'log:1', record: { type: 'meal', id: 'meal-1', date: '2026-02-07', title: 'Lunch' } }
  ]);
  assert.equal(hub.some((item) => item.id === 'lesson-1' && item.filterKey === 'classes'), true);
  assert.equal(hub.some((item) => item.id === 'comm-1' && item.filterKey === 'comms'), true);
  assert.equal(hub.some((item) => item.id === 'meet-1' && item.filterKey === 'meetings'), true);
  assert.equal(hub.some((item) => item.id === 'pd-1' && item.filterKey === 'pd'), true);
  assert.equal(hub.some((item) => item.id === 'task-1' && item.filterKey === 'tasks'), true);
  assert.equal(hub.some((item) => item.id === 'corey-1' && laneFor(item) === 'corey'), true);
  assert.equal(hub.some((item) => item.id === 'meal-1'), false, 'meals stay off the river');

  const merged = mergeRiverItems(
    [{ id: 'comm-1', title: 'visual wins', date: '2026-02-04', shape: 'point' }],
    hub
  );
  assert.equal(merged.find((item) => item.id === 'comm-1')?.title, hub.find(item => item.id === 'comm-1').title);
  assert.ok(merged.length >= 6, 'visual + remaining hub overlays');
  assert.equal(mergeRiverItems([], hub).length, hub.length, 'empty visual still paints hub overlays');
});

test('river overlays retain record identity and relationships; tasks are diamonds and multi-day events are bars', () => {
  const record = { id: 'block-1', type: 'work_block', task_id: 'task-1', project_id: 'project-1', date: '2026-10-14', title: 'Draft', source: 'manual' };
  const [block, task, trip] = riverItemsFromHubEvents([
    { path: 'tasks/work-block/block-1', source: 'tasks', record },
    { path: 'tasks/task/task-1', record: { id: 'task-1', type: 'task', due_date: '2026-10-15' } },
    { path: 'life/trip', record: { id: 'trip', type: 'calendar_block', date: '2026-10-15', end_date: '2026-10-18', kind: 'travel', tags: ['family'] } }
  ]);
  assert.equal(block.record, record);
  assert.equal(block.path, 'tasks/work-block/block-1');
  assert.equal(block.source, 'tasks');
  assert.equal(block.task_id, 'task-1');
  assert.equal(block.project_id, 'project-1');
  assert.equal(task.shape, 'diamond');
  assert.equal(trip.shape, 'bar');
  assert.equal(trip.from, '2026-10-15');
  assert.equal(trip.to, '2026-10-18');
  assert.equal(laneFor(trip), 'friends');
});

test('live content and geometry win while visual lane annotations enrich the item card', () => {
  const record = { id: 'p', type: 'project', start_date: '2026-10-14', due_date: '2026-11-10' };
  const hub = riverItemsFromHubEvents([{ path: 'tasks/project/p', record }]);
  const visual = { id: 'p', title: 'Visual title', shape: 'bar', from: '2026-10-13', to: '2026-11-11', lane: 'scholar' };
  const [merged] = mergeRiverItems([visual], hub);
  assert.equal(merged.record, record);
  assert.equal(merged.path, 'tasks/project/p');
  assert.equal(merged.type, 'project');
  assert.equal(merged.title, hub[0].title);
  assert.equal(merged.from, record.start_date);
  assert.equal(merged.lane, 'scholar');
});

test('live relationship ids win over stale visual relationships and check-ins stay off river', () => {
  const record = { id: 'block', type: 'work_block', date: '2026-10-14', task_id: 'live-task', project_id: 'live-project' };
  const hub = riverItemsFromHubEvents([{ record }, { record: { id: 'checkin', type: 'readiness_checkin', date: '2026-10-14' } }]);
  const [merged] = mergeRiverItems([{ id: 'block', task_id: 'stale-task', project_id: 'stale-project' }], hub);
  assert.equal(merged.task_id, 'live-task');
  assert.equal(merged.project_id, 'live-project');
  assert.equal(hub.some(item => item.id === 'checkin'), false);
});

test('preserved source labels still map work blocks and projects to Tasks filters and routes', async () => {
  const { filterKeyForItem } = await import('../../packages/design-kit/js/calendar/calendar-filter.js');
  const { hubDomainForItem } = await import('../../packages/design-kit/js/calendar/open-in-hub.js');
  const items = riverItemsFromHubEvents([
    { source: 'tasks', record: { id: 'block', type: 'work_block', date: '2026-10-14', task_id: 'task' } },
    { id: 'manual', source: 'manual', type: 'work_block', date: '2026-10-14' },
    { source: 'tasks', record: { id: 'project', type: 'project', from: '2026-10-14', to: '2026-10-20' } }
  ]);
  for (const item of items) {
    assert.equal(filterKeyForItem(item), 'tasks');
    assert.equal(hubDomainForItem(item), 'tasks');
  }
});

test('a renamed and rescheduled live task replaces stale visual content and geometry', () => {
  const live = riverItemsFromHubEvents([{path:'tasks:t',record:{id:'t',type:'task',title:'Updated',due_date:'2026-10-20'}}]);
  const [item] = mergeRiverItems([{id:'t',title:'Old',from:'2026-10-01',to:'2026-10-14',shape:'bar',lane:'scholar'}], live);
  assert.equal(item.title, 'Updated');
  assert.equal(item.date, '2026-10-20');
  assert.equal(item.shape, 'diamond');
  assert.equal(item.from, undefined);
  assert.equal(item.to, undefined);
  assert.equal(item.lane, 'scholar');
});
