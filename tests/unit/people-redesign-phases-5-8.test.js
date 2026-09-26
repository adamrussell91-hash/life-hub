import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractRememberCandidates,
  REMEMBER_TEXT_MAX,
  validateRememberFactCreateInput,
  sourceLabelForFact
} from '../../netlify/functions/_shared/remember-schema.mjs';
import {
  shouldRunRememberNow,
  sydneyHourParts
} from '../../netlify/functions/_shared/remember-service.mjs';
import { looksLikeAskQuestion, runPeopleAsk } from '../../netlify/functions/_shared/people-ask.mjs';
import {
  assembleTodayStrip,
  suggestMeetSlot,
  formatMinutes
} from '../../netlify/functions/_shared/today-availability.mjs';
import { hammondCoolingFlags } from '../../netlify/functions/_shared/people-coordination.mjs';

test('Remember facts: text ≤ 120; Ann candidates from notes (Phase 5)', () => {
  const validated = validateRememberFactCreateInput({
    person_ref: 'shared:person:person_henry',
    text: 'Coaching the U15 rugby side',
    sources: [{ kind: 'note', excerpt: 'Coaching the U15 rugby side', at: '2026-09-17T00:00:00.000Z' }],
    author: 'ann'
  });
  assert.equal(validated.text.length <= REMEMBER_TEXT_MAX, true);

  const candidates = extractRememberCandidates({
    person_ref: 'shared:person:person_henry',
    texts: [
      {
        text: 'Henry is coaching the U15 rugby side this season.',
        ref: 'professional:observation:o1',
        kind: 'note',
        at: '2026-09-17T00:00:00.000Z'
      },
      { text: 'vague line', kind: 'note', at: '2026-09-17T00:00:00.000Z' }
    ]
  });
  assert.equal(candidates.length, 1);
  assert.match(candidates[0].text, /rugby/i);
  assert.equal(candidates[0].author, 'ann');

  const label = sourceLabelForFact({
    sources: [{ kind: 'note', at: '2026-09-17T00:00:00.000Z', excerpt: 'x' }],
    author: 'ann'
  });
  assert.equal(label, 'note · 17/09/26');
});

test('Remember schedule: Sydney 07:00 and 16:00 only (Phase 5)', () => {
  // 2026-09-26T21:00:00Z = 07:00 Sydney (AEST UTC+10)
  const morning = new Date('2026-09-26T21:00:00.000Z');
  assert.equal(sydneyHourParts(morning).hour, 7);
  const gate = shouldRunRememberNow(morning, { last_slots: {} });
  assert.equal(gate.run, true);
  assert.equal(gate.slot, 'morning');

  const already = shouldRunRememberNow(morning, {
    last_slots: { [`${gate.dayKey}:morning`]: '2026-09-26T21:05:00.000Z' }
  });
  assert.equal(already.run, false);

  // 12:00 Sydney
  const noon = new Date('2026-09-27T02:00:00.000Z');
  assert.equal(shouldRunRememberNow(noon, {}).run, false);
});

test('Ask: question detection + honest unknown (Phase 6)', async () => {
  assert.equal(looksLikeAskQuestion('who knows Standard 5?'), true);
  assert.equal(looksLikeAskQuestion('Henry'), false);

  const result = await runPeopleAsk('who could help with Standard 5?', {
    peopleWithRelationships: [],
    rememberRepo: { listForPerson: async () => [] },
    professionalStore: {},
    universalStore: {},
    plan: { unsupported: true }
  });
  assert.equal(result.mode, 'ask');
  assert.match(result.answer, /don't know enough/i);
  assert.equal(result.people.length, 0);
});

test('Today strip: free gaps + You usually meet wording (Phase 7, D1/D2)', () => {
  const strip = assembleTodayStrip({
    now: new Date('2026-09-28T00:00:00.000Z'),
    dayKey: '2026-09-28',
    meetings: [
      {
        id: 'm1',
        title: 'Staff briefing',
        scheduled_start: '2026-09-28T08:10:00.000Z',
        scheduled_end: '2026-09-28T08:40:00.000Z',
        attendees: [{ display_name: 'Fr Ross' }]
      }
    ],
    events: [],
    lessons: [{ id: 'l1', date: '2026-09-28', start_time: '11:20', end_time: '12:00', title: 'Year 9 History' }],
    workBlocks: [],
    meetPerson: { ref: 'shared:person:person_henry', display_name: 'Henry McLennan' },
    pastMeetingsWithPerson: [
      { scheduled_start: '2026-09-01T13:05:00.000Z' },
      { scheduled_start: '2026-09-08T13:10:00.000Z' }
    ],
    openMeetItem: { text: 'meet' }
  });

  assert.ok(strip.slots.every((s, i, arr) => i === 0 || s.start_minutes >= arr[i - 1].start_minutes));
  assert.ok(strip.slots.some((s) => s.kind === 'free'));
  assert.ok(strip.suggestion);
  assert.match(strip.suggestion.note, /You usually meet Henry after lunch/);
  assert.ok(!/Henry is free/i.test(strip.suggestion.note));

  const noPattern = suggestMeetSlot({
    freeSlots: [{ id: 'free:480', start_minutes: 480, end_minutes: 600 }],
    pastMeetings: [],
    person: { ref: 'shared:person:person_henry', display_name: 'Henry' },
    openMeetItem: { text: 'meet' }
  });
  assert.equal(noPattern.note, 'No pattern yet');
  assert.equal(formatMinutes(13 * 60 + 5), '1:05pm');
});

test('Hammond cooling flags: Inner or active project only (Phase 8)', () => {
  const now = '2026-09-26T00:00:00.000Z';
  const people = [
    {
      person: {
        ref: 'shared:person:person_henry',
        display_name: 'Henry McLennan',
        created_at: '2026-01-01T00:00:00.000Z',
        is_self: false
      },
      relationships: [
        {
          link: {
            relationship_type: 'professional_relationship',
            role: 'mentee',
            status: 'current',
            valid_to: null,
            valid_from: '2026-06-01T00:00:00.000Z'
          }
        }
      ]
    },
    {
      person: {
        ref: 'shared:person:person_wider',
        display_name: 'Wide Acquaintance',
        created_at: '2024-01-01T00:00:00.000Z',
        is_self: false
      },
      relationships: [
        {
          link: {
            relationship_type: 'contact',
            role: null,
            status: 'current',
            valid_to: null,
            valid_from: '2024-06-01T00:00:00.000Z'
          }
        }
      ]
    }
  ];

  const flags = hammondCoolingFlags(people, {
    now,
    activeProjectPersonRefs: []
  });
  const refs = flags.map((f) => f.person_ref);
  assert.deepEqual(refs, ['shared:person:person_henry']);
  assert.equal(flags[0].tier, 'inner');
  assert.match(flags[0].cross_agent_line, /Hammond→Clare/);
});
