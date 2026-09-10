import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WEEK_PACK_UNAVAILABLE_MARKER,
  isWeeklyPlanningTurn,
  hammondWeekWindows,
  buildHammondWeekPack,
  formatHammondWeekPackForPrompt,
  getWeekReview
} from '../../netlify/functions/_shared/hammond-week.mjs';
import { buildSystemPrompt } from '../../netlify/functions/_shared/persona.mjs';

const SUNDAY = '2026-09-06';

test('Sunday recap is this Mon–Sun and forward is next Mon–Sun', () => {
  const windows = hammondWeekWindows(SUNDAY);
  assert.equal(windows.recapStart, '2026-08-31');
  assert.equal(windows.recapEnd, SUNDAY);
  assert.equal(windows.forwardStart, '2026-09-07');
  assert.equal(windows.forwardEnd, '2026-09-13');
});

test('Wednesday recap is Mon–today and forward is tomorrow through next Sunday', () => {
  const windows = hammondWeekWindows('2026-09-02');
  assert.equal(windows.recapStart, '2026-08-31');
  assert.equal(windows.recapEnd, '2026-09-02');
  assert.equal(windows.forwardStart, '2026-09-03');
  assert.equal(windows.forwardEnd, '2026-09-13');
});

test('isWeeklyPlanningTurn matches ordinary Sunday wording and the protocol id', () => {
  assert.equal(isWeeklyPlanningTurn({ message: 'Hammond, weekly review' }), true);
  assert.equal(isWeeklyPlanningTurn({ message: "let's recap the week" }), true);
  assert.equal(isWeeklyPlanningTurn({ message: 'plan next week' }), true);
  assert.equal(isWeeklyPlanningTurn({ message: 'Sunday night recap' }), true);
  assert.equal(isWeeklyPlanningTurn({ message: 'Week recap + plan' }), true);
  assert.equal(isWeeklyPlanningTurn({ protocolId: 'weekly-review' }), true);
  assert.equal(isWeeklyPlanningTurn({ message: 'what is slipping across my life?' }), false);
  assert.equal(isWeeklyPlanningTurn({ message: 'log lunch' }), false);
});

test('week pack recap names last-week facts and forward names due work', () => {
  const pack = buildHammondWeekPack({
    today: SUNDAY,
    events: [
      { record: { type: 'workout', date: '2026-09-01', status: 'completed', title: 'Upper Body' } },
      { record: { type: 'workout', date: '2026-09-03', status: 'skipped', title: 'Lower' } },
      { record: { type: 'meal', date: '2026-09-01', protein_g: 140 } },
      { record: { type: 'meal', date: '2026-09-02', protein_g: 90 } },
      { record: { type: 'diary', date: '2026-09-05', mood: 'tired', mood_score: 3, system_note: 'marking pile ate the evening' } },
      { record: { type: 'mind_session', date: '2026-09-03', title: 'Agency' } },
      { record: { type: 'weight', date: '2026-09-04', weight_kg: 86.2 } },
      { record: { type: 'workout', date: '2026-08-20', status: 'completed', title: 'Too old' } }
    ],
    tasks: [
      { title: 'Mark Year 10 essays', status: 'open', due_date: '2026-09-04' },
      { title: 'Email parents', status: 'open', due_date: '2026-09-08', priority: 'high' },
      { title: 'Done already', status: 'done', due_date: '2026-09-08' }
    ],
    classes: [{ id: 'c1', code: '10ENG' }],
    lessons: [
      { date: '2026-09-03', title: 'Rhetoric recap', class_id: 'c1' },
      { date: '2026-09-08', title: 'Persuasive openings', class_id: 'c1' }
    ],
    centralNodeMarkdown: '## 📅 This Week\n'
  });

  assert.equal(pack.ok, true);
  assert.equal(pack.recap.fitness.completed, 1);
  assert.equal(pack.recap.fitness.skipped, 1);
  assert.ok(pack.recap.fitness.titles.some(line => line.includes('Upper Body')));
  assert.equal(pack.recap.nutrition.days_logged, 2);
  assert.equal(pack.recap.diary.days, 1);
  assert.equal(pack.recap.vera.count, 1);
  assert.equal(pack.recap.body.date, '2026-09-04');
  assert.equal(pack.forward.tasks.due[0].title, 'Email parents');
  assert.equal(pack.forward.tasks.overdue[0].title, 'Mark Year 10 essays');
  assert.equal(pack.forward.teaching.rows[0].includes('Persuasive openings'), true);
  assert.equal(pack.forward.teaching_recap.rows[0].includes('Rhetoric recap'), true);
  assert.equal(pack.cn_this_week.empty, true);

  const text = formatHammondWeekPackForPrompt(pack);
  assert.match(text, /Upper Body/);
  assert.match(text, /marking pile ate the evening/);
  assert.match(text, /Email parents/);
  assert.match(text, /Persuasive openings/);
  assert.match(text, /not in the open-task store/);
  assert.match(text, /Do not start a Central Node audit/);
  assert.doesNotMatch(text, /Too old/);
});

test('empty week is fail-visible empty, not a fake full inventory', () => {
  const text = formatHammondWeekPackForPrompt(buildHammondWeekPack({ today: SUNDAY, events: [], tasks: [], lessons: [] }));
  assert.match(text, /no sessions in this recap window/);
  assert.match(text, /no meals in this recap window/);
  assert.match(text, /no entries in this recap window/);
  assert.doesNotMatch(text, /UNAVAILABLE — Life week files failed/);
});

test('failed Life load is unavailable, not empty-by-design', () => {
  const text = formatHammondWeekPackForPrompt(buildHammondWeekPack({
    today: SUNDAY,
    events: [{ record: { type: 'workout', date: '2026-09-01', status: 'completed', title: 'Secret' } }],
    loadErrors: { life: 'load_failed' }
  }));
  assert.match(text, /UNAVAILABLE/);
  assert.doesNotMatch(text, /Secret/);
  assert.doesNotMatch(text, /no sessions in this recap window/);
});

test('Hammond prompt delivers the week pack; Brisket never does', () => {
  const packText = formatHammondWeekPackForPrompt(getWeekReview({
    today: SUNDAY,
    events: [{ record: { type: 'workout', date: '2026-09-01', status: 'completed', title: 'Upper Body' } }]
  }));
  const hammond = buildSystemPrompt({ slug: 'hammond', hammondWeekPack: packText });
  assert.match(hammond, /Week pack \(Sydney weeks/);
  assert.match(hammond, /Upper Body/);
  const brisket = buildSystemPrompt({ slug: 'brisket', hammondWeekPack: packText });
  assert.doesNotMatch(brisket, /Upper Body/);
  assert.doesNotMatch(brisket, /Week pack \(Sydney weeks/);
});

test('unavailable marker is distinct from an empty successful pack', () => {
  assert.match(WEEK_PACK_UNAVAILABLE_MARKER, /UNAVAILABLE/);
  assert.match(formatHammondWeekPackForPrompt({ ok: false }), /UNAVAILABLE/);
});
