import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSystemPrompt } from '../../netlify/functions/_shared/persona.mjs';
import { loadChadwickProtocol } from '../../netlify/functions/_shared/load-chadwick-protocol.mjs';
import { loadBrisketProtocol } from '../../netlify/functions/_shared/load-brisket-protocol.mjs';
import { loadVeraProtocol } from '../../netlify/functions/_shared/load-vera-protocol.mjs';
import { loadPenelopeProtocol } from '../../netlify/functions/_shared/load-penelope-protocol.mjs';
import { loadHammondProtocol } from '../../netlify/functions/_shared/load-hammond-protocol.mjs';

test('builds a named agent prompt naming its writable record types', () => {
  const prompt = buildSystemPrompt({ slug: 'chadwick', digest: 'Streak: 2', constraints: 'Fat < 50g' });
  assert.match(prompt, /You are Chadwick Flexington/);
  assert.match(prompt, /workout/);
  assert.match(prompt, /Streak: 2/);
  assert.match(prompt, /Fat < 50g/);
});

test('penelope prompt includes protocol when provided', () => {
  const prompt = buildSystemPrompt({
    slug: 'penelope',
    digest: '',
    constraints: '',
    penelopeProtocol: '## Diary interview\nOne question at a time.'
  });
  assert.match(prompt, /Penelope operating manual/);
  assert.match(prompt, /One question at a time/);
  assert.match(prompt, /Never ask him to rate energy/);
  assert.match(prompt, /dayone_sent:false/);
});

test('vera prompt includes protocol when provided', () => {
  const prompt = buildSystemPrompt({
    slug: 'vera',
    digest: '',
    constraints: '',
    veraProtocol: '## Reflection only\nNo log_entry.'
  });
  assert.match(prompt, /Vera operating manual/);
  assert.match(prompt, /No log_entry/);
});

test('the router lists every agent, infers the right one, and never narrates the handoff', () => {
  const prompt = buildSystemPrompt({ slug: 'router', digest: '', constraints: '' });
  assert.match(prompt, /Brisket Lasso/);
  assert.match(prompt, /infer/i);
  assert.match(prompt, /[Nn]ever narrate or announce this inference/);
});

test('rejects an unknown slug', () => {
  assert.throws(() => buildSystemPrompt({ slug: 'nope' }), TypeError);
});

test('an empty food library falls back to a plain web_search instruction', () => {
  const prompt = buildSystemPrompt({ slug: 'brisket', digest: '', constraints: '' });
  assert.match(prompt, /use web_search to look up its actual Australian nutrition figures/);
  assert.match(prompt, /Never use US Nutrition Facts/);
  assert.match(prompt, /do not silently cite the US bottle/);
  assert.doesNotMatch(prompt, /Food Library:/);
});

test('a populated food library is included with instructions to check it before searching', () => {
  const prompt = buildSystemPrompt({ slug: 'brisket', digest: '', constraints: '', foodLibrary: '- Domino\'s Meatlovers Pizza (1 slice) — calories=250' });
  assert.match(prompt, /check the Food Library below first/);
  assert.match(prompt, /save_food_library_entry/);
  assert.match(prompt, /Domino's Meatlovers Pizza/);
  assert.match(prompt, /Never use US Nutrition Facts/);
  assert.match(prompt, /Coles\/Woolworths/);
});

test('an empty central node log is omitted entirely', () => {
  const prompt = buildSystemPrompt({ slug: 'brisket', digest: '', constraints: '' });
  assert.doesNotMatch(prompt, /your memory across conversations/);
  assert.doesNotMatch(prompt, /Central Node \(today's status/);
});

test('a populated central node log is included with instructions to treat it as memory', () => {
  const prompt = buildSystemPrompt({
    slug: 'brisket', digest: '', constraints: '',
    centralNodeLog: '**3 Aug:** Brisket Lasso: Logged Domino\'s Meatlovers pizza for lunch (280 kcal).'
  });
  assert.match(prompt, /your memory across conversations/);
  assert.match(prompt, /Logged Domino's Meatlovers pizza for lunch/);
});

test('chadwick prompt includes protocol when provided', () => {
  const prompt = buildSystemPrompt({
    slug: 'chadwick',
    chadwickProtocol: '## Logging protocol\nComplete-only writes.'
  });
  assert.match(prompt, /Complete-only writes/);
  assert.match(prompt, /operating manual/i);
});

test('chadwick prompt omits the protocol block when none is provided', () => {
  const prompt = buildSystemPrompt({ slug: 'chadwick' });
  assert.doesNotMatch(prompt, /operating manual/i);
});

test('chadwick prompt includes saved templates when provided', () => {
  const prompt = buildSystemPrompt({
    slug: 'chadwick',
    workoutTemplates: '- Chest and Curls (strength, last actuals from 2026-07-30)'
  });
  assert.match(prompt, /Saved workout templates/);
  assert.match(prompt, /Chest and Curls/);
});

test('chadwick prompt always carries design-only and schema-gap instructions', () => {
  const prompt = buildSystemPrompt({ slug: 'chadwick' });
  assert.match(prompt, /status planned/i);
  assert.match(prompt, /cable_type on every strength set/);
  assert.match(prompt, /Never invent YAML fields/);
});

test('other agents never receive the chadwick-only protocol instructions', () => {
  const prompt = buildSystemPrompt({ slug: 'brisket' });
  assert.doesNotMatch(prompt, /status planned/i);
  assert.doesNotMatch(prompt, /operating manual/i);
});

test('chadwick prompt includes exercise library highlights when provided', () => {
  const prompt = buildSystemPrompt({
    slug: 'chadwick',
    exerciseLibrary: '- Bar Press — Chest · Crossbar · 42 kg · in rotation'
  });
  assert.match(prompt, /Exercise Library/);
  assert.match(prompt, /search_exercise_library/);
  assert.match(prompt, /save_exercise_library_entry/);
  assert.match(prompt, /Bar Press/);
});

test('chadwick prompt includes the body state block when provided, and instructs him to use it honestly', () => {
  const prompt = buildSystemPrompt({
    slug: 'chadwick',
    bodyState: 'Shoulder:waist ratio: 1.43 (improving) — target 1.60, gap 0.17.'
  });
  assert.match(prompt, /Shoulder:waist ratio: 1\.43/);
  assert.match(prompt, /reference body trend/i);
  assert.match(prompt, /not (claim|say).{0,40}training alone/i);
});

test('chadwick prompt tells him to name the binding constraint and defer to Brisket rather than sell more sets', () => {
  const prompt = buildSystemPrompt({
    slug: 'chadwick',
    bodyState: 'Shoulder:waist ratio: 1.43 (improving) — target 1.60, gap 0.17.'
  });
  assert.match(prompt, /binding constraint/i);
  assert.match(prompt, /defer to Brisket/i);
});

test('chadwick prompt omits the body state block when empty', () => {
  const prompt = buildSystemPrompt({ slug: 'chadwick', bodyState: '' });
  assert.doesNotMatch(prompt, /Body state/i);
});

test('non-chadwick, non-brisket agents never receive the body-state block', () => {
  const prompt = buildSystemPrompt({
    slug: 'sara',
    bodyState: 'Shoulder:waist ratio: 1.43 (improving).'
  });
  assert.doesNotMatch(prompt, /reference body trend/i);
  assert.doesNotMatch(prompt, /Shoulder:waist ratio: 1\.43/);
});

test('brisket prompt includes the body state block when provided, framed as his lane to address', () => {
  const prompt = buildSystemPrompt({
    slug: 'brisket',
    bodyState: 'Shoulder:waist ratio: 1.43 (improving) — target 1.60, gap 0.17.'
  });
  assert.match(prompt, /Shoulder:waist ratio: 1\.43/);
  assert.match(prompt, /your lane/i);
});

test('brisket prompt omits the body state block when empty', () => {
  const prompt = buildSystemPrompt({ slug: 'brisket', bodyState: '' });
  assert.doesNotMatch(prompt, /Shoulder:waist ratio/i);
});

test('chadwick prompt reports days since last session and instructs him to lower the bar at 2+ missed days', () => {
  const prompt = buildSystemPrompt({ slug: 'chadwick', daysSinceLastSession: 3 });
  assert.match(prompt, /3 days since/i);
  assert.match(prompt, /lower the bar/i);
  assert.match(prompt, /10-minute/i);
  assert.match(prompt, /never a guilt trip/i);
});

test('chadwick prompt omits the adherence line when days-since-last-session is unknown (null)', () => {
  const prompt = buildSystemPrompt({ slug: 'chadwick', daysSinceLastSession: null });
  assert.doesNotMatch(prompt, /days since/i);
});

test('chadwick prompt reports zero days since last session without triggering the lower-the-bar instruction text oddly', () => {
  const prompt = buildSystemPrompt({ slug: 'chadwick', daysSinceLastSession: 0 });
  assert.match(prompt, /0 days since/i);
});

test('non-chadwick agents never receive the days-since-last-session line', () => {
  const prompt = buildSystemPrompt({ slug: 'brisket', daysSinceLastSession: 5 });
  assert.doesNotMatch(prompt, /days since/i);
});

test('chadwick prompt always instructs him to generate coach_cues on a planned session, up front, not per set', () => {
  const prompt = buildSystemPrompt({ slug: 'chadwick' });
  assert.match(prompt, /coach_cues/);
  assert.match(prompt, /start.{0,20}rest.{0,20}final_set|final_set.{0,80}start.{0,80}rest/is);
  assert.match(prompt, /up front|in that same turn|alongside the plan/i);
});

test('chadwick prompt omits exercise library block when empty', () => {
  const prompt = buildSystemPrompt({ slug: 'chadwick', exerciseLibrary: '' });
  assert.doesNotMatch(prompt, /Exercise Library highlights/);
});

test('non-chadwick agents never receive exercise library instructions', () => {
  const prompt = buildSystemPrompt({
    slug: 'brisket',
    exerciseLibrary: '- Bar Press — Chest'
  });
  assert.doesNotMatch(prompt, /search_exercise_library/);
  assert.doesNotMatch(prompt, /Bar Press/);
});

test('hyaluronica prompt includes protocol when provided', () => {
  const prompt = buildSystemPrompt({
    slug: 'hyaluronica',
    hyaluronicaProtocol: '## Job\nPrefer the Skincare tab.'
  });
  assert.match(prompt, /Prefer the Skincare tab/);
  assert.match(prompt, /Hyaluronica operating manual/);
  assert.match(prompt, /list_skincare_routines/);
});

test('hyaluronica prompt injects current AM/PM rotation when provided', () => {
  const prompt = buildSystemPrompt({
    slug: 'hyaluronica',
    skincareRoutines: 'Current AM/PM rotation (Skincare tab source of truth; not the same as shelf status):\nAM:\n- La Roche SPF (spf-50) [Sunscreen]\nPM:\n(empty)'
  });
  assert.match(prompt, /Current AM\/PM rotation/);
  assert.match(prompt, /La Roche SPF/);
  assert.match(prompt, /Never invent a routine from shelf status/);
});

test('other agents never receive skincare routines block', () => {
  const prompt = buildSystemPrompt({
    slug: 'chadwick',
    skincareRoutines: 'Current AM/PM rotation:\nAM:\n- La Roche SPF'
  });
  assert.doesNotMatch(prompt, /Current AM\/PM rotation/);
  assert.doesNotMatch(prompt, /La Roche SPF/);
});

test('Chadwick prompt requires planned log_entry after design and CN-shaped programming', () => {
  const prompt = buildSystemPrompt({
    slug: 'chadwick',
    centralNodeLog: '**Today\'s Status:** Brisket flagged a big deficit yesterday.'
  });
  assert.match(prompt, /MUST call log_entry with status planned/i);
  assert.match(prompt, /Confirm card/i);
  assert.match(prompt, /Fitness tab/i);
  assert.match(prompt, /Central Node/i);
  assert.match(prompt, /MUST use/i);
  assert.match(prompt, /shape the prescription/i);
  assert.match(prompt, /mention that influence/i);
});

test('the checked-in Chadwick protocol resolves the Job/stay-in-chat conflict', () => {
  const protocol = loadChadwickProtocol();
  assert.match(protocol, /design, build, or set today.s session/i);
  assert.match(protocol, /status: planned/i);
  assert.match(protocol, /Confirm card/i);
  assert.doesNotMatch(protocol, /stay in chat until he asks to commit/i);
  assert.doesNotMatch(protocol, /When he asks you to lock today's session onto Fitness/);
});

test('the checked-in Chadwick protocol fixes the focus-count math so it fits inside the session window', () => {
  const protocol = loadChadwickProtocol();
  // 3 focuses x >=3 hits each = 9+ moves inside a 20-30 min window (5 of which is warmup)
  // doesn't fit -- 3 focuses is workout_45_60-only; 2 is the default on 30-minute days.
  assert.match(protocol, /workout_45_60/);
  assert.match(protocol, /2 focuses.{0,80}default.{0,40}30.minute|default.{0,40}30.minute.{0,80}2 focuses/is);
});

test('the checked-in Chadwick protocol carves out coach_cues from the never-invent-fields rule instead of contradicting itself', () => {
  const protocol = loadChadwickProtocol();
  assert.match(protocol, /never as invented fields/i);
  assert.match(protocol, /coach_cues.{0,60}is the (one )?exception/is);
  assert.match(protocol, /Mid-session presence/);
});

test('other agents never receive hyaluronica protocol instructions', () => {
  const prompt = buildSystemPrompt({
    slug: 'brisket',
    hyaluronicaProtocol: '## Job\nPrefer the Skincare tab.'
  });
  assert.doesNotMatch(prompt, /Hyaluronica operating manual/);
});

test('brisket prompt includes protocol when provided', () => {
  const prompt = buildSystemPrompt({
    slug: 'brisket',
    brisketProtocol: '## Job\nFood Library first.'
  });
  assert.match(prompt, /Brisket operating manual/);
  assert.match(prompt, /Food Library first/);
  assert.match(prompt, /compact verdict/i);
});

test('shared logging prompt: proposals await Confirm; estimates are last resort; never fake a completed log', () => {
  const prompt = buildSystemPrompt({ slug: 'brisket', digest: '', constraints: '' });
  assert.match(prompt, /awaiting confirm|Confirm card|before that record is saved/i);
  assert.match(prompt, /do not (say|claim|tell).{0,60}(logged|saved to (Nutrition|today))/i);
  assert.match(prompt, /Only fall back to a good-faith estimate when/i);
  assert.match(prompt, /partial|incomplete|re-search|ask Adam for the AU label/i);
  assert.match(prompt, /do not (call )?save_food_library_entry.{0,80}estimate/i);
});

test('shared logging prompt: calcium, polyphenol_score, and omega3 are mandatory with no "couldn\'t find data" excuse', () => {
  const prompt = buildSystemPrompt({ slug: 'brisket', digest: '', constraints: '' });
  assert.match(prompt, /calcium_mg,? polyphenol_score,? and omega3/i);
  assert.match(prompt, /category density estimate/i);
  assert.match(prompt, /never leave it blank/i);
  assert.match(prompt, /judgment calls?.{0,40}not lookups/i);
});

test('checked-in Brisket protocol requires meal verdicts on Central Node', () => {
  const protocol = loadBrisketProtocol();
  const prompt = buildSystemPrompt({
    slug: 'brisket',
    brisketProtocol: protocol,
    centralNodeLog: '**Nutrition:** 400 kcal.'
  });
  assert.match(protocol, /Central Node after meal log/i);
  assert.match(protocol, /\[what he ate\] — \[compact verdict\]/);
  assert.match(protocol, /Corrections \(same slot\)/i);
  assert.match(protocol, /replace/i);
  assert.doesNotMatch(protocol, /leave CN alone/i);
  assert.match(prompt, /Central Node Flags and Recent Actions/i);
  assert.match(prompt, /replace that slot/i);
});

test('sara prompt includes protocol when provided', () => {
  const prompt = buildSystemPrompt({
    slug: 'sara',
    saraProtocol: '## Job\nWeekly health scan.'
  });
  assert.match(prompt, /Sara operating manual/);
  assert.match(prompt, /Weekly health scan/);
});

test('hammond prompt includes protocol when provided', () => {
  const prompt = buildSystemPrompt({
    slug: 'hammond',
    hammondProtocol: '## Job\nSession Triage first.'
  });
  assert.match(prompt, /Hammond operating manual/);
  assert.match(prompt, /Session Triage first/);
});

test('hammond prompt includes audit phase contract when provided', () => {
  const prompt = buildSystemPrompt({
    slug: 'hammond',
    hammondAuditContract: 'THIS TURN ONLY: triage then one intake question.'
  });
  assert.match(prompt, /THIS TURN ONLY: triage then one intake question/);
});

test('non-hammond prompts never include hammond audit contract', () => {
  const prompt = buildSystemPrompt({
    slug: 'brisket',
    hammondAuditContract: 'THIS TURN ONLY: triage'
  });
  assert.doesNotMatch(prompt, /THIS TURN ONLY: triage/);
});

test('Hammond prompt includes full central node markdown when provided', () => {
  const prompt = buildSystemPrompt({
    slug: 'hammond',
    centralNodeFull: '## 📅 This Week\n- Lift',
    centralNodeLog: 'thin-slice-only',
    constraints: 'c'
  });
  assert.match(prompt, /This Week/);
  assert.match(prompt, /full Central Node/i);
  assert.match(prompt, /propose_central_node_patch/);
  assert.match(prompt, /append_governance_log/);
  assert.doesNotMatch(prompt, /thin-slice-only/);
  assert.doesNotMatch(prompt, /Central Node \(today's status, cross-agent directives, recent actions\)/);
});

test('Brisket prompt does not include centralNodeFull', () => {
  const prompt = buildSystemPrompt({
    slug: 'brisket',
    centralNodeFull: '## 📅 This Week\n- SECRET',
    centralNodeLog: 'thin only'
  });
  assert.equal(prompt.includes('SECRET'), false);
});

test('Hammond prompt includes governance log tail when provided', () => {
  const prompt = buildSystemPrompt({
    slug: 'hammond',
    governanceLogTail: "## 2026-08-01 — Coach's Notes\nHold the line."
  });
  assert.match(prompt, /Governance Log \(recent tail/);
  assert.match(prompt, /Hold the line/);
});

test('Hammond prompt includes the one-time carried-over Notion items when the governance log is empty', () => {
  const prompt = buildSystemPrompt({
    slug: 'hammond',
    governanceLogIsEmpty: true
  });
  assert.match(prompt, /Notion carried two open items/);
  assert.match(prompt, /Build a life worth enjoying/);
  assert.match(prompt, /August study load/);
});

test('carried-over Notion items instruction is Hammond-only and absent when the log is not empty', () => {
  assert.equal(
    buildSystemPrompt({ slug: 'brisket', governanceLogIsEmpty: true }).includes('Notion carried two open items'),
    false
  );
  assert.equal(
    buildSystemPrompt({ slug: 'hammond', governanceLogIsEmpty: false }).includes('Notion carried two open items'),
    false
  );
});

test('Hammond prompt includes the 90-day hammondDigest when provided', () => {
  const prompt = buildSystemPrompt({
    slug: 'hammond',
    hammondDigest: 'Logging last 90 days — nutrition: 41/90 days, current gap 2d, longest gap 9d (14–22 Jun).'
  });
  assert.match(prompt, /Logging history \(90-day path presence/);
  assert.match(prompt, /nutrition: 41\/90 days/);
});

test('Hammond prompt includes the CN computed snapshot when hammondCnSummary is provided', () => {
  const prompt = buildSystemPrompt({
    slug: 'hammond',
    hammondCnSummary: 'Central Node computed snapshot\nProtein (7d): rising.'
  });
  assert.match(prompt, /Central Node computed snapshot/);
  assert.match(prompt, /Protein \(7d\): rising/);
});

test('non-hammond prompts never include hammondCnSummary', () => {
  const prompt = buildSystemPrompt({
    slug: 'brisket',
    hammondCnSummary: 'Central Node computed snapshot\nProtein (7d): rising.'
  });
  assert.equal(prompt.includes('Central Node computed snapshot'), false);
});

test('non-hammond prompts never include hammondDigest', () => {
  const prompt = buildSystemPrompt({
    slug: 'brisket',
    hammondDigest: 'Logging last 90 days — nutrition: 41/90 days, current gap 2d, longest gap 9d (14–22 Jun).'
  });
  assert.equal(prompt.includes('41/90 days'), false);
  assert.equal(prompt.includes('Logging history'), false);
});

test('vera protocol restore includes diagnostic, ACE, and mind_session logging', () => {
  const text = loadVeraProtocol();
  assert.match(text, /Framework Selection/);
  assert.match(text, /Dropping Anchor/);
  assert.match(text, /mind_session/);
  assert.doesNotMatch(text, /You do not propose `log_entry`/);
});

test('penelope protocol restore includes gather-context, moods, and cross_agent_note', () => {
  const text = loadPenelopeProtocol();
  assert.match(text, /Relationships and social context|relationship dynamic/i);
  assert.match(text, /moods/);
  assert.match(text, /cross_agent_note/);
  assert.match(text, /On this day/);
});

test('hammond protocol includes Mind domain brief and retrospective', () => {
  const text = loadHammondProtocol();
  assert.match(text, /Mind Insight/);
  assert.match(text, /three-way brief/i);
  assert.match(text, /two-voice/i);
});
