import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBloodsCsv } from '../../scripts/lib/bloods-csv-import.mjs';

const SAMPLE = `Marker,Category,Test Date,Value,Unit,Status,Ref Low,Ref High,Notes
Haemoglobin,Full Blood Count,2026-05-19,151,g/L,Normal,130,180,4Cyte Pathology
ALT,Liver Function,2026-05-19,42,U/L,High,,40,Marginally elevated
HepB sAg,Liver Function,2026-05-19,,Qualitative,,,
CRP,Inflammation Markers,19 May 2026,2.2,mg/L,Normal,0,5,
Adj. Calcium,Biochemistry/Electrolytes,2026-02-01,2.41,mmol/L,Normal,2.1,2.6,
Adjusted Calcium,Biochemistry/Electrolytes,2026-05-19,2.45,mmol/L,Normal,2.1,2.6,
`;

test('parseBloodsCsv groups rows by test date into one bloods record', () => {
  const events = parseBloodsCsv(SAMPLE);
  const may = events.find(e => e.record.date === '2026-05-19');
  assert.ok(may);
  assert.equal(may.slug, 'bloods');
  assert.equal(may.record.type, 'bloods');
  assert.equal(may.record.id, 'notion-bloods-2026-05-19');
  assert.equal(may.record.time, '12:00');
  assert.equal(may.record.source, 'notion_import');
  assert.equal(may.record.schema_version, 1);
  const hb = may.record.markers.find(m => m.key === 'haemoglobin');
  assert.equal(hb.label, 'Haemoglobin');
  assert.equal(hb.category, 'Full Blood Count');
  assert.equal(hb.value, 151);
  assert.equal(hb.unit, 'g/L');
  assert.equal(hb.ref_low, 130);
  assert.equal(hb.ref_high, 180);
  assert.equal(hb.status, 'Normal');
});

test('parseBloodsCsv keeps per-visit reference ranges and qualitative rows', () => {
  const events = parseBloodsCsv(SAMPLE);
  const may = events.find(e => e.record.date === '2026-05-19');
  const alt = may.record.markers.find(m => m.key === 'alt');
  assert.equal(alt.ref_low, null);
  assert.equal(alt.ref_high, 40);
  assert.equal(alt.status, 'High');
  const hep = may.record.markers.find(m => m.key === 'hepb_sag');
  assert.equal(hep.value, null);
  assert.equal(hep.unit, 'Qualitative');
});

test('parseBloodsCsv canonicalizes aliases across dates onto the same key', () => {
  const events = parseBloodsCsv(SAMPLE);
  const feb = events.find(e => e.record.date === '2026-02-01');
  const may = events.find(e => e.record.date === '2026-05-19');
  assert.equal(feb.record.markers[0].key, 'adjusted_calcium');
  assert.ok(may.record.markers.some(m => m.key === 'adjusted_calcium'));
});

test('parseBloodsCsv parses Notion-style dates and skips rows without a date or marker', () => {
  const events = parseBloodsCsv(SAMPLE);
  assert.ok(events.some(e => e.record.date === '2026-05-19'));
  const extra = parseBloodsCsv(`${SAMPLE},,2026-05-19,1,g/L,Normal,0,1,\nNoDate,Liver Function,,1,U/L,Normal,0,1,\n`);
  assert.equal(extra.length, events.length);
});
