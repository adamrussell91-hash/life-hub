import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBodyHistoryCsv } from '../../scripts/lib/body-history-csv-import.mjs';

const SAMPLE = `date,measurement,region,side,value,unit,method,record_label,source_dataset,source_url,quality_note
2015-05-19,Body fat,Whole Body,,21.2,%,scale,May 2015,Notion,,
2015-05-19,Body weight,Whole Body,,88.5,kg,scale,May 2015,Notion,,
2026-01-27,Circumference,Waist,,84.5,cm,tape,27 Jan 2026,Notion,,
2026-01-27,Arm Flexed,Arm Flexed,Right,42.0,cm,tape,27 Jan 2026,Notion,,
2026-01-27,Arm Relaxed,Arm Relaxed,Left,38.0,cm,tape,27 Jan 2026,Notion,,
2026-01-27,Thigh,Thigh,Right,62.0,cm,tape,27 Jan 2026,Notion,,
2026-01-27,Calf,Calf,Left,38.5,cm,tape,27 Jan 2026,Notion,,
2026-01-27,Calf,Calf,Right,39.0,cm,tape,27 Jan 2026,Notion,,
`;

test('parseBodyHistoryCsv groups same-day weight+fat into composition', () => {
  const events = parseBodyHistoryCsv(SAMPLE);
  const composition = events.find(e => e.record.date === '2015-05-19' && e.record.type === 'composition');
  assert.ok(composition);
  assert.equal(composition.record.weight_kg, 88.5);
  assert.equal(composition.record.body_fat_pct, 21.2);
  assert.equal(composition.record.source, 'notion_import');
});

test('parseBodyHistoryCsv maps tape sites including flexed/relaxed arms', () => {
  const events = parseBodyHistoryCsv(SAMPLE);
  const tape = events.find(e => e.record.date === '2026-01-27' && e.record.type === 'measurements');
  assert.equal(tape.record.waist, 84.5);
  assert.equal(tape.record.right_arm_flexed, 42);
  assert.equal(tape.record.left_arm_relaxed, 38);
  assert.equal(tape.record.right_thigh, 62);
  assert.equal(tape.record.calves, 38.75);
});
