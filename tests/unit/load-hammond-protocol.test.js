import test from 'node:test';
import assert from 'node:assert/strict';
import { loadHammondProtocol } from '../../netlify/functions/_shared/load-hammond-protocol.mjs';

test('loads the checked-in Hammond protocol markdown', () => {
  const text = loadHammondProtocol();
  assert.match(text, /Operating Manual|Session Triage|Decision Priority/i);
  assert.match(text, /Central Node rules|read Central Node first/i);
});

test('returns an empty string when the seed file cannot be read', () => {
  const text = loadHammondProtocol({
    readFileSyncImpl: () => {
      throw new Error('ENOENT');
    }
  });
  assert.equal(text, '');
});

test('protocol documents phased Central Node audit', () => {
  const text = loadHammondProtocol();
  assert.match(text, /Central Node audit \(phased\)/i);
  assert.match(text, /intake/i);
  assert.match(text, /triage/i);
});

test('protocol treats Weekly Review as recap plus forward plan, not the audit sequence', () => {
  const text = loadHammondProtocol();
  assert.match(text, /Sunday-night recap \+ forward plan/);
  assert.match(text, /get_week_review/);
  assert.match(text, /not a Central Node audit/);
  assert.match(text, /A \*\*Weekly Review\*\* is the recap \+ forward-plan conversation/);
});

test('protocol points write-back at CN tools and Governance Log', () => {
  const text = loadHammondProtocol();
  assert.match(text, /append_governance_log/);
  assert.match(text, /propose_central_node_patch/);
  assert.match(text, /## Tools/);
  assert.match(text, /entry_type/);
  assert.match(text, /web_search/);
  assert.match(text, /no use cap/);
  assert.doesNotMatch(text, /Life Hub persists CN from confirmed specialist logs/);
  assert.doesNotMatch(text, /No fake database write/);
});

test('protocol makes Hammond the relay for longitudinal patterns specialists cannot see themselves', () => {
  const text = loadHammondProtocol();
  assert.match(text, /Specialist pattern relay/i);
  assert.match(text, /thin, short-range digest/i);
  assert.match(text, /Hammond→\[Specialist\]/);
  assert.match(text, /Hammond→Brisket|relaying to Brisket|worth relaying to Brisket/i);
  assert.match(text, /Pattern confidence/);
});

test('protocol treats Clare and Ann as reachable relay targets', () => {
  const text = loadHammondProtocol();
  assert.doesNotMatch(text, /Never address a relay to Ann O'Tation or Clare DeMind/);
  assert.match(text, /Hammond→Clare/);
  assert.match(text, /Hammond→Ann/);
});
