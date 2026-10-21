// tests/unit/problem-solver-naming.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { NAMING_RULES, NAME_MAX, nameDate, nameVersion, namingChecks, namingProblem, reviseName } from '../../packages/problem-solver/naming.mjs';

const GOOD = 'Kitchen rota case file 20261020 v1 Final';

test('eight rules in the book\'s order: five strict, three for the coach', () => {
  assert.deepEqual(NAMING_RULES.map((r) => r.id), ['meaningful', 'private', 'consistent', 'date', 'length', 'version', 'final', 'characters']);
  assert.deepEqual(NAMING_RULES.filter((r) => r.check === 'strict').map((r) => r.id), ['date', 'length', 'version', 'final', 'characters']);
  assert.deepEqual(NAMING_RULES.filter((r) => r.kind === 'dont').map((r) => r.id), ['private', 'length', 'characters']);
  assert.equal(NAME_MAX, 260);
});

test('a good name passes every strict rule; the coach rules stay open', () => {
  const checks = namingChecks(GOOD);
  assert.deepEqual(checks.filter((c) => c.check === 'strict').map((c) => c.ok), [true, true, true, true, true]);
  assert.deepEqual(checks.filter((c) => c.check === 'coach').map((c) => c.ok), [null, null, null]);
  assert.equal(namingProblem(GOOD), null);
});

test('the first broken strict rule is named', () => {
  assert.match(namingProblem('Kitchen rota v1 Final'), /YYYYMMDD/);
  assert.match(namingProblem('Kitchen rota 20261320 v1 Final'), /YYYYMMDD/, 'month 13 is not a date');
  assert.match(namingProblem('Kitchen rota 20261020 Final'), /version/);
  assert.match(namingProblem('Kitchen rota 20261020 v1'), /Final/);
  assert.equal(namingProblem('Kitchen rota 20261020 v1', { final: false }), null);
  assert.match(namingProblem('Kitchen_rota 20261020 v1 Final'), /letters, digits and spaces/);
  assert.match(namingProblem(`${'a'.repeat(250)} 20261020 v1 Final`), /260/);
});

test('date and version are read from whole words', () => {
  assert.equal(nameDate(GOOD), '20261020');
  assert.equal(nameDate('Rota 2026102 v1'), null);
  assert.equal(nameVersion(GOOD), 1);
  assert.equal(nameVersion('Rota 20261020 v12 Final'), 12);
  assert.equal(nameVersion('Rota v0 Final'), null);
});

test('reviseName swaps the date and version in place, or adds them', () => {
  assert.equal(reviseName(GOOD, { version: 2, date: '20261102' }), 'Kitchen rota case file 20261102 v2 Final');
  assert.equal(reviseName('Kitchen rota Final', { version: 2, date: '20261102' }), 'Kitchen rota Final 20261102 v2');
});
