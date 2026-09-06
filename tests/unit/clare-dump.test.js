import assert from 'node:assert/strict';
import test from 'node:test';
import { assembleDumpResult } from '../../netlify/functions/_shared/clare.mjs';
import {
  parseBrainDump,
  parseWordingCorrection,
  resolveDuplicateFollowUp,
  resolveWordingCorrectionFollowUp,
  splitDumpLines
} from '../../netlify/functions/_shared/clare-dump.mjs';

const frameworks = [
  { id: 'fw_timeboxing', name: 'Timeboxing', reasoning_template: 'Put a boundary around the work.' },
  { id: 'fw_eat_the_frog', name: 'Eat the Frog', reasoning_template: 'Eat the Frog, because this has been sitting untouched.' },
  { id: 'fw_eisenhower', name: 'Eisenhower matrix', reasoning_template: 'Eisenhower, because urgency and importance are fighting.' }
];

test('splits lines, bullets, and and-then without breaking Year 9 and 10', () => {
  assert.deepEqual(
    splitDumpLines('Email parents\n- marking year 9 and 10\nand then book the GP'),
    ['Email parents', 'marking year 9 and 10', 'book the GP']
  );
});

test('classifies comms, dates, domains, and notes', () => {
  const items = parseBrainDump(
    'email parents about the excursion\nmarking year 9 essays due tomorrow\nremember: dex at 4\nflorist quote',
    { now: new Date(2026, 7, 25), preferredDomain: 'teaching' }
  );
  assert.equal(items.length, 4);
  const email = items.find(item => /email/i.test(item.title));
  assert.equal(email.kind, 'communication');
  assert.equal(email.domain, 'teaching');
  const marking = items.find(item => /marking/i.test(item.title));
  assert.equal(marking.title, 'Marking year 9 essays');
  assert.equal(marking.due_date, '2026-08-26');
  assert.equal(marking.domain, 'teaching');
  assert.equal(items.find(item => /dex/i.test(item.title)).kind, 'note');
  const florist = items.find(item => /florist/i.test(item.title));
  assert.equal(florist.domain, 'wedding');
  assert.match(florist.question, /due date|living its best life/i);
  const result = assembleDumpResult(items, frameworks, () => null);
  assert.match(result.voice, /1 looks like a note/);
  assert.deepEqual(result.proposals.map(item => item.title), [
    'Email parents about the excursion',
    'Marking year 9 essays',
    'Florist quote'
  ]);
});

test('strips I-need-to padding from dump titles', () => {
  const items = parseBrainDump(
    'tomorrow I need to prep for my lead mentoring meeting with Siran',
    { now: new Date(2026, 7, 25), preferredDomain: 'teaching' }
  );
  assert.equal(items.length, 1);
  assert.equal(items[0].title, 'Prep for lead mentoring meeting with Siran');
  assert.equal(items[0].due_date, '2026-08-26');
});

test('splits a comma-spliced dump into separate tasks', () => {
  const items = parseBrainDump(
    'I have to sort out my appraisal goal, mark the last mod b paper, check my common module year 12 marks, give the craft materials to that tournament of minds team',
    { now: new Date(2026, 7, 27), preferredDomain: 'teaching' }
  );
  assert.deepEqual(items.map(item => item.title), [
    'Sort out appraisal goal',
    'Mark the last mod b paper',
    'Check my common module year 12 marks',
    'Give the craft materials to that tournament of minds team'
  ]);
  assert.equal(assembleDumpResult(items, frameworks, () => null).proposals.length, 4);
});

test('does not propose notes or existing titles', () => {
  const items = parseBrainDump('Finish lesson pack for Year 12\nremember: bring the USB', {
    now: new Date(2026, 7, 25),
    tasks: [{
      id: 't1',
      title: 'Finish lesson pack for Year 12',
      status: 'open',
      domain: 'teaching'
    }]
  });
  const result = assembleDumpResult(items, frameworks, () => null);
  assert.equal(result.proposals.length, 0);
  assert.ok(result.questions.some(question => /already on the board/i.test(question)));
  assert.ok(result.notes.some(note => /usb/i.test(note)));
});

test('treats meta-commentary as non-actionable', () => {
  const items = parseBrainDump('It was a question not something to create', {
    now: new Date(2026, 7, 28),
    preferredDomain: 'teaching'
  });
  assert.equal(items[0].kind, 'meta');
  assert.equal(items[0].actionable, false);
  const result = assembleDumpResult(items, frameworks, () => null);
  assert.equal(result.proposals.length, 0);
  assert.match(result.voice, /listening|got it/i);
});

test('does not propose a wording correction as a new task', () => {
  const items = parseBrainDump('Encouraging is supposed to be incursion for both of those', {
    now: new Date(2026, 8, 6),
    preferredDomain: 'teaching'
  });
  assert.equal(items[0].kind, 'meta');
  assert.equal(items[0].actionable, false);
  assert.equal(assembleDumpResult(items, frameworks, () => null).proposals.length, 0);
});

test('rewrites the prior quoted title when Adam corrects a word', () => {
  const priorTitle =
    'At some point I need to put in the international neuroscience Olympiad encouraging request and the UN voice encouraging request as well';
  const thread = [
    { role: 'user', text: priorTitle },
    {
      role: 'assistant',
      text: `Is “${priorTitle}” due this week or next week?`
    }
  ];
  const correction = 'Encouraging is supposed to be incursion for both of those';
  assert.deepEqual(parseWordingCorrection(correction), {
    wrong: 'Encouraging',
    right: 'incursion'
  });
  const resolved = resolveWordingCorrectionFollowUp(correction, thread);
  assert.ok(resolved);
  assert.ok(resolved.correctedTitles.some(title => /incursion/i.test(title)));
  assert.ok(resolved.correctedTitles.every(title => !/encouraging/i.test(title)));
  const items = parseBrainDump(resolved.correctedTitles.join('\n'), {
    now: new Date(2026, 8, 6),
    preferredDomain: 'teaching'
  });
  const result = assembleDumpResult(items, frameworks, () => null);
  assert.ok(result.proposals.length >= 1);
  assert.ok(result.proposals.every(p => /incursion/i.test(p.title)));
  assert.ok(result.proposals.every(p => !/supposed to be/i.test(p.title)));
});

test('scheduling supposed-to-be lines stay actionable', () => {
  assert.equal(parseWordingCorrection('The meeting is supposed to be tomorrow'), null);
  const items = parseBrainDump('The meeting is supposed to be tomorrow', {
    now: new Date(2026, 8, 6),
    preferredDomain: 'teaching'
  });
  assert.notEqual(items[0].kind, 'meta');
  assert.equal(items[0].actionable, true);
});

test('anchors due today to Australia/Sydney on a UTC host clock', () => {
  const items = parseBrainDump('email parents due today', {
    now: new Date('2026-08-29T22:05:00.000Z'),
    preferredDomain: 'teaching'
  });
  assert.equal(items[0].due_date, '2026-08-30');
});

test('resolves leave / make-a-new-one replies from the prior duplicate question', () => {
  const thread = [
    { role: 'user', text: 'Research fire ants for science club' },
    {
      role: 'assistant',
      text: '- “Research fire ants for science club” is already on the board. Leave it, or make a new one?'
    }
  ];
  assert.deepEqual(resolveDuplicateFollowUp('Make a new one', thread), {
    action: 'make_new',
    title: 'Research fire ants for science club'
  });
  assert.deepEqual(resolveDuplicateFollowUp('Leave it', thread), {
    action: 'leave',
    title: 'Research fire ants for science club'
  });
  assert.equal(resolveDuplicateFollowUp('Research something else entirely', thread), null);
});

test('open-loops toolkit sorts Now later and trash', () => {
  const items = parseBrainDump(
    'email parents due today\nremember: bring the USB\nbuy milk someday',
    { now: new Date(2026, 7, 25), preferredDomain: 'teaching' }
  );
  const result = assembleDumpResult(items, frameworks, () => null, 'open-loops');
  assert.equal(result.toolkit.title, 'Open loops');
  assert.match(result.toolkit.steps[0], /Email parents/);
});


test('open-loops dump includes a Later triage choice when Later items exist', () => {
  const items = parseBrainDump(
    'email parents due today\nremember: bring the USB\nbuy milk someday',
    { now: new Date(2026, 7, 25), preferredDomain: 'teaching' }
  );
  const result = assembleDumpResult(items, frameworks, () => null, 'open-loops');
  assert.ok(result.choice);
  assert.equal(result.choice.type, 'choice');
  assert.equal(result.choice.multi, true);
  assert.ok(result.choice.choices.length >= 1);
  assert.ok(result.choice.choices.every(choice => choice.label));
});
