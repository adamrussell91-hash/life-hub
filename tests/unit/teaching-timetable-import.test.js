import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTimetableText } from '../../apps/teaching/src/schedule/timetable.js';
test('imports tabular and plain rows including doubles and optional fields',()=>{
 assert.deepEqual(parseTimetableText('Day\tPeriod\tStart\tEnd\tRoom\nDay 3\tP2\t8:30\t9:23\tB10\nDay 6,13:24–15:10 | Room101',10),[
  {day:3,period:'2',start_time:'08:30',end_time:'09:23',room:'B10'},
  {day:6,period:'',start_time:'13:24',end_time:'15:10',room:'Room101'}
 ]);
});
test('rejects incomplete, ambiguous, overlapping or out-of-cycle pasted rows',()=>{
 for(const value of ['', 'Day 11 | 08:30–09:23', 'Day 1 | 08:30–09:23\nUnreadable', 'Day 1 | 1:24–3:10 pm', 'Day 1 | 25:00–26:00', 'Day 1 | 11:50–12:430 | A0214', 'Day 1 | 11:50–12:43:59 | A0214', 'Day 1 | 100:00–01:00', 'Day 1 | 08:30–09:23\nDay 1 | 09:00–10:00']) {
  assert.throws(()=>parseTimetableText(value,10),undefined,value);
 }
});
