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
  oldestOpenGovernanceEntry,
  decisionTraces
} from '../../apps/life/js/core/governance-log.js';

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
    chosen: null,
    reasoning: null,
    revisit: null,
    body: 'Stalled sleep goal.'
  });
});

test('formatGovernanceEntry writes Chosen, Reasoning, and Revisit as decision fields', () => {
  const md = formatGovernanceEntry({
    dateKey: '2026-09-05',
    entryType: 'Capability Action',
    title: 'Open a tracker',
    status: 'Resolved',
    chosen: 'Approved',
    reasoning: 'Keep the no-sugar week honest',
    revisit: '2026-09-12',
    body: 'Wrote data/challenges/no-sugar.json'
  });
  const [entry] = parseGovernanceEntries(md);
  assert.equal(entry.chosen, 'Approved');
  assert.equal(entry.reasoning, 'Keep the no-sugar week honest');
  assert.equal(entry.revisit, '2026-09-12');
  assert.equal(entry.body, 'Wrote data/challenges/no-sugar.json');
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

test('format and parse keep chosen, reasoning, and revisit on a decision', () => {
  const log = appendGovernanceEntry(emptyGovernanceLog(), {
    dateKey: '2026-09-01',
    entryType: 'Major Decision',
    title: 'MEd load',
    status: 'Still Active',
    chosen: 'Drop one elective',
    reasoning: 'Two units plus teaching is too much.',
    revisit: '2026-10-01',
    body: 'Hold the extra unit for summer.'
  });
  const [entry] = parseGovernanceEntries(log);
  assert.equal(entry.chosen, 'Drop one elective');
  assert.equal(entry.reasoning, 'Two units plus teaching is too much.');
  assert.equal(entry.revisit, '2026-10-01');
  assert.equal(entry.body, 'Hold the extra unit for summer.');
});

test('decisionTraces groups same-title entries oldest-first', () => {
  let log = emptyGovernanceLog();
  log = appendGovernanceEntry(log, {
    dateKey: '2026-09-06',
    entryType: 'Major Decision',
    title: 'MEd load',
    chosen: 'Drop one elective',
    reasoning: 'Teaching clash',
    body: 'Later take.'
  });
  log = appendGovernanceEntry(log, {
    dateKey: '2026-08-01',
    entryType: 'Major Decision',
    title: 'MEd load',
    chosen: 'Take both units',
    reasoning: 'Stay on timeline',
    body: 'First take.'
  });
  log = appendGovernanceEntry(log, {
    dateKey: '2026-09-02',
    entryType: "Coach's Notes",
    title: 'Unrelated',
    body: 'One-off.'
  });
  const traces = decisionTraces(parseGovernanceEntries(log));
  assert.equal(traces.length, 1);
  assert.equal(traces[0].title, 'MEd load');
  assert.deepEqual(traces[0].steps.map(step => step.chosen), [
    'Take both units',
    'Drop one elective'
  ]);
  assert.deepEqual(traces[0].steps.map(step => step.dateKey), [
    '2026-08-01',
    '2026-09-06'
  ]);
});

test('Mind Insight is a valid governance entry type', () => {
  const next = appendGovernanceEntry('', {
    dateKey: '2026-08-13',
    entryType: 'Mind Insight',
    title: 'Weekend permission',
    body: 'Exhaustion looking like chaos'
  });
  assert.match(next, /Mind Insight/);
  assert.match(next, /Weekend permission/);
});
