import test from 'node:test';
import assert from 'node:assert/strict';
import { askForGroups } from '../../netlify/functions/_shared/tutorial-groups-model.mjs';

test('sends the brief and returns the text; refuses a brief with an id in it', async () => {
  let sent;
  const fetchImpl = async (_url, init) => {
    sent = JSON.parse(init.body);
    return { ok: true, json: async () => ({ content: [{ type: 'text', text: '{"groups":[]}' }], usage: { input_tokens: 900, output_tokens: 300 } }) };
  };
  const out = await askForGroups({ brief: 'S1: named it as repetition', apiKey: 'k', fetchImpl });
  assert.equal(out.text, '{"groups":[]}');
  assert.equal(sent.messages[0].content, 'S1: named it as repetition');
  assert.match(sent.model, /^claude-/);
  await assert.rejects(askForGroups({ brief: 'st_ann named it', apiKey: 'k', fetchImpl }), { code: 'names_in_brief' });
  await assert.rejects(askForGroups({ brief: 'S1 and (st_cy_2) too', apiKey: 'k', fetchImpl }), { code: 'names_in_brief' });
  await askForGroups({ brief: 'the last_word of the list_item', apiKey: 'k', fetchImpl });
});

test('no key: a clear error', async () => {
  await assert.rejects(askForGroups({ brief: 'S1', apiKey: '' }), { code: 'no_key' });
});
