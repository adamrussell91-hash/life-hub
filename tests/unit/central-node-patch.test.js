import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyCentralNodePatchRisk,
  applyCentralNodePatch,
  centralNodePatchContentError,
  CENTRAL_NODE_SECTIONS,
  readCentralNodeSectionBody,
  isQueuedPatchStale
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

test('apply upsert_field on constraints replaces the matching bullet (5 Oct weight Confirm)', () => {
  const live = readFileSync(new URL('../../central-node.md', import.meta.url), 'utf8');
  const text = '**Weight**: 88.6 kg, 20.4% body fat (5 Oct 2026, smart scale). Body composition goal: 78-82kg at 8-10% body fat.';
  const next = applyCentralNodePatch(live, {
    section: 'constraints',
    op: 'upsert_field',
    payload: { field: 'Weight', text, summary: 'Update Weight' }
  });
  assert.ok(next, 'constraints upsert_field must apply');
  assert.ok(next.includes(`- ${text}`));
  assert.ok(!next.includes('88kg (weighed by Mary-anne Chamoun'));
  // Lookalike bullets stay untouched.
  assert.match(next, /Weight-bearing\/spine-loading/);
  assert.equal(next.split('\n').length, live.split('\n').length);
});

test('apply upsert_field on constraints appends when the field is new', () => {
  const live = readFileSync(new URL('../../central-node.md', import.meta.url), 'utf8');
  const next = applyCentralNodePatch(live, {
    section: 'constraints',
    op: 'upsert_field',
    payload: { field: 'Grip strength', text: '- **Grip strength**: 52kg', summary: 's' }
  });
  assert.ok(next);
  const body = readCentralNodeSectionBody(next, 'constraints');
  assert.ok(body.endsWith('- **Grip strength**: 52kg'));
});

test('apply upsert_field accepts the **Field:** bold-colon variant', () => {
  const content = '## 🔴 Current Constraints & Priorities\n- **RMR:** 1946 kcal\n- **Other**: x\n';
  const next = applyCentralNodePatch(content, {
    section: 'constraints',
    op: 'upsert_field',
    payload: { field: 'RMR', text: '**RMR:** 1990 kcal', summary: 's' }
  });
  assert.equal(next, '## 🔴 Current Constraints & Priorities\n- **RMR:** 1990 kcal\n- **Other**: x\n');
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

test('content error: this_week append_line with two day-by-day rows is rejected', () => {
  assert.equal(
    centralNodePatchContentError({
      section: 'this_week',
      op: 'append_line',
      payload: {
        text: 'Mon 7 Sep: 1,578 kcal, 139.5g P. Tue 8 Sep: 1,240 kcal, 70g P.'
      }
    }),
    'this_week_day_by_day_dump'
  );
});

test('content error: this_week append_line with two ISO-dated rows is rejected', () => {
  assert.equal(
    centralNodePatchContentError({
      section: 'this_week',
      op: 'replace_section',
      payload: { text: '2026-09-07: ran 5k. 2026-09-09: lifted.' }
    }),
    'this_week_day_by_day_dump'
  );
});

test('content error: this_week append_line with a single date reference is allowed', () => {
  assert.equal(
    centralNodePatchContentError({
      section: 'this_week',
      op: 'append_line',
      payload: { text: '- Protein averaged 95g/day, short of the 120g target.' }
    }),
    null
  );
});

test('content error: this_month is not subject to the This Week rule', () => {
  assert.equal(
    centralNodePatchContentError({
      section: 'this_month',
      op: 'replace_section',
      payload: {
        text: 'Mon 7 Sep: session one. Tue 8 Sep: session two.'
      }
    }),
    null
  );
});

test('CENTRAL_NODE_SECTIONS lists all patchable keys', () => {
  assert.deepEqual([...CENTRAL_NODE_SECTIONS].sort(), [
    'about_me',
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

test('classify: about_me writes are confirm', () => {
  assert.equal(
    classifyCentralNodePatchRisk({
      section: 'about_me',
      op: 'replace_section',
      payload: { text: '- Teach English.' }
    }),
    'confirm'
  );
});

test('apply replace_section inserts About Me when the heading is missing', () => {
  const next = applyCentralNodePatch(FIXTURE, {
    section: 'about_me',
    op: 'replace_section',
    payload: { text: '- Teach English. Finish the MEd.' }
  });
  assert.match(next, /## 👤 About Me\n- Teach English. Finish the MEd./);
  assert.ok(next.indexOf('## 🤖 Agent Directory') < next.indexOf('## 👤 About Me'));
  assert.ok(next.indexOf('## 👤 About Me') < next.indexOf('## 🔴 Current Constraints'));
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

test('readCentralNodeSectionBody returns one section without its heading or trailing rule', () => {
  const body = readCentralNodeSectionBody(FIXTURE, 'constraints');
  assert.ok(typeof body === 'string' && body.length > 0);
  assert.doesNotMatch(body, /^## /m);
  assert.equal(readCentralNodeSectionBody(FIXTURE, 'not_a_section'), null);
});

test('isQueuedPatchStale compares a queued rewrite with the live section, ignoring whitespace', () => {
  const base = readCentralNodeSectionBody(FIXTURE, 'constraints');
  const entry = {
    base_section_text: `  ${base.replace(/\n/g, '\n\n')}  `,
    patch: { section: 'constraints', op: 'replace_section', payload: { summary: 's', text: 't' } }
  };
  assert.equal(isQueuedPatchStale(FIXTURE, entry), false);
  assert.equal(isQueuedPatchStale(FIXTURE, { ...entry, base_section_text: 'something older' }), true);
  // Append-style patches and entries without a base are never stale.
  assert.equal(isQueuedPatchStale(FIXTURE, { ...entry, patch: { ...entry.patch, op: 'append_line' }, base_section_text: 'x' }), false);
  assert.equal(isQueuedPatchStale(FIXTURE, { patch: entry.patch }), false);
});

// Contract: every section x op Hammond's tool schema offers must actually apply to the
// live Central Node. A combo the schema allows but the applier rejects becomes a
// Confirm card that can never save (5 Oct weight reading, constraints upsert_field).
test('every schema-allowed section x op applies to the live Central Node', () => {
  const live = readFileSync(new URL('../../central-node.md', import.meta.url), 'utf8');
  const payloads = {
    upsert_field: { field: 'Probe', text: '**Probe**: x', summary: 's' },
    append_line: { text: '- probe line', summary: 's' },
    replace_section: { text: 'probe body', summary: 's' },
    condense: { text: 'probe body', summary: 's' },
    delete_lines: { match: 'zzz-no-match', summary: 's' }
  };
  const broken = [];
  for (const section of CENTRAL_NODE_SECTIONS) {
    for (const [op, payload] of Object.entries(payloads)) {
      if (applyCentralNodePatch(live, { section, op, payload }) === null) broken.push(`${section}.${op}`);
    }
  }
  assert.deepEqual(broken, []);
});
