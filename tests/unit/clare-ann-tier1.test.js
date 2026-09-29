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
  countOpenMarkingInWindow,
  runAnnTeachingForecast
} from '../../netlify/functions/_shared/ann-teaching-forecast.mjs';
import { shouldRunCareerScanNow } from '../../netlify/functions/_shared/career-scan-service.mjs';
import {
  inSydneyClareJudgmentWindow
} from '../../netlify/functions/clare-weekly-judgment-scheduled.mjs';
import {
  inSydneyAnnForecastWindow
} from '../../netlify/functions/ann-teaching-forecast-scheduled.mjs';

test('shouldRunClareWeeklyJudgmentNow is Sunday 19/20 Sydney once per week on success', () => {
  // 2026-09-27 Sunday. 09:00 UTC = 19:00 AEST; 10:00 UTC = 20:00 AEST.
  const sunday1900 = new Date('2026-09-27T09:00:00Z');
  const sunday2000 = new Date('2026-09-27T10:00:00Z');
  const gate = shouldRunClareWeeklyJudgmentNow(sunday1900, {});
  assert.equal(gate.run, true);
  assert.ok(gate.weekKey);
  assert.equal(shouldRunClareWeeklyJudgmentNow(sunday2000, {}).run, true);

  assert.equal(shouldRunClareWeeklyJudgmentNow(sunday1900, { last_success_week: gate.weekKey }).run, false);
  assert.equal(shouldRunClareWeeklyJudgmentNow(sunday2000, { last_success_week: gate.weekKey }).run, false);
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
  assert.equal(written.last_failure_reason, null);
});

test('runClareWeeklyJudgment persists model failure and allows 20:00 retry', async () => {
  let written = null;
  const fail = await runClareWeeklyJudgment({
    now: new Date('2026-09-27T09:00:00Z'),
    deps: {
      readState: async () => ({ state: {}, sha: null }),
      writeState: async (state) => { written = state; },
      digest: 'Tasks:\n- A',
      fetchJudgment: async () => null,
      applyLine: async () => {
        throw new Error('should not apply on model failure');
      }
    }
  });
  assert.equal(fail.ok, false);
  assert.equal(fail.skipped, 'model_failed');
  assert.equal(fail.will_retry, true);
  assert.equal(written.last_success_week, undefined);
  assert.equal(written.last_failure_reason, 'model_failed');
  assert.equal(written.last_failure_week, fail.weekKey);

  let applied = false;
  const retry = await runClareWeeklyJudgment({
    now: new Date('2026-09-27T10:00:00Z'),
    deps: {
      readState: async () => ({ state: written, sha: null }),
      writeState: async (state) => { written = state; },
      digest: 'Tasks:\n- A',
      fetchJudgment: async () => ({
        cross_agent_line: 'Clare→Hammond: Retry after model blip.',
        status_note: null,
        confirm_summary: null
      }),
      applyLine: async () => {
        applied = true;
        return { applied: true };
      }
    }
  });
  assert.equal(retry.ok, true);
  assert.equal(applied, true);
  assert.equal(written.last_success_week, retry.weekKey);
  assert.equal(written.last_failure_reason, null);
});

test('shouldRunAnnTeachingForecastNow is Sunday 18 Sydney once per week', () => {
  // 08:00 UTC = 18:00 AEST on 2026-09-27.
  const sunday1800 = new Date('2026-09-27T08:00:00Z');
  const gate = shouldRunAnnTeachingForecastNow(sunday1800, {});
  assert.equal(gate.run, true);
  assert.equal(shouldRunAnnTeachingForecastNow(sunday1800, { last_success_week: gate.weekKey }).run, false);
});

test('countOpenMarkingInWindow uses task.marking return_by', () => {
  assert.equal(countOpenMarkingInWindow([
    {
      id: 't1',
      status: 'open',
      marking: { class_label: '7A', scripts: 28, collected_on: '2026-09-20', return_by: '2026-10-05' }
    },
    {
      id: 't2',
      status: 'done',
      marking: { class_label: '8B', scripts: 10, collected_on: '2026-09-20', return_by: '2026-10-01' }
    },
    {
      id: 't3',
      status: 'open',
      marking: { class_label: '9C', scripts: 12, collected_on: '2026-09-01', return_by: '2026-09-20' }
    },
    { id: 't4', status: 'open', title: 'Essay feedback' }
  ], '2026-09-29', '2026-10-13'), 1);
});

test('buildAnnTeachingForecastLine counts lessons and real marking tasks', () => {
  const line = buildAnnTeachingForecastLine({
    today: '2026-09-29',
    lessons: [
      { date: '2026-09-30', title: 'Year 9 poetry' },
      { date: '2026-09-30', title: 'Marking moderation' },
      { date: '2026-10-02', title: 'Essay feedback' },
      { date: '2026-09-28', title: 'Past' },
      { date: '2026-10-20', title: 'Outside window' }
    ],
    tasks: [
      {
        id: 'm1',
        status: 'open',
        marking: { class_label: '9A', scripts: 28, collected_on: '2026-09-22', return_by: '2026-10-03' }
      },
      {
        id: 'm2',
        status: 'open',
        marking: { class_label: '10B', scripts: 20, collected_on: '2026-09-25', return_by: '2026-10-10' }
      }
    ]
  });
  assert.match(line, /^Ann→Hammond: Teaching load 2026-09-29–2026-10-13:/);
  assert.match(line, /3 lessons across 2 days/);
  assert.match(line, /2 open marking tasks/);
  // Title heuristics must not inflate the marking count.
  assert.doesNotMatch(line, /assessment\/marking-heavy/);
});

test('buildAnnTeachingForecastLine handles empty window', () => {
  const line = buildAnnTeachingForecastLine({ today: '2026-09-29', lessons: [], tasks: [] });
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
      tasks: [],
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

test('Sydney windows for Clare 19/20 and Ann 18:00', () => {
  assert.equal(inSydneyClareJudgmentWindow(new Date('2026-09-27T09:00:00Z')), true);
  assert.equal(inSydneyClareJudgmentWindow(new Date('2026-09-27T10:00:00Z')), true);
  assert.equal(inSydneyClareJudgmentWindow(new Date('2026-09-27T08:00:00Z')), false);
  assert.equal(inSydneyAnnForecastWindow(new Date('2026-09-27T08:00:00Z')), true);
  assert.equal(inSydneyAnnForecastWindow(new Date('2026-09-27T09:00:00Z')), false);
});
