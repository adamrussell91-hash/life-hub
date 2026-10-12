import { manresaTimetable } from '../fixtures/manresa-timetable.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { itemTypeLabel } from '../../packages/design-kit/js/calendar/calendar-item-actions.js';
const { generateTimetableSessions } = await import('../../apps/teaching/src/schedule/timetable.js').catch(() => ({}));
test('calendar identifies a teaching session as a lesson',()=>assert.equal(itemTypeLabel({record:{type:'scheduled_lesson'}}),'Lesson'));
function generate(timetable, start = '2026-10-12', end = '2026-10-23') {
  assert.equal(typeof generateTimetableSessions, 'function', 'cycle scheduling is available');
  return generateTimetableSessions(timetable, start, end);
}
test('Manresa cycle creates eight sessions across ten school days with exact times and rooms', () => {
  assert.equal(typeof manresaTimetable, 'function', 'Manresa preset is available');
  const rows = generate(manresaTimetable());
  assert.deepEqual(rows.map(r => [r.date,r.cycle_day,r.start_time,r.end_time,r.room]), [
    ['2026-10-12',1,'11:50','12:43','A0214'],['2026-10-13',2,'13:24','15:10','A0214'],
    ['2026-10-15',4,'13:24','14:17','A0214'],['2026-10-16',5,'13:24','14:17','A0214'],
    ['2026-10-19',6,'08:30','09:23','A0214'],['2026-10-21',8,'14:17','15:10','A0215'],
    ['2026-10-22',9,'11:50','12:43','A0216'],['2026-10-23',10,'09:23','10:16','A0214']]);
  assert.equal(generate(manresaTimetable(),'2026-10-26','2026-10-26')[0].cycle_day,1);
});
test('non-school dates pause the cycle and overrides re-anchor it', () => {
  assert.equal(typeof manresaTimetable,'function');
  const tt=manresaTimetable(); tt.non_school_dates=['2026-10-13'];
  const rows=generate(tt);
  assert.equal(rows.find(r=>r.cycle_day===2).date,'2026-10-14');
  tt.cycle_overrides={'2026-10-19':6};
  assert.equal(generate(tt).find(r=>r.date==='2026-10-19').cycle_day,6);
});
test('cycle dates before the anchor and multiple same-day sessions are supported', () => {
  assert.equal(typeof manresaTimetable,'function');
  const tt=manresaTimetable();
  assert.equal(generate(tt,'2026-10-09','2026-10-09')[0].cycle_day,10);
  tt.slots.push({day:1,start_time:'13:24',end_time:'14:17',period:'5',room:'A0214'});
  assert.equal(generate(tt,'2026-10-12','2026-10-12').length,2);
});
test('invalid dates, range, overlap, times and weekend anchors are rejected', () => {
  assert.equal(typeof manresaTimetable,'function');
  for(const patch of [{anchor_date:'2026-02-30'},{anchor_date:'2026-10-11'},{anchor_day:11},
    {slots:[{day:1,start_time:'14:00',end_time:'13:00'}]},
    {slots:[{day:1,start_time:'11:00',end_time:'12:00'},{day:1,start_time:'11:30',end_time:'12:30'}]}]) {
    assert.throws(()=>generate({...manresaTimetable(),...patch}));
  }
  assert.throws(()=>generate(manresaTimetable(),'2026-10-12','2026-10-01'));
  assert.throws(()=>generate(manresaTimetable(),'2026-02-30','2026-03-10'));
  assert.throws(()=>generate(manresaTimetable(),'2026-10-12','2028-10-12'));
});
