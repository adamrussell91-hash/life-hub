import { randomBytes } from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { CLAIMS_PER_IP_PER_CLASS_PER_DAY, CODE_TRIES_PER_DAY, MAX_DEVICES_PER_STUDENT, claimFor, claimInitials, classClaimsAction, clientIpOf, codeFor, listClaims, loadRoster, makeCode, normaliseCode, releaseClaim, withClaimRequest } from '../../netlify/functions/_shared/class-claims.mjs';

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

  await assert.rejects(claimInitials(s, roster, token(2), 'BB'), (e) => e.code === 'need_code' && /BB is already in on another computer\. Type your code/.test(e.message));
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
  assert.match(listed.codes[bob.id], /^[a-z]+-\d{2}$/);
  assert.equal(Object.keys(listed.codes).length, 2, 'every student on the list has a code, claimed or not');
  const after = await classClaimsAction(s, 'class1', { action: 'release', student_id: bob.id });
  assert.deepEqual(after.claims, {});
  assert.equal(after.codes[bob.id], listed.codes[bob.id], 'releasing keeps the code');
  const renewed = await classClaimsAction(s, 'class1', { action: 'new_code', student_id: bob.id });
  assert.match(renewed.codes[bob.id], /^[a-z]+-\d{2}$/);
  await assert.rejects(classClaimsAction(s, 'class1', { action: 'new_code', student_id: 'st_nobody00' }), /Unknown student/);
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

test('codes are a word and two digits, and typing is forgiving', () => {
  assert.match(makeCode(), /^[a-z]+-\d{2}$/);
  assert.equal(makeCode(() => 0), 'apple-10');
  assert.equal(normaliseCode(' Apple 42 '), 'apple-42');
  assert.equal(normaliseCode('APPLE-42'), 'apple-42');
  assert.equal(normaliseCode('apple42'), 'apple-42');
  assert.equal(normaliseCode('apple-4'), '');
  assert.equal(normaliseCode(null), '');
});

test('a new computer gets in with the student’s code, and the old one keeps working', async () => {
  const s = store();
  const roster = await loadRoster(s, 'class1');
  const bob = await claimInitials(s, roster, token(1), 'BB');
  const code = await codeFor(s, 'class1', bob.id);
  assert.equal(await codeFor(s, 'class1', bob.id), code, 'the code stays the same');

  await assert.rejects(claimInitials(s, roster, token(2), 'BB', 'wrong-00'), (e) => e.code === 'wrong_code');
  assert.equal(await claimFor(s, roster, token(2)), null);

  const onLaptop = await claimInitials(s, roster, token(2), 'BB', code.toUpperCase().replace('-', ' '));
  assert.equal(onLaptop.id, bob.id);
  assert.equal((await claimFor(s, roster, token(2))).id, bob.id);
  assert.equal((await claimFor(s, roster, token(1))).id, bob.id, 'the first computer still works');
  assert.equal((await claimInitials(s, roster, token(2), 'BB')).id, bob.id, 'an added computer needs no code again');

  // Releasing signs Bob out everywhere; his code is unchanged.
  await releaseClaim(s, 'class1', bob.id);
  assert.equal(await claimFor(s, roster, token(1)), null);
  assert.equal(await claimFor(s, roster, token(2)), null);
  assert.equal(await codeFor(s, 'class1', bob.id), code);
});

test('a student holds only so many computers; the oldest drops off', async () => {
  const s = store();
  const roster = await loadRoster(s, 'class1');
  const bob = await claimInitials(s, roster, token(1), 'BB');
  const code = await codeFor(s, 'class1', bob.id);
  for (let n = 2; n <= MAX_DEVICES_PER_STUDENT + 1; n += 1) await claimInitials(s, roster, token(n), 'BB', code);
  assert.equal(await claimFor(s, roster, token(1)), null, 'the first computer dropped off');
  assert.equal((await claimFor(s, roster, token(MAX_DEVICES_PER_STUDENT + 1))).id, bob.id);
  assert.equal([...s.data.keys()].filter((k) => k.includes('/devices/')).length, MAX_DEVICES_PER_STUDENT);
});

test('wrong codes run out for the day, then even the right one waits for the teacher', async () => {
  const s = store();
  const roster = await loadRoster(s, 'class1');
  const bob = await claimInitials(s, roster, token(1), 'BB');
  const code = await codeFor(s, 'class1', bob.id);
  for (let i = 0; i < CODE_TRIES_PER_DAY; i += 1) {
    await assert.rejects(claimInitials(s, roster, token(2), 'BB', 'nope-00'), (e) => e.code === 'wrong_code');
  }
  await assert.rejects(claimInitials(s, roster, token(2), 'BB', code), (e) => e.code === 'too_many_codes');
  // Tom's tries are his own.
  const tom = roster.students.find((x) => x.initials === 'TT');
  await claimInitials(s, roster, token(3), 'TT');
  assert.equal((await claimInitials(s, roster, token(4), 'TT', await codeFor(s, 'class1', tom.id))).id, tom.id);
});

test('a claim record from before codes (one device, no list) still works', async () => {
  const s = store();
  const roster = await loadRoster(s, 'class1');
  const bob = roster.students[0];
  const { createHash } = await import('node:crypto');
  const device = createHash('sha256').update(token(1)).digest('hex').slice(0, 24);
  s.data.set(`class-claims/class1/students/${bob.id}`, { device, claimed_at: '2026-10-01T00:00:00Z' });
  s.data.set(`class-claims/class1/devices/${device}`, { student_id: bob.id, claimed_at: '2026-10-01T00:00:00Z' });
  assert.equal((await claimFor(s, roster, token(1))).id, bob.id);
  await claimInitials(s, roster, token(2), 'BB', await codeFor(s, 'class1', bob.id));
  assert.equal((await claimFor(s, roster, token(1))).id, bob.id);
  assert.equal((await claimFor(s, roster, token(2))).id, bob.id);
});
