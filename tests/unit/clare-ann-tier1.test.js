import test from 'node:test';
import assert from 'node:assert/strict';
import {
  shouldRunClareWeeklyJudgmentNow,
  parseClareJudgment,
  buildClareJudgmentUserPrompt,
  runClareWeeklyJudgment
} from '../../netlify/functions/_shared/clare-weekly-judgment.mjs';
import {
  shouldRunAnnTeachingForecastNow,
  buildAnnTeachingForecastLine,
  runAnnTeachingForecast
} from '../../netlify/functions/_shared/ann-teaching-forecast.mjs';
import { shouldRunCareerScanNow } from '../../netlify/functions/_shared/career-scan-service.mjs';
import {
  inSydneyClareJudgmentWindow
} from '../../netlify/functions/clare-weekly-judgment-scheduled.mjs';
import {
  inSydneyAnnForecastWindow
} from '../../netlify/functions/ann-teaching-forecast-scheduled.mjs';

test('shouldRunClareWeeklyJudgmentNow is Sunday 19 Sydney once per week', () => {
  // 2026-09-27 Sunday. 09:00 UTC = 19:00 AEST.
  const sunday1900 = new Date('2026-09-27T09:00:00Z');
  const gate = shouldRunClareWeeklyJudgmentNow(sunday1900, {});
  assert.equal(gate.run, true);
  assert.ok(gate.weekKey);

  assert.equal(shouldRunClareWeeklyJudgmentNow(sunday1900, { last_success_week: gate.weekKey }).run, false);
  assert.equal(shouldRunClareWeeklyJudgmentNow(new Date('2026-09-27T08:00:00Z'), {}).run, false);
  assert.equal(shouldRunClareWeeklyJudgmentNow(new Date('2026-09-28T09:00:00Z'), {}).run, false);
});

test('parseClareJudgment requires Clare→Hammond line', () => {
  assert.equal(parseClareJudgment('{"cross_agent_line":"Hammond→Clare: no"}'), null);
  const ok = parseClareJudgment(JSON.stringify({
    cross_agent_line: 'Clare→Hammond: Mark pack collides with Thursday load.',
    status_note: 'Watch Thursday pile-up',
    confirm_summary: 'Clare Status flag'
  }));
  assert.equal(ok.cross_agent_line, 'Clare→Hammond: Mark pack collides with Thursday load.');
  assert.equal(ok.status_note, 'Watch Thursday pile-up');
});

test('buildClareJudgmentUserPrompt wraps digest', () => {
  assert.match(buildClareJudgmentUserPrompt('Tasks:\n- A'), /<digest>/);
  assert.match(buildClareJudgmentUserPrompt('Tasks:\n- A'), /Tasks:/);
});

test('runClareWeeklyJudgment applies line and records week', async () => {
  let written = null;
  const result = await runClareWeeklyJudgment({
    now: new Date('2026-09-27T09:00:00Z'),
    deps: {
      readState: async () => ({ state: {}, sha: null }),
      writeState: async (state) => { written = state; },
      digest: 'Tasks:\n- Mark pack (due 2026-09-30)',
      fetchJudgment: async () => ({
        cross_agent_line: 'Clare→Hammond: Protect Wednesday for Mark pack.',
        status_note: null,
        confirm_summary: null
      }),
      applyLine: async () => ({ applied: true }),
      queuePatch: async () => ({ queued: false })
    }
  });
  assert.equal(result.applied, true);
  assert.equal(result.line, 'Clare→Hammond: Protect Wednesday for Mark pack.');
  assert.equal(written.last_success_week, result.weekKey);
});

test('shouldRunAnnTeachingForecastNow is Sunday 18 Sydney once per week', () => {
  // 08:00 UTC = 18:00 AEST on 2026-09-27.
  const sunday1800 = new Date('2026-09-27T08:00:00Z');
  const gate = shouldRunAnnTeachingForecastNow(sunday1800, {});
  assert.equal(gate.run, true);
  assert.equal(shouldRunAnnTeachingForecastNow(sunday1800, { last_success_week: gate.weekKey }).run, false);
});

test('buildAnnTeachingForecastLine counts lessons and marking cues', () => {
  const line = buildAnnTeachingForecastLine({
    today: '2026-09-29',
    lessons: [
      { date: '2026-09-30', title: 'Year 9 poetry' },
      { date: '2026-09-30', title: 'Marking moderation' },
      { date: '2026-10-02', title: 'Essay feedback' },
      { date: '2026-09-28', title: 'Past' },
      { date: '2026-10-20', title: 'Outside window' }
    ]
  });
  assert.match(line, /^Ann→Hammond: Teaching load 2026-09-29–2026-10-13:/);
  assert.match(line, /3 lessons across 2 days/);
  assert.match(line, /2 look assessment\/marking-heavy/);
});

test('buildAnnTeachingForecastLine handles empty window', () => {
  const line = buildAnnTeachingForecastLine({ today: '2026-09-29', lessons: [] });
  assert.match(line, /no scheduled lessons/);
});

test('runAnnTeachingForecast applies deterministic line', async () => {
  let written = null;
  const result = await runAnnTeachingForecast({
    now: new Date('2026-09-27T08:00:00Z'),
    deps: {
      readState: async () => ({ state: {}, sha: null }),
      writeState: async (state) => { written = state; },
      lessons: [{ date: '2026-09-28', title: '7A English' }],
      applyLine: async ({ line }) => ({ applied: true, line })
    }
  });
  assert.equal(result.applied, true);
  assert.match(result.line, /^Ann→Hammond:/);
  assert.equal(written.last_success_week, result.weekKey);
});

test('shouldRunCareerScanNow retries Sunday 18 and 19 if week not done', () => {
  const sun17 = new Date('2026-09-27T07:00:00Z');
  const sun18 = new Date('2026-09-27T08:00:00Z');
  const sun19 = new Date('2026-09-27T09:00:00Z');
  assert.equal(shouldRunCareerScanNow(sun17, {}).run, true);
  assert.equal(shouldRunCareerScanNow(sun18, {}).run, true);
  assert.equal(shouldRunCareerScanNow(sun19, {}).run, true);
  const week = shouldRunCareerScanNow(sun17, {}).weekKey;
  assert.equal(shouldRunCareerScanNow(sun18, { last_success_week: week }).run, false);
});

test('Sydney windows for Clare 19:00 and Ann 18:00', () => {
  assert.equal(inSydneyClareJudgmentWindow(new Date('2026-09-27T09:00:00Z')), true);
  assert.equal(inSydneyClareJudgmentWindow(new Date('2026-09-27T08:00:00Z')), false);
  assert.equal(inSydneyAnnForecastWindow(new Date('2026-09-27T08:00:00Z')), true);
  assert.equal(inSydneyAnnForecastWindow(new Date('2026-09-27T09:00:00Z')), false);
});
