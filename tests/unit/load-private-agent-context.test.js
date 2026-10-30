import test from 'node:test';
import assert from 'node:assert/strict';
import {
  loadPrivateAgentContext,
  privateAgentContextPath,
  withPrivateAgentContext
} from '../../netlify/functions/_shared/load-private-agent-context.mjs';

function clientWith(map) {
  return {
    async readBlob(sha) {
      if (!map.has(sha)) throw new Error('missing');
      return { content: Buffer.from(map.get(sha)).toString('base64'), encoding: 'base64' };
    }
  };
}

test('private agent context path is config/agent-context/<slug>.md and rejects odd slugs', () => {
  assert.equal(privateAgentContextPath('brisket'), 'config/agent-context/brisket.md');
  assert.equal(privateAgentContextPath('../x'), null);
  assert.equal(privateAgentContextPath(''), null);
});

test('loads the slug file from the private tree and appends it to the protocol', async () => {
  const tree = [{ type: 'blob', path: 'config/agent-context/sara.md', sha: 's1' }];
  const client = clientWith(new Map([['s1', 'Synthetic standing fact: Medication X is four-weekly.']]));
  const context = await loadPrivateAgentContext('sara', { client, tree });
  assert.match(context, /Medication X/);
  const merged = withPrivateAgentContext('# Protocol', context);
  assert.match(merged, /^# Protocol/);
  assert.match(merged, /Private standing context/);
  assert.match(merged, /Medication X is four-weekly/);
});

test('missing file, missing client or unreadable blob yields the public protocol unchanged', async () => {
  const tree = [{ type: 'blob', path: 'config/agent-context/sara.md', sha: 'gone' }];
  assert.equal(await loadPrivateAgentContext('brisket', { client: clientWith(new Map()), tree }), '');
  assert.equal(await loadPrivateAgentContext('sara', { client: null, tree }), '');
  assert.equal(await loadPrivateAgentContext('sara', { client: clientWith(new Map()), tree }), '');
  assert.equal(withPrivateAgentContext('# Protocol', ''), '# Protocol');
  assert.equal(withPrivateAgentContext('', 'extra'), '');
});
