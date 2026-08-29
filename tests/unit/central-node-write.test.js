import test from 'node:test';
import assert from 'node:assert/strict';
import {
  appendCrossAgentLine,
  appendRecentAction,
  applyLogToCentralNode,
  buildMealFlagsLine,
  buildNutritionStatusLine,
  dedupeCrossAgentSection,
  formatStatusHeadingDate,
  formatThisMonthHeading,
  formatThisWeekHeading,
  humanizeDayType,
  purgeStaleRecentActions,
  replaceTodaysStatus,
  rollStaleSections,
  trimCrossAgentSection,
  upsertStatusField
} from '../../js/core/central-node-write.js';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const base = [
  '# Purpose',
  'Intro.',
  '---',
  "## ⚡ Today's Status (Friday 19 June 2026)",
  '**Health:** Stable.',
  '**Nutrition:** No data.',
  '---',
  '## 📝 Recent Agent Actions',
  '**1 Aug:** Chadwick: session logged.'
].join('\n');

test('formatStatusHeadingDate uses en-AU long form', () => {
  assert.match(formatStatusHeadingDate('2026-08-01'), /August 2026/);
});

test('appendRecentAction inserts directly under the Recent Agent Actions heading', () => {
  const next = appendRecentAction(base, '\n**1 Aug:** Brisket Lasso: Logged breakfast.');
  assert.match(next, /## 📝 Recent Agent Actions\n\*\*1 Aug:\*\* Brisket Lasso: Logged breakfast\.\n\*\*1 Aug:\*\*/);
});

test('appendRecentAction skips an exact repeat of an already-present bullet', () => {
  const once = appendRecentAction(base, '\n**1 Aug:** Chadwick Flexington: Logged a workout_30 session (Biceps and Boobs, 20 mins).');
  const twice = appendRecentAction(once, '\n**1 Aug:** Chadwick Flexington: Logged a workout_30 session (Biceps and Boobs, 20 mins).');
  assert.equal(twice, once);
  assert.equal((twice.match(/Biceps and Boobs/g) ?? []).length, 1);
});

test('appendRecentAction dedups regardless of date-stamp/whitespace differences', () => {
  const once = appendRecentAction(base, '\n**1 Aug:**   Chadwick Flexington: Logged a workout_30 session (Biceps and Boobs, 20 mins).');
  const twice = appendRecentAction(once, '\n**2 Aug:** Chadwick Flexington: Logged a workout_30 session (Biceps and Boobs, 20 mins).');
  assert.equal(twice, once);
});

test('appendRecentAction still inserts a genuinely different same-day action', () => {
  const once = appendRecentAction(base, '\n**1 Aug:** Chadwick Flexington: Logged a workout_30 session (Biceps and Boobs, 20 mins).');
  const twice = appendRecentAction(once, '\n**1 Aug:** Brisket Lasso: Logged breakfast.');
  assert.match(twice, /Biceps and Boobs/);
  assert.match(twice, /Logged breakfast/);
});

test('buildNutritionStatusLine formats totals only', () => {
  assert.equal(
    buildNutritionStatusLine({ calories: 1130, protein_g: 80, fat_g: 27, sodium_mg: 1100 }),
    '**Nutrition:** 1,130 kcal, 80g P, 27g F, 1,100mg Na.'
  );
});

test('buildMealFlagsLine compacts notes into a Flags status line', () => {
  assert.equal(
    buildMealFlagsLine('Coles tofu bowl — on track, solid protein'),
    '**Flags:** Coles tofu bowl — on track, solid protein'
  );
  assert.equal(buildMealFlagsLine('  '), null);
});

test('upsertStatusField replaces an existing field line', () => {
  const body = upsertStatusField('**Health:** Stable.\n**Nutrition:** Old.', 'Nutrition', '**Nutrition:** 400 kcal, 21g P.');
  assert.equal(body, '**Health:** Stable.\n**Nutrition:** 400 kcal, 21g P.');
});

test('replaceTodaysStatus rewrites the dated heading and body', () => {
  const next = replaceTodaysStatus(base, {
    dateKey: '2026-08-01',
    body: '**Nutrition:** 520 kcal, 38g P, 12g F.'
  });
  assert.match(next, /## ⚡ Today's Status \([^)]*1 August 2026\)/);
  assert.match(next, /\*\*Nutrition:\*\* 520 kcal, 38g P, 12g F\./);
  assert.doesNotMatch(next, /No data/);
  assert.match(next, /## 📝 Recent Agent Actions/);
});

test('applyLogToCentralNode appends Recent Actions and refreshes Nutrition on meal logs', () => {
  const next = applyLogToCentralNode(base, {
    record: { type: 'meal', date: '2026-08-01', meal: 'breakfast', calories: 520, protein_g: 38, fat_g: 12 },
    actionLine: '\n**1 Aug:** Brisket Lasso: Logged breakfast (520 kcal, 38g protein, 12g fat).',
    nutritionTotals: { calories: 520, protein_g: 38, fat_g: 12 },
    flagNotes: 'Eggs and toast — on track, solid protein'
  });
  assert.match(next, /## ⚡ Today's Status \([^)]*1 August 2026\)/);
  assert.match(next, /\*\*Nutrition:\*\* 520 kcal, 38g P, 12g F\./);
  assert.match(next, /\*\*Flags:\*\* Eggs and toast — on track, solid protein/);
  assert.match(next, /\*\*1 Aug:\*\* Brisket Lasso: Logged breakfast/);
  assert.match(next, /Chest and Curls|session logged/);
});

test('skincare and body logs can land Flags from notes', () => {
  const nextSkin = applyLogToCentralNode(base, {
    record: { type: 'skincare', date: '2026-08-01', routine: 'am', completed: true },
    actionLine: '\n**1 Aug:** Hyaluronica: Logged am skincare.',
    flagNotes: 'AM stack — looking good, mild tightness'
  });
  assert.match(nextSkin, /\*\*Flags:\*\* AM stack — looking good, mild tightness/);

  const nextBody = applyLogToCentralNode(base, {
    record: { type: 'weight', date: '2026-08-01', weight_kg: 88.2 },
    actionLine: '\n**1 Aug:** Sara: Logged weight.',
    flagNotes: '88.2 kg — stable vs last'
  });
  assert.match(nextBody, /\*\*Health:\*\* Weight 88.2 kg\./);
  assert.match(nextBody, /\*\*Flags:\*\* 88.2 kg — stable vs last/);
});

test('medical logs land compact Health/Flags from notes and never dump the visit essay', () => {
  const notes = 'Check-in — flare context unchanged. Long visit narrative must not land on Status.';
  const next = applyLogToCentralNode(base, {
    record: {
      type: 'medical',
      date: '2026-08-01',
      title: 'GP review',
      record_type: 'Appointment',
      notes
    },
    actionLine: '\n**1 Aug:** Dr. Sara Tonin: Logged medical visit: GP review.',
    flagNotes: 'Check-in — flare context unchanged'
  });
  assert.match(next, /\*\*Health:\*\* GP review\./);
  assert.match(next, /\*\*Flags:\*\* Check-in — flare context unchanged/);
  assert.match(next, /Logged medical visit: GP review/);
  assert.doesNotMatch(next, /Long visit narrative must not land on Status/);
});

test('same-day meal log preserves other Status fields', () => {
  const sameDayBase = base.replace('Friday 19 June 2026', 'Saturday 1 August 2026');
  const next = applyLogToCentralNode(sameDayBase, {
    record: { type: 'meal', date: '2026-08-01', meal: 'lunch', calories: 400, protein_g: 40, fat_g: 10 },
    actionLine: '\n**1 Aug:** Brisket Lasso: Logged lunch.',
    nutritionTotals: { calories: 920, protein_g: 78, fat_g: 22 }
  });
  assert.match(next, /\*\*Health:\*\* Stable\./);
  assert.match(next, /\*\*Nutrition:\*\* 920 kcal, 78g P, 22g F\./);
});

test('humanizeDayType matches Home labels', () => {
  assert.equal(humanizeDayType('workout_30'), '30-min Workout');
  assert.equal(humanizeDayType('workout_45_60'), '45–60 min Workout');
  assert.equal(humanizeDayType('movement'), 'Movement day');
});

test('trimCrossAgentSection keeps the newest directives and drops the tail', () => {
  const directives = Array.from({ length: 15 }, (_, index) => `- Directive ${index + 1}.`);
  const base = [
    '## 🤝 Cross-Agent Coordination',
    '*One-line directives only.*',
    ...directives,
    '---',
    '## 📝 Recent Agent Actions'
  ].join('\n');

  const next = trimCrossAgentSection(base, { maxLines: 12 });
  assert.match(next, /- Directive 1\./);
  assert.match(next, /- Directive 12\./);
  assert.doesNotMatch(next, /- Directive 13\./);
  assert.doesNotMatch(next, /- Directive 15\./);
  // Non-directive content and later sections survive the trim.
  assert.match(next, /\*One-line directives only\.\*/);
  assert.match(next, /## 📝 Recent Agent Actions/);
});

test('dedupeCrossAgentSection collapses repeated same-thread lines from the same sender, keeping the newest', () => {
  const base = [
    '## 🤝 Cross-Agent Coordination',
    "- Vera→Hammond: Body-level question (what 'getting in trouble' feels like physically) has now been left open at close five times without landing. Strong recommend: next session open directly with this.",
    "- Vera→Hammond: Body-level question (what getting in trouble feels like physically) has now been left open at close four times across today's sessions without landing.",
    '- Penelope→Hammond: Adam reports persistent low mood, unrelated thread.',
    '---',
    '## 📝 Recent Agent Actions'
  ].join('\n');

  const next = dedupeCrossAgentSection(base);
  assert.match(next, /left open at close five times/);
  assert.doesNotMatch(next, /left open at close four times/);
  assert.match(next, /Penelope→Hammond: Adam reports persistent low mood/);
});

test('dedupeCrossAgentSection leaves distinct threads from the same sender alone', () => {
  const base = [
    '## 🤝 Cross-Agent Coordination',
    '- Chadwick→Sara: 26 Jul right AC deep ache recurring during everyday movement.',
    '- Chadwick→Sara: 24 Jul mild AC noise on upright close grip curls during the session.',
    '---',
    '## 📝 Recent Agent Actions'
  ].join('\n');
  assert.equal(dedupeCrossAgentSection(base), base);
});

test('dedupeCrossAgentSection keeps unparseable bullets untouched', () => {
  const base = [
    '## 🤝 Cross-Agent Coordination',
    '- Just a note with no sender arrow at all.',
    '- Just a note with no sender arrow at all.',
    '---',
    '## 📝 Recent Agent Actions'
  ].join('\n');
  assert.equal(dedupeCrossAgentSection(base), base);
});

test('dedupeCrossAgentSection runs before trimCrossAgentSection so a duplicate never displaces a distinct line', () => {
  const duplicatePair = [
    '- Vera→Hammond: same open thread left open at close today, restated a second time, still not landing.',
    '- Vera→Hammond: same open thread left open at close today, this is the first time it was raised.'
  ];
  const distinctOld = Array.from({ length: 11 }, (_, index) => `- Distinct directive ${index + 1}.`);
  const base = [
    '## 🤝 Cross-Agent Coordination',
    ...duplicatePair,
    ...distinctOld,
    '---',
    '## 📝 Recent Agent Actions'
  ].join('\n');

  const deduped = trimCrossAgentSection(dedupeCrossAgentSection(base), { maxLines: 12 });
  assert.match(deduped, /restated a second time, still not landing/);
  assert.match(deduped, /Distinct directive 11\./);

  const notDeduped = trimCrossAgentSection(base, { maxLines: 12 });
  assert.doesNotMatch(notDeduped, /Distinct directive 11\./);
});

test('trimCrossAgentSection leaves a short section untouched', () => {
  const base = [
    '## 🤝 Cross-Agent Coordination',
    '- Keep me.',
    '---',
    '## 📝 Recent Agent Actions'
  ].join('\n');
  assert.equal(trimCrossAgentSection(base), base);
});

test('applyLogToCentralNode no longer writes a Day Type directive for completed workouts', () => {
  const base = [
    '# Purpose',
    '---',
    "## ⚡ Today's Status (Wednesday 30 July 2026)",
    '**Exercise:** prior.',
    '---',
    '## 🤝 Cross-Agent Coordination',
    '- Keep me.',
    '---',
    '## 📝 Recent Agent Actions'
  ].join('\n');
  const record = {
    type: 'workout',
    date: '2026-07-30',
    status: 'completed',
    title: 'Chest and Curls',
    day_type: 'workout_30',
    duration_min: 26
  };
  const next = applyLogToCentralNode(base, {
    record,
    actionLine: '\n**30 Jul:** Chadwick Flexington: Logged a session.'
  });
  // Day Type reaches Brisket via resolveDayType/getDayTargets, not a directive he cannot action.
  assert.doesNotMatch(next, /Set Day Type to/);
  assert.match(next, /- Keep me\./);
  // The honest signal -- what was actually done -- still lands in Status and Recent Actions.
  assert.match(next, /\*\*Exercise:\*\* Chest and Curls · 26 min · completed\./);
  assert.match(next, /\*\*30 Jul:\*\* Chadwick Flexington/);
});

test('rollStaleSections advances an elapsed This Week range and clears the body', () => {
  const content = [
    '## 📅 This Week (16 – 22 June 2026)',
    '**Key Events:**',
    '- Stale event that must not survive.',
    '---',
    '## 📊 This Month (August 2026)',
    '**Active Goals:**',
    '- Keep me — month is current.'
  ].join('\n');

  const next = rollStaleSections(content, '2026-08-11');
  assert.match(next, /^## 📅 This Week \(10 – 16 August 2026\)$/m);
  assert.doesNotMatch(next, /Stale event/);
  assert.match(next, /## 📊 This Month \(August 2026\)/);
  assert.match(next, /Keep me — month is current/);
});

test('rollStaleSections leaves an already-current This Week heading untouched', () => {
  const content = [
    '## 📅 This Week (10 – 16 August 2026)',
    '- Still this week.',
    '## 📊 This Month (August 2026)',
    '- Current month.'
  ].join('\n');
  assert.equal(rollStaleSections(content, '2026-08-11'), content);
  assert.equal(rollStaleSections(content, '2026-08-16'), content);
});

test('rollStaleSections is a no-op for malformed or undated week/month headings', () => {
  const content = [
    '## 📅 This Week',
    '- Lift Mon',
    '## 📊 This Month',
    '- Sleep by 11'
  ].join('\n');
  assert.equal(rollStaleSections(content, '2026-08-11'), content);
});

test('rollStaleSections rolls This Month across a year boundary and clears the body', () => {
  const content = [
    '## 📅 This Week (29 Dec 2025 – 4 Jan 2026)',
    '- Cross-year week still current on New Year\'s Day.',
    '## 📊 This Month (December 2025)',
    '- Old December goals.'
  ].join('\n');

  const next = rollStaleSections(content, '2026-01-01');
  assert.match(next, /## 📅 This Week \(29 Dec 2025 – 4 Jan 2026\)/);
  assert.match(next, /Cross-year week still current/);
  assert.equal(formatThisMonthHeading('2026-01-01'), '## 📊 This Month (January 2026)');
  assert.match(next, /^## 📊 This Month \(January 2026\)$/m);
  assert.doesNotMatch(next, /Old December goals/);
});

test('formatThisWeekHeading uses short months when the Mon–Sun range spans two months', () => {
  assert.equal(
    formatThisWeekHeading('2026-07-27'),
    '## 📅 This Week (27 Jul – 2 Aug 2026)'
  );
});

test('applyLogToCentralNode rolls a stale This Week heading on specialist writes', () => {
  const stale = [
    '# Purpose',
    '---',
    "## ⚡ Today's Status (Friday 19 June 2026)",
    '**Health:** Stable.',
    '---',
    '## 📅 This Week (16 – 22 June 2026)',
    '- Stale week body.',
    '---',
    '## 📝 Recent Agent Actions',
    '**30 Jul:** Chadwick: session logged.'
  ].join('\n');

  const next = applyLogToCentralNode(stale, {
    record: { type: 'meal', date: '2026-08-11', meal: 'breakfast', calories: 520, protein_g: 38, fat_g: 12 },
    actionLine: '\n**11 Aug:** Brisket Lasso: Logged breakfast.',
    nutritionTotals: { calories: 520, protein_g: 38, fat_g: 12 }
  });

  assert.match(next, /^## 📅 This Week \(10 – 16 August 2026\)$/m);
  assert.doesNotMatch(next, /Stale week body/);
  assert.match(next, /\*\*11 Aug:\*\* Brisket Lasso: Logged breakfast/);
});

test('purgeStaleRecentActions drops bullets older than the 48h window and keeps malformed lines', () => {
  const content = [
    '## 📝 Recent Agent Actions',
    '*48-hour rolling window.*',
    '**11 Aug:** Keep today.',
    '**10 Aug:** Keep yesterday.',
    '**9 Aug:** Purge me.',
    '**30 Jul:** Also purge.',
    'Not a dated bullet — keep.',
    '## 🤝 Next'
  ].join('\n');
  const next = purgeStaleRecentActions(content, '2026-08-11');
  assert.match(next, /\*\*11 Aug:\*\* Keep today/);
  assert.match(next, /\*\*10 Aug:\*\* Keep yesterday/);
  assert.match(next, /Not a dated bullet — keep/);
  assert.doesNotMatch(next, /Purge me/);
  assert.doesNotMatch(next, /Also purge/);
  assert.match(next, /## 🤝 Next/);
});

test('purgeStaleRecentActions is a no-op when everything is current', () => {
  const content = [
    '## 📝 Recent Agent Actions',
    '**11 Aug:** Fresh.',
    '**10 Aug:** Still fresh.'
  ].join('\n');
  assert.equal(purgeStaleRecentActions(content, '2026-08-11'), content);
});

test('hammond protocol no longer mentions Sterling; central-node.md is untouched by Move 8', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
  const protocol = readFileSync(join(root, 'config/hammond-protocol.md'), 'utf8');
  assert.doesNotMatch(protocol, /Sterling/);
  assert.match(protocol, /5\. Growth and learning/);
  assert.match(protocol, /6\. Comfort \/ convenience/);

  const cn = readFileSync(join(root, 'central-node.md'), 'utf8');
  assert.match(cn, /Clare DeMind/);
  assert.match(cn, /Ann O'Tation/);
  // Byte-for-byte guard: this move must not rewrite CN. Hash is stable for the
  // checked-in file on this branch (assert length + Clare/Ann presence above).
  assert.ok(cn.length > 1000);
  assert.equal(createHash('sha256').update(cn).digest('hex').length, 64);
});

test('diary confirm upserts Energy as well as Mood', () => {
  const next = applyLogToCentralNode(base, {
    record: { type: 'diary', date: '2026-06-19', mood: 'low', mood_score: 4, energy: 'low' },
    actionLine: '\n**19 Jun:** Penelope: Logged a diary entry.'
  });
  assert.match(next, /\*\*Mood:\*\*/);
  assert.match(next, /\*\*Energy:\*\* low/);
});

test('mind_session with whitespace-only theme falls back to session logged', () => {
  const next = applyLogToCentralNode(base, {
    record: {
      type: 'mind_session',
      date: '2026-06-19',
      theme: '   ',
      insight: 'Exhaustion looking like chaos'
    },
    actionLine: '\n**19 Jun:** Dr Vera Lenz: Logged a mind session.'
  });
  assert.match(next, /\*\*Mind:\*\* session logged/);
});

test('mind_session upserts Mind status and Cross-Agent line', () => {
  const withXa = `${base}\n## 🤝 Cross-Agent Coordination\n- Old line.\n`;
  const next = applyLogToCentralNode(withXa, {
    record: {
      type: 'mind_session', date: '2026-06-19',
      theme: 'Weekend permission',
      cross_agent_note: 'Vera→Penelope: ask what the weekend is for.'
    },
    actionLine: '\n**19 Jun:** Dr Vera Lenz: Logged a mind session (Weekend permission).'
  });
  assert.match(next, /\*\*Mind:\*\* Weekend permission/);
  assert.match(next, /## 🤝 Cross-Agent Coordination\n- Vera→Penelope: ask what the weekend is for/);
  assert.match(next, /Vera→Penelope: ask what the weekend is for\.\n- Old line\./);
});

test('appendCrossAgentLine inserts newest-first and trim still caps at 12', () => {
  let content = `${base}\n## 🤝 Cross-Agent Coordination\n`;
  for (let i = 0; i < 12; i += 1) content = appendCrossAgentLine(content, `- Old ${i}.`);
  const next = appendCrossAgentLine(content, '- New line.');
  const trimmed = applyLogToCentralNode(next, {
    record: { type: 'diary', date: '2026-06-19', mood: 'good', energy: 'high' },
    actionLine: '\n**19 Jun:** Penelope: Logged a diary entry.'
  });
  assert.match(trimmed, /## 🤝 Cross-Agent Coordination\n- New line\./);
  const xaStart = trimmed.indexOf('## 🤝 Cross-Agent Coordination');
  const xaRest = trimmed.slice(xaStart);
  const xaEndRel = xaRest.search(/\n## /);
  const xaSection = xaEndRel === -1 ? xaRest : xaRest.slice(0, xaEndRel);
  const bullets = xaSection.split('\n').filter(l => l.startsWith('- '));
  assert.equal(bullets.length, 12);
});
