import test from 'node:test';
import assert from 'node:assert/strict';
import { readMinutes, whoToPerson } from '../../netlify/functions/_shared/clare-comms.mjs';

const ctx = {
  title: 'Faculty meeting', kind: 'meeting', when: 'Thu 6 Nov 2026, 3:30 pm',
  people: [
    { ref: 'shared:person:p1', name: 'Priya Nandakumar', role: 'attendee' },
    { ref: 'shared:person:p2', name: 'Tom Lister', role: 'attendee' }
  ],
  previous: [], open_promises: [], notes: 'Trip approved.',
  agenda_headings: ['Assessment', 'Excursions']
};
const PDF = { media_type: 'application/pdf', data: 'JVBERi0xLjQK' };

const reply = {
  sections: [{ heading: 'Assessment', text: 'Exams move to Week 8.' }, { heading: '', text: '' }],
  actions: [
    { who: 'me', text: 'Circulate the draft unit plan', due: '2026-11-14' },
    { who: 'PN', text: 'Confirm the excursion budget', due: 'Friday' },
    { who: 'Tom', text: 'Book the bus', due: null },
    { who: 'JT', text: 'Follow up with the venue', due: null },
    { who: 'me', text: '', due: null }
  ],
  decisions: [{ text: 'Year 10 exams move to Week 8', agenda_heading: 'Assessment' }, { text: '' }],
  differences: [{ text: 'My notes say the trip was approved; the minutes say pending.' }]
};

test('whoToPerson matches full name, first name and initials', () => {
  assert.equal(whoToPerson(ctx, 'Priya Nandakumar')?.ref, 'shared:person:p1');
  assert.equal(whoToPerson(ctx, 'tom')?.ref, 'shared:person:p2');
  assert.equal(whoToPerson(ctx, 'P.N.')?.ref, 'shared:person:p1');
  assert.equal(whoToPerson(ctx, 'JT'), null);
});

test('readMinutes sends the PDF as a document and sorts the reply', async () => {
  let sent;
  const complete = async (input) => { sent = input; return reply; };
  const out = await readMinutes(ctx, { pdf: PDF }, { complete });
  assert.equal(sent.content[0].type, 'document');
  assert.deepEqual(sent.content[0].source, { type: 'base64', media_type: 'application/pdf', data: PDF.data });
  assert.match(sent.content[1].text, /Faculty meeting/);
  assert.deepEqual(out.sections, [{ heading: 'Assessment', text: 'Exams move to Week 8.' }]);
  assert.deepEqual(out.mine, [{ text: 'Circulate the draft unit plan', due: '2026-11-14' }]);
  assert.deepEqual(out.others, [
    { text: 'Confirm the excursion budget', person_ref: 'shared:person:p1', person_name: 'Priya Nandakumar', due: null },
    { text: 'Book the bus', person_ref: 'shared:person:p2', person_name: 'Tom Lister', due: null }
  ]);
  assert.deepEqual(out.unmatched, [{ text: 'Follow up with the venue', who_text: 'JT', due: null }]);
  assert.deepEqual(out.decisions, [{ text: 'Year 10 exams move to Week 8', agenda_heading: 'Assessment' }]);
  assert.equal(out.differences.length, 1);
});

test('readMinutes takes pasted text instead of a PDF', async () => {
  let sent;
  const complete = async (input) => { sent = input; return reply; };
  await readMinutes(ctx, { text: '1. Assessment\nExams move to Week 8.' }, { complete });
  assert.equal(sent.content[0].type, 'text');
  assert.match(sent.content[0].text, /Exams move to Week 8/);
});

test('readMinutes refuses bad input and empty replies', async () => {
  const complete = async () => reply;
  await assert.rejects(() => readMinutes(ctx, {}, { complete }), { code: 'invalid_minutes' });
  await assert.rejects(() => readMinutes(ctx, { pdf: { media_type: 'image/png', data: 'x' } }, { complete }), { code: 'invalid_minutes' });
  await assert.rejects(() => readMinutes(ctx, { pdf: { ...PDF, data: 'x'.repeat(5_400_001) } }, { complete }), { code: 'invalid_minutes' });
  await assert.rejects(() => readMinutes(ctx, { pdf: PDF }, { complete: async () => ({ sections: [] }) }), { code: 'clare_failed' });
});

test('readMinutes caps list lengths', async () => {
  const many = { ...reply, actions: Array.from({ length: 50 }, (_, i) => ({ who: 'me', text: `Item ${i}` })),
    differences: Array.from({ length: 20 }, (_, i) => ({ text: `D ${i}` })) };
  const out = await readMinutes(ctx, { pdf: PDF }, { complete: async () => many });
  assert.equal(out.mine.length, 30);
  assert.equal(out.differences.length, 10);
});
