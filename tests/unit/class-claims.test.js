import test from 'node:test';
import assert from 'node:assert/strict';
import { claimFor, claimInitials, classClaimsAction, listClaims, loadRoster, releaseClaim } from '../../netlify/functions/_shared/class-claims.mjs';

function storeFixture(entries = []) {
  const data = new Map(entries.map(([k, v]) => [k, structuredClone(v)]));
  return {
    data,
    async get(key) { return structuredClone(data.get(key) ?? null); },
    async setJSON(key, value, options) {
      if (options?.onlyIfNew && data.has(key)) return { modified: false };
      data.set(key, structuredClone(value)); return { modified: true };
    },
    async delete(key) { data.delete(key); },
    async list({ prefix }) { return { blobs: [...data.keys()].filter(k => k.startsWith(prefix)).map(key => ({ key })) }; }
  };
}

const cls = (students) => ({ id: 'class1', type: 'class', title: '9 English', students });
const store = () => storeFixture([['classes/class1', cls([{ name: 'Bob Brown' }, { name: 'Tom Tills' }])]]);
const token = n => n.toString(16).repeat(48).slice(0, 48);

test('a roster fills in ids and initials, and a missing or bad class is null', async () => {
  const s = store();
  const roster = await loadRoster(s, 'class1');
  assert.deepEqual(roster.students.map(x => x.initials), ['BB', 'TT']);
  assert.equal(await loadRoster(s, 'nope'), null);
  assert.equal(await loadRoster(s, '../x'), null);
});

test('claiming: on the list, once per device, never someone else’s', async () => {
  const s = store();
  const roster = await loadRoster(s, 'class1');
  const bob = await claimInitials(s, roster, token(1), ' b.b ');
  assert.equal(bob.initials, 'BB');
  assert.equal((await claimFor(s, roster, token(1))).initials, 'BB');
  assert.equal(await claimFor(s, roster, token(2)), null);

  await assert.rejects(claimInitials(s, roster, token(2), 'BB'), /BB is already taken\. See your teacher\./);
  await assert.rejects(claimInitials(s, roster, token(2), 'XQ'), /XQ isn’t in this class\. Check with your teacher\./);
  await assert.rejects(claimInitials(s, roster, 'short', 'TT'), /can’t remember you/);

  const again = await claimInitials(s, roster, token(1), 'TT');
  assert.equal(again.initials, 'BB', 'a device that holds initials keeps them');
});

test('releasing frees the initials for a new device and drops the old one', async () => {
  const s = store();
  const roster = await loadRoster(s, 'class1');
  const bob = await claimInitials(s, roster, token(1), 'BB');
  assert.deepEqual(Object.keys(await listClaims(s, 'class1')), [bob.id]);
  await releaseClaim(s, 'class1', bob.id);
  assert.deepEqual(await listClaims(s, 'class1'), {});
  assert.equal(await claimFor(s, roster, token(1)), null);
  assert.equal((await claimInitials(s, roster, token(2), 'BB')).id, bob.id);
});

test('teacher actions list and release, and refuse a missing class or unknown action', async () => {
  const s = store();
  const roster = await loadRoster(s, 'class1');
  const bob = await claimInitials(s, roster, token(1), 'BB');
  const listed = await classClaimsAction(s, 'class1', { action: 'list' });
  assert.ok(listed.claims[bob.id]);
  const after = await classClaimsAction(s, 'class1', { action: 'release', student_id: bob.id });
  assert.deepEqual(after.claims, {});
  await assert.rejects(classClaimsAction(s, 'nope', { action: 'list' }), /Class not found/);
  await assert.rejects(classClaimsAction(s, 'class1', { action: 'wipe' }), /Unknown action/);
});
