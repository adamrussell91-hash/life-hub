import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GOVERNANCE_LOG_PATH,
  GOVERNANCE_ENTRY_TYPES,
  emptyGovernanceLog,
  formatGovernanceEntry,
  appendGovernanceEntry,
  recentGovernanceTail,
  parseGovernanceEntries,
  openGovernanceEntries,
  oldestOpenGovernanceEntry
} from '../../js/core/governance-log.js';

test('path is data/governance/governance-log.md', () => {
  assert.equal(GOVERNANCE_LOG_PATH, 'data/governance/governance-log.md');
});

test('formatGovernanceEntry builds dated heading', () => {
  const md = formatGovernanceEntry({
    dateKey: '2026-08-09',
    entryType: 'Drift Detection',
    body: 'Stalled sleep goal.',
    status: 'Still Active'
  });
  assert.match(md, /^## 2026-08-09 — Drift Detection$/m);
  assert.match(md, /\*\*Status:\*\* Still Active/);
  assert.match(md, /Stalled sleep goal/);
});

test('appendGovernanceEntry prepends after title', () => {
  const base = emptyGovernanceLog();
  const next = appendGovernanceEntry(base, {
    dateKey: '2026-08-09',
    entryType: "Coach's Notes",
    body: 'First note.'
  });
  const again = appendGovernanceEntry(next, {
    dateKey: '2026-08-10',
    entryType: 'Weekly Review',
    body: 'Second.'
  });
  const firstIdx = again.indexOf('2026-08-10');
  const secondIdx = again.indexOf('2026-08-09');
  assert.ok(firstIdx < secondIdx);
});

test('recentGovernanceTail respects entry and char caps', () => {
  let log = emptyGovernanceLog();
  for (let i = 1; i <= 15; i += 1) {
    log = appendGovernanceEntry(log, {
      dateKey: `2026-08-${String(i).padStart(2, '0')}`,
      entryType: "Coach's Notes",
      body: `Note ${i}`
    });
  }
  const tail = recentGovernanceTail(log, { maxEntries: 10, maxChars: 12000 });
  assert.equal((tail.match(/^## /gm) || []).length, 10);
});

test('parseGovernanceEntries extracts date, type, status, title, and body', () => {
  const log = appendGovernanceEntry(emptyGovernanceLog(), {
    dateKey: '2026-08-09',
    entryType: 'Drift Detection',
    title: 'Life worth enjoying',
    status: 'Still Active',
    body: 'Stalled sleep goal.'
  });
  const entries = parseGovernanceEntries(log);
  assert.equal(entries.length, 1);
  assert.deepEqual(entries[0], {
    dateKey: '2026-08-09',
    entryType: 'Drift Detection',
    title: 'Life worth enjoying',
    status: 'Still Active',
    body: 'Stalled sleep goal.'
  });
});

test('parseGovernanceEntries returns [] for empty log', () => {
  assert.deepEqual(parseGovernanceEntries(emptyGovernanceLog()), []);
  assert.deepEqual(parseGovernanceEntries(''), []);
});

test('parseGovernanceEntries tolerates entries without title or status', () => {
  const log = appendGovernanceEntry(emptyGovernanceLog(), {
    dateKey: '2026-08-01',
    entryType: "Coach's Notes",
    body: 'Hold surplus.'
  });
  const [entry] = parseGovernanceEntries(log);
  assert.equal(entry.title, null);
  assert.equal(entry.status, null);
  assert.equal(entry.body, 'Hold surplus.');
});

test('openGovernanceEntries annotates ageDays and skips Resolved entries', () => {
  let log = emptyGovernanceLog();
  log = appendGovernanceEntry(log, {
    dateKey: '2026-05-24',
    entryType: 'Drift Detection',
    title: 'MEd Sem 2',
    status: 'Still Active',
    body: 'Unactioned.'
  });
  log = appendGovernanceEntry(log, {
    dateKey: '2026-08-01',
    entryType: 'Closed Loop Review',
    status: 'Resolved',
    body: 'Done.'
  });
  const open = openGovernanceEntries(log, '2026-08-11');
  assert.equal(open.length, 1);
  assert.equal(open[0].ageDays, 79);
  assert.equal(open[0].title, 'MEd Sem 2');
});

test('openGovernanceEntries includes malformed dateKey entries without ageDays', () => {
  const log = `# Governance Log\n\n## not-a-date — Drift Detection\n**Status:** Still Active\n\nBroken heading.\n`;
  const open = openGovernanceEntries(log, '2026-08-11');
  assert.equal(open.length, 1);
  assert.equal(open[0].ageDays, undefined);
  assert.equal(open[0].entryType, 'Drift Detection');
});

test('oldestOpenGovernanceEntry picks the oldest unresolved entry', () => {
  let log = emptyGovernanceLog();
  log = appendGovernanceEntry(log, {
    dateKey: '2026-08-01',
    entryType: 'Escalation',
    title: 'Study load',
    status: 'Still Active',
    body: 'Recent.'
  });
  log = appendGovernanceEntry(log, {
    dateKey: '2026-05-24',
    entryType: 'Drift Detection',
    title: 'MEd Sem 2',
    status: 'Still Active',
    body: 'Older.'
  });
  log = appendGovernanceEntry(log, {
    dateKey: '2026-01-01',
    entryType: 'Closed Loop Review',
    status: 'Resolved',
    body: 'Ignore me.'
  });
  const oldest = oldestOpenGovernanceEntry(log, '2026-08-11');
  assert.equal(oldest.dateKey, '2026-05-24');
  assert.equal(oldest.ageDays, 79);
});
