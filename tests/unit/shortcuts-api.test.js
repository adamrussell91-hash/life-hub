import test from 'node:test';
import assert from 'node:assert/strict';
import { createShortcutsApi } from '../../apps/life/js/app/shortcuts-api.js';

test('list unwraps catalog and promoted arrays', async () => {
  const api = createShortcutsApi(async url => {
    assert.equal(url, '/api/shortcuts');
    return {
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        data: {
          catalog: [{ id: 'remember.set-week-flag' }],
          promoted: [{ proposed_id: 'track.morning-weigh-in' }]
        }
      })
    };
  });
  assert.deepEqual(await api.list(), {
    catalog: [{ id: 'remember.set-week-flag' }],
    promoted: [{ proposed_id: 'track.morning-weigh-in' }]
  });
});

test('run posts proposed_id and optional agent_slug', async () => {
  let body;
  const api = createShortcutsApi(async (url, init) => {
    assert.equal(url, '/api/shortcuts');
    assert.equal(init.method, 'POST');
    body = JSON.parse(init.body);
    return {
      ok: true,
      status: 200,
      json: async () => ({ ok: true, data: { proposal: { intent: 'run it' }, agent_slug: 'brisket' } })
    };
  });
  const result = await api.run('track.morning-weigh-in', 'brisket');
  assert.deepEqual(body, { proposed_id: 'track.morning-weigh-in', agent_slug: 'brisket' });
  assert.equal(result.proposal.intent, 'run it');
});
