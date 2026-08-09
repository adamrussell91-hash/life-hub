import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GOVERNANCE_LOG_PATH,
  GOVERNANCE_ENTRY_TYPES,
  emptyGovernanceLog,
  formatGovernanceEntry,
  appendGovernanceEntry,
  recentGovernanceTail
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
