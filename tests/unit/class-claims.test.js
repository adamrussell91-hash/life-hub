import { randomBytes } from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { CLAIMS_PER_IP_PER_CLASS_PER_DAY, claimFor, claimInitials, classClaimsAction, clientIpOf, listClaims, loadRoster, releaseClaim, withClaimRequest } from '../../netlify/functions/_shared/class-claims.mjs';

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

test('one network address can make only so many new claims in a class per day', async () => {
  const s = store();
  const roster = await loadRoster(s, 'class1');
  const ip = '198.51.100.23';
  // Squat with a fresh device token, get released, squat again: the address runs out for the day.
  for (let i = 0; i < CLAIMS_PER_IP_PER_CLASS_PER_DAY; i += 1) {
    const held = await withClaimRequest({ ip }, () => claimInitials(s, roster, randomBytes(24).toString('hex'), 'BB'));
    await releaseClaim(s, 'class1', held.id);
  }
  await assert.rejects(
    withClaimRequest({ ip }, () => claimInitials(s, roster, token(3), 'TT')),
    /Too many initials have been claimed from here today/
  );
  // Another address (another class, or a later day) is unaffected, and so is a device that already holds a claim.
  assert.equal((await withClaimRequest({ ip: '198.51.100.99' }, () => claimInitials(s, roster, token(4), 'TT'))).initials, 'TT');
  assert.equal((await withClaimRequest({ ip }, () => claimInitials(s, roster, token(4), 'TT'))).initials, 'TT');
  // The counter keys hash the address and never show up as claims.
  const keys = [...s.data.keys()].filter(k => k.includes('/ip-day/'));
  assert.ok(keys.length === 2 && keys.every(k => !k.includes(ip)));
  assert.deepEqual(Object.keys(await listClaims(s, 'class1')).length, 1);
});

test('the client address comes from the Netlify context, then the edge header', () => {
  const request = new Request('https://api.example/x', { headers: { 'x-nf-client-connection-ip': '198.51.100.7' } });
  assert.equal(clientIpOf(request, { ip: '198.51.100.8' }), '198.51.100.8');
  assert.equal(clientIpOf(request, {}), '198.51.100.7');
  assert.equal(clientIpOf(new Request('https://api.example/x'), {}), '');
});
