// tests/unit/notion-import-core.test.js
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildImportPlan, ClassSchema, DocumentSchema, EMPTY_CHOICES, LessonSchema, SubjectSchema, UnitSchema
} from '../../netlify/functions/_shared/notion-import-core.mjs';

test('server bundle exposes the mapper and entity schemas', () => {
  for (const schema of [ClassSchema, DocumentSchema, LessonSchema, SubjectSchema, UnitSchema]) {
    assert.equal(typeof schema.safeParse, 'function');
  }
  const now = '2026-10-18T00:00:00.000Z';
  const plan = buildImportPlan({
    root_id: 'u1',
    pages: { u1: {
      id: 'u1', url: '', last_edited_time: now, title: 'Made-up unit', category: 'Unit',
      subjects: [], years: [], outcomes: [], date_start: null, date_end: null, files: [], cover: null,
      blocks: [], child_ids: []
    } }
  }, { now, years: [], subjects: [], outcomes: [], source_map: {}, choices: EMPTY_CHOICES });
  assert.equal(plan.entities[0].kind, 'unit');
});
