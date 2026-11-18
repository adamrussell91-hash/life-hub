import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CHUNK_LINES,
  CONTEXT_LINES,
  applySpeakerCheck,
  parseSpeakerCheck,
  parseWriteup,
  safeOverview,
  sentenceChunks,
  speakerCheckPrompt,
  writeupPrompt
} from '../../netlify/functions/_shared/meeting-writeup.mjs';
import { completeJson, CLARE_COMMS_MODEL } from '../../netlify/functions/_shared/clare-comms-model.mjs';

// Invented people only.
const P1 = 'shared:person:person_00000000-0000-4000-8000-0000000000c1';
const P2 = 'shared:person:person_00000000-0000-4000-8000-0000000000c2';
const CTX = { title: 'Reading program check-in', kind: 'meeting', when: '2026-11-19', attendees: [{ who: P1, name: 'Wren Calloway', role: 'chair' }, { who: P2, name: 'Otis Brannigan', role: null }], room: false, taps: [] };

function transcriptOf(n) {
  return {
    duration_ms: n * 3000,
    voices: [{ key: 'S1', who: 'me' }, { key: 'S2', who: P1 }],
    lines: Array.from({ length: n }, (_, i) => ({ start_ms: i * 3000, end_ms: i * 3000 + 2500, speaker: i % 2 ? 'S2' : 'S1', text: `Invented line ${i}.`, who_override: null, moved: false, unsure: false })),
    speakers_checked: true
  };
}

test('sentenceChunks: about 120 lines each with 12 lines of context', () => {
  const chunks = sentenceChunks(transcriptOf(250));
  assert.equal(chunks.length, 3);
  assert.equal(chunks[0].lines.length, CHUNK_LINES);
  assert.equal(chunks[0].context.length, 0);
  assert.equal(chunks[1].context.length, CONTEXT_LINES);
  assert.equal(chunks[1].context[0].id, CHUNK_LINES - CONTEXT_LINES);
  assert.equal(chunks[2].lines.length, 10);
  assert.equal(chunks[0].lines[1].who, P1);
});

test('parseSpeakerCheck keeps only valid changes inside the chunk', () => {
  const t = transcriptOf(250);
  t.lines[125].who_override = P2; // Adam's own fix
  const chunk = sentenceChunks(t)[1];
  const reply = {
    changes: [
      { line: 121, who: P2 },              // ok
      { line: 5, who: P2 },                // context / other chunk
      { line: 125, who: 'me' },            // fixed by Adam
      { line: 122, who: 'shared:person:person_stranger' }, // not an attendee
      { line: 123, who: 'me' },            // already me (odd lines are S2 → P1; 123 is S2) → valid
      { line: 124, who: 'me' },            // already me → dropped
      { id: '126', who: 'Otis' },          // name and string id → ok
      { line: 121, who: 'me' }             // duplicate
    ],
    unsure: [130, 130, 9999, 'x']
  };
  const out = parseSpeakerCheck(reply, chunk, CTX);
  assert.deepEqual(out.changes, [{ line: 121, who: P2 }, { line: 123, who: 'me' }, { line: 126, who: P2 }]);
  assert.deepEqual(out.unsure, [130]);
  applySpeakerCheck(t, out);
  assert.equal(t.lines[121].who_override, P2);
  assert.equal(t.lines[121].moved, true);
  assert.equal(t.lines[130].unsure, true);
  // Without ctx, shape only.
  assert.deepEqual(parseSpeakerCheck({ changes: [{ line: 121, who: 'Otis' }, { line: 127, who: P2 }] }, chunk).changes, [{ line: 127, who: P2 }]);
});

test('prompts carry the model, effort and token budget', () => {
  const t = transcriptOf(5);
  const sc = speakerCheckPrompt(CTX, sentenceChunks(t)[0]);
  assert.equal(sc.model, 'claude-opus-5-5');
  assert.equal(sc.effort, 'low');
  const wu = writeupPrompt(CTX, t, ['Ask about the log'], [{ kind: 'task', at_ms: 4000 }]);
  assert.equal(wu.maxTokens, 16000);
  assert.match(wu.content[0].text, /\[1\] 0:03 Wren Calloway: Invented line 1\./);
  assert.match(wu.content[0].text, /"near_line":1/);
});

test('parseWriteup: bad who to null, bad line index dropped, caps applied', () => {
  const t = transcriptOf(10);
  const many = (n, make) => Array.from({ length: n }, (_, i) => make(i));
  const reply = {
    overview: 'You and <b>Wren</b> agreed <script>x</script> a plan & a date. <i>ok</i>',
    flow: many(20, (i) => ({ line: i % 10, mins: 2, title: `Topic ${i}`, text: 'x', who: [P1, 'shared:person:person_stranger', P1] })),
    built: [
      { note_index: 0, text: 'Kept', who: P1, line: 3 },
      { note_index: 7, text: 'Bad note index', who: 'nobody', line: 99 },
      ...many(40, () => ({ note_index: null, text: 'More', who: null, line: 1 }))
    ],
    picks: {
      mine: [{ text: 'Send the log', due: '2026-02-30', due_label: 'End of Week 2', quote: 'I will send it', line: 2 }, ...many(20, () => ({ text: 'More', line: 0 }))],
      others: [{ who: 'me', text: 'Me is not an other', line: 1 }, { who: 'Otis', text: 'Bring copies', due: '2026-11-21', line: -1 }],
      poi: [{ who: 'room', text: 'No room chip here', line: 4 }]
    },
    persons: [
      { who: P1, points: many(8, (i) => ({ text: `Point ${i}`, star: true })), quote: 'Q', line: 5 },
      { who: 'shared:person:person_stranger', points: [{ text: 'x' }] },
      { who: 'me', points: [{ text: 'Asked first' }] },
      { who: P2, points: [{ text: 'Brought copies' }] },
      { who: P1, points: [{ text: 'merged' }] }
    ]
  };
  const w = parseWriteup(reply, CTX, t, ['Ask about the log'], { nowIso: () => '2026-11-19T00:00:00.000Z' });
  assert.equal(w.status, 'done');
  assert.equal(w.overview, 'You and <b>Wren</b> agreed x a plan &amp; a date. ok');
  assert.equal(w.flow.length, 12);
  assert.deepEqual(w.flow[0].who, [P1]);
  assert.equal(w.built.length, 30);
  assert.deepEqual(w.built[1], { note_index: null, text: 'Bad note index', who: null, line: null, start_ms: null });
  assert.equal(w.built[0].start_ms, 9000);
  assert.equal(w.picks.mine.length, 15);
  assert.equal(w.picks.mine[0].due, null);
  assert.equal(w.picks.mine[0].due_label, 'End of Week 2');
  assert.equal(w.picks.others[0].who, null);
  assert.equal(w.picks.others[1].who, P2);
  assert.equal(w.picks.others[1].line, null);
  assert.equal(w.picks.poi[0].who, null);
  assert.deepEqual(w.persons.map((p) => p.who), [P1, 'me', P2]);
  assert.equal(w.persons[0].points.length, 5);
  assert.equal(w.persons[0].points.filter((p) => p.star).length, 1);
  assert.ok(w.persons.length <= CTX.attendees.length + 2);
});

test('parseWriteup marks an unchecked transcript and survives an empty reply', () => {
  const t = { ...transcriptOf(2), speakers_checked: false };
  const w = parseWriteup({}, CTX, t, []);
  assert.equal(w.status, 'unchecked');
  assert.deepEqual(w.picks, { mine: [], others: [], poi: [] });
  assert.equal(safeOverview('a </b> b <b>c'), 'a  b <b>c</b>');
});

test('completeJson: model and effort optional, default unchanged', async () => {
  const bodies = [];
  const fetchImpl = async (_url, init) => {
    bodies.push(JSON.parse(init.body));
    return { ok: true, json: async () => ({ content: [{ type: 'text', text: '{"a":1}' }] }) };
  };
  await completeJson({ system: 'S', content: [], apiKey: 'k', fetchImpl });
  await completeJson({ system: 'S', content: [], apiKey: 'k', fetchImpl, model: 'claude-opus-5-5', effort: 'low', maxTokens: 16000 });
  assert.deepEqual(Object.keys(bodies[0]), ['model', 'max_tokens', 'system', 'messages']);
  assert.equal(bodies[0].model, CLARE_COMMS_MODEL);
  assert.equal(bodies[1].model, 'claude-opus-5-5');
  assert.deepEqual(bodies[1].output_config, { effort: 'low' });
  assert.equal(bodies[1].thinking, undefined);
});

test('parsers take raw model text too (a local model replies with a string)', () => {
  const t = transcriptOf(4);
  const chunk = sentenceChunks(t)[0];
  const fenced = '```json\n{"changes":[{"line":1,"who":"me"}],"unsure":[]}\n```';
  assert.deepEqual(parseSpeakerCheck(fenced, chunk).changes, [{ line: 1, who: 'me' }]);
  assert.deepEqual(parseSpeakerCheck('not json', chunk), { changes: [], unsure: [] });
  const w = parseWriteup('Here it is: {"overview":"You met."}', CTX, t, []);
  assert.equal(w.overview, 'You met.');
  assert.equal(speakerCheckPrompt(CTX, chunk).user, speakerCheckPrompt(CTX, chunk).content[0].text);
});
