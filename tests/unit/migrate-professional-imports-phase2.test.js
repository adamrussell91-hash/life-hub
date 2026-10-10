import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { runMigrateProfessionalImports } from '../../scripts/migrate-professional-imports.mjs';
import {
  isNotionMeetingMethod,
  notionCommunicationId,
  notionMeetingId,
  projectNotionCommunicationListRecord,
  projectNotionMeetingListRecord
} from '../../netlify/functions/_shared/schedule-projection.mjs';
import { isValidCommunicationId } from '../../netlify/functions/_shared/communication-schema.mjs';
import { isValidMeetingId } from '../../netlify/functions/_shared/meeting-schema.mjs';
import { createCommunicationRepository } from '../../netlify/functions/_shared/communication-repository.mjs';
import { createMeetingRepository } from '../../netlify/functions/_shared/meeting-repository.mjs';
import {
  communicationKey,
  meetingKey,
  getJSON as getProfessionalJSON
} from '../../netlify/functions/_shared/professional-blobs.mjs';

const NOW = '2026-10-10T12:00:00.000Z';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');

function memoryStore() {
  const map = new Map();
  return {
    _map: map,
    async get(key, { type } = {}) {
      if (!map.has(key)) return null;
      const raw = map.get(key);
      return type === 'json' ? JSON.parse(raw) : raw;
    },
    async setJSON(key, value) {
      map.set(key, JSON.stringify(value));
    },
    async delete(key) {
      map.delete(key);
    },
    async list({ prefix = '' } = {}) {
      return { blobs: [...map.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) };
    }
  };
}

function commRow(overrides = {}) {
  return {
    notion_id: '11111111111111111111111111111111',
    title: 'Email with parent',
    method: 'Email',
    date_start: '2026-04-01',
    date_end: null,
    notes: 'Follow up',
    body: '',
    meeting_type: null,
    student_name: 'Year 10 Student',
    attendees: [],
    location: null,
    status: null,
    ...overrides
  };
}

function meetingRow(overrides = {}) {
  return {
    notion_id: '22222222222222222222222222222222',
    title: 'In person catch-up',
    method: 'In-person Meeting',
    date_start: '2026-03-01T01:00:00.000Z',
    date_end: '2026-03-01T02:00:00.000Z',
    notes: 'Agenda notes',
    body: '',
    meeting_type: 'Catch-up',
    student_name: null,
    attendees: [{ name: 'Pat' }],
    location: 'Office',
    status: 'Done',
    ...overrides
  };
}

test('notionCommunicationId / notionMeetingId match hub id patterns', () => {
  const notionId = 'a733a4b7a9bf489095c8ac7dc14b8427';
  const commId = notionCommunicationId(notionId);
  const meetId = notionMeetingId(notionId);
  assert.equal(isValidCommunicationId(commId), true);
  assert.equal(isValidMeetingId(meetId), true);
  assert.notEqual(commId, meetId);
  assert.equal(notionCommunicationId(notionId), commId);
});

function asImportRecord(projected, hubId) {
  const { source: _source, ...rest } = projected;
  return { ...rest, id: hubId };
}

test('importCommunicationWithId / importMeetingWithId write once and refuse overwrite', async () => {
  const store = memoryStore();
  const commRepo = createCommunicationRepository({ store, now: () => NOW });
  const meetRepo = createMeetingRepository({ store, now: () => NOW });

  const commRecord = asImportRecord(
    projectNotionCommunicationListRecord(commRow()),
    notionCommunicationId('11111111111111111111111111111111')
  );
  assert.equal((await commRepo.importCommunicationWithId(commRecord)).created, true);
  assert.equal((await commRepo.importCommunicationWithId(commRecord)).created, false);

  const meetRecord = asImportRecord(
    projectNotionMeetingListRecord(meetingRow(), {
      now: () => Date.parse('2026-10-10T00:00:00.000Z')
    }),
    notionMeetingId('22222222222222222222222222222222')
  );
  assert.equal((await meetRepo.importMeetingWithId(meetRecord)).created, true);
  assert.equal((await meetRepo.importMeetingWithId(meetRecord)).created, false);
});

test('import helpers are not exported through communications.mjs / meetings.mjs', () => {
  const commSrc = readFileSync(join(ROOT, 'netlify/functions/communications.mjs'), 'utf8');
  const meetSrc = readFileSync(join(ROOT, 'netlify/functions/meetings.mjs'), 'utf8');
  assert.equal(commSrc.includes('importCommunicationWithId'), false);
  assert.equal(meetSrc.includes('importMeetingWithId'), false);
});

test('--only=communications dry-run / apply / idempotent; student rows copied; no person links', async () => {
  const identityStore = memoryStore();
  const professionalStore = memoryStore();
  const rows = [commRow(), meetingRow(), commRow({
    notion_id: '33333333333333333333333333333333',
    method: 'Phone Call',
    title: 'Call about student',
    student_name: 'Rohan'
  })];

  assert.equal(isNotionMeetingMethod(rows[1].method), true);

  const dry = await runMigrateProfessionalImports({
    apply: false,
    only: 'communications',
    identityStore,
    professionalStore,
    now: () => NOW,
    env: {},
    listGithubCommunications: async () => rows
  });
  assert.equal(dry.kinds.communications.would_copy, 2);
  assert.equal(dry.kinds.meetings.would_copy, 1);
  assert.equal(dry.kinds.people.would_copy, 0);

  const applied = await runMigrateProfessionalImports({
    apply: true,
    only: 'communications',
    identityStore,
    professionalStore,
    now: () => NOW,
    env: {},
    listGithubCommunications: async () => rows
  });
  assert.equal(applied.kinds.communications.copied, 2);
  assert.equal(applied.kinds.meetings.copied, 1);

  const studentCommId = notionCommunicationId('33333333333333333333333333333333');
  const stored = await getProfessionalJSON(professionalStore, communicationKey(studentCommId), {
    consistency: 'strong'
  });
  assert.ok(stored);
  assert.match(stored.summary + stored.subject, /./);
  // No Universal Links written for attendees / student_name.
  assert.equal(
    [...identityStore._map.keys()].filter((k) => k.startsWith('universal-links/')).length,
    0
  );

  const again = await runMigrateProfessionalImports({
    apply: true,
    only: 'communications',
    identityStore,
    professionalStore,
    now: () => NOW,
    env: {},
    listGithubCommunications: async () => rows
  });
  assert.equal(again.kinds.communications.copied, 0);
  assert.equal(again.kinds.meetings.copied, 0);
  assert.equal(again.kinds.communications.already_in_blobs, 2);
  assert.equal(again.kinds.meetings.already_in_blobs, 1);

  const meetId = notionMeetingId('22222222222222222222222222222222');
  const meeting = await getProfessionalJSON(professionalStore, meetingKey(meetId), {
    consistency: 'strong'
  });
  assert.equal(meeting.state, 'completed');
  assert.match(meeting.title, /catch-up/i);
});
