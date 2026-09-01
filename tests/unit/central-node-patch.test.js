import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyCentralNodePatchRisk,
  applyCentralNodePatch,
  CENTRAL_NODE_SECTIONS
} from '../../apps/life/js/core/central-node-patch.js';

const FIXTURE = `# Purpose
Purpose body.

## 📏 Writing Rules (All Agents Must Follow)
Rule one.

## 🤖 Agent Directory
- Hammond

## 🔴 Current Constraints & Priorities
- Steroid taper active

## ⚡ Today's Status — Monday, 1 January 2026
**Flags:** Quiet day.
**Energy:** Ok.

## 📅 This Week
- Lift Mon

## 📊 This Month
### Active Goals
- Sleep by 11

## 📈 Long-Term Trends & Patterns
- Sleep debt rising

## 🤝 Cross-Agent Coordination
- Chadwick→Brisket: training day

## 📝 Recent Agent Actions
- 1 Jan — Brisket: meal logged
`;

test('classify: status upsert_field is auto', () => {
  assert.equal(
    classifyCentralNodePatchRisk({
      section: 'todays_status',
      op: 'upsert_field',
      payload: { field: 'Flags', text: '**Flags:** Flare watch.' }
    }),
    'auto'
  );
});

test('classify: constraints append_line is auto', () => {
  assert.equal(
    classifyCentralNodePatchRisk({
      section: 'constraints',
      op: 'append_line',
      payload: { text: '- New additive flag' }
    }),
    'auto'
  );
});

test('classify: constraints delete_lines is confirm', () => {
  assert.equal(
    classifyCentralNodePatchRisk({
      section: 'constraints',
      op: 'delete_lines',
      payload: { match: 'Steroid taper' }
    }),
    'confirm'
  );
});

test('classify: this_month replace_section is confirm', () => {
  assert.equal(
    classifyCentralNodePatchRisk({
      section: 'this_month',
      op: 'replace_section',
      payload: { text: '### Active Goals\n- New goal' }
    }),
    'confirm'
  );
});

test('classify: purpose any op is confirm', () => {
  assert.equal(
    classifyCentralNodePatchRisk({
      section: 'purpose',
      op: 'replace_section',
      payload: { text: 'Nope' }
    }),
    'confirm'
  );
});

test('classify: recent_actions upsert_field is confirm', () => {
  assert.equal(
    classifyCentralNodePatchRisk({
      section: 'recent_actions',
      op: 'upsert_field',
      payload: { field: 'x', text: 'y' }
    }),
    'confirm'
  );
});

test('classify: recent_actions append_line is auto', () => {
  assert.equal(
    classifyCentralNodePatchRisk({
      section: 'recent_actions',
      op: 'append_line',
      payload: { text: '- Hammond: note' }
    }),
    'auto'
  );
});

test('apply upsert_field updates Flags', () => {
  const next = applyCentralNodePatch(FIXTURE, {
    section: 'todays_status',
    op: 'upsert_field',
    payload: { field: 'Flags', text: '**Flags:** Flare watch.' }
  });
  assert.match(next, /\*\*Flags:\*\* Flare watch\./);
  assert.match(next, /\*\*Energy:\*\* Ok\./);
});

test('apply append_line to cross_agent', () => {
  const next = applyCentralNodePatch(FIXTURE, {
    section: 'cross_agent',
    op: 'append_line',
    payload: { text: '- Hammond→Brisket: hold surplus' }
  });
  assert.match(next, /Hammond→Brisket: hold surplus/);
});

test('apply append_line to cross_agent dedupes a repeat of the same thread', () => {
  const withFirst = applyCentralNodePatch(FIXTURE, {
    section: 'cross_agent',
    op: 'append_line',
    payload: { text: "- Vera→Hammond: body-level question left open at close today, first time raised." }
  });
  const withSecond = applyCentralNodePatch(withFirst, {
    section: 'cross_agent',
    op: 'append_line',
    payload: { text: "- Vera→Hammond: body-level question left open at close today, restated a second time." }
  });
  assert.doesNotMatch(withSecond, /first time raised/);
  assert.match(withSecond, /restated a second time/);
});

test('apply append_line to constraints', () => {
  const next = applyCentralNodePatch(FIXTURE, {
    section: 'constraints',
    op: 'append_line',
    payload: { text: '- Watch sodium this week' }
  });
  assert.match(next, /Watch sodium this week/);
});

test('apply delete_lines removes matched constraint', () => {
  const next = applyCentralNodePatch(FIXTURE, {
    section: 'constraints',
    op: 'delete_lines',
    payload: { match: 'Steroid taper' }
  });
  assert.equal(next.includes('Steroid taper active'), false);
});

test('apply rejects unknown section', () => {
  assert.equal(
    applyCentralNodePatch(FIXTURE, {
      section: 'nope',
      op: 'append_line',
      payload: { text: 'x' }
    }),
    null
  );
});

test('CENTRAL_NODE_SECTIONS lists all patchable keys', () => {
  assert.deepEqual([...CENTRAL_NODE_SECTIONS].sort(), [
    'agent_directory',
    'constraints',
    'cross_agent',
    'long_term_trends',
    'purpose',
    'recent_actions',
    'this_month',
    'this_week',
    'todays_status',
    'writing_rules'
  ].sort());
});

test('apply replace_section rewrites this_month body', () => {
  const next = applyCentralNodePatch(FIXTURE, {
    section: 'this_month',
    op: 'replace_section',
    payload: { text: '### Active Goals\n- New goal' }
  });
  assert.match(next, /### Active Goals\n- New goal/);
  assert.equal(next.includes('Sleep by 11'), false);
  assert.match(next, /## 📈 Long-Term Trends/);
});

test('apply condense replaces long_term_trends body', () => {
  const next = applyCentralNodePatch(FIXTURE, {
    section: 'long_term_trends',
    op: 'condense',
    payload: { text: '- Condensed trend' }
  });
  assert.match(next, /- Condensed trend/);
  assert.equal(next.includes('Sleep debt rising'), false);
});

const FIXTURE_WITH_HR = `# Purpose
Purpose body.
---
## 🤝 Cross-Agent Coordination
- Chadwick→Brisket: training day
---
## 📝 Recent Agent Actions
- 1 Jan — Brisket: meal logged
`;

test('apply append_line to cross_agent prepends newest-first, still before section-closing ---', () => {
  const next = applyCentralNodePatch(FIXTURE_WITH_HR, {
    section: 'cross_agent',
    op: 'append_line',
    payload: { text: '- Hammond→Brisket: hold surplus' }
  });
  assert.match(
    next,
    /## 🤝 Cross-Agent Coordination\n- Hammond→Brisket: hold surplus\n- Chadwick→Brisket: training day\n---\n## 📝 Recent Agent Actions/
  );
});

test('apply append_line to this_week still lands before section-closing --- (bottom-append)', () => {
  const fixture = `# Purpose
Purpose body.
---
## 📅 This Week
- Lift Mon
---
## 📊 This Month
- Sleep by 11
`;
  const next = applyCentralNodePatch(fixture, {
    section: 'this_week',
    op: 'append_line',
    payload: { text: '- Ran 5k Wed' }
  });
  assert.match(
    next,
    /## 📅 This Week\n- Lift Mon\n- Ran 5k Wed\n---\n## 📊 This Month/
  );
});

test('apply replace_section preserves section-closing ---', () => {
  const next = applyCentralNodePatch(FIXTURE_WITH_HR, {
    section: 'cross_agent',
    op: 'replace_section',
    payload: { text: '- Only this' }
  });
  assert.match(
    next,
    /## 🤝 Cross-Agent Coordination\n- Only this\n---\n## 📝 Recent Agent Actions/
  );
});
