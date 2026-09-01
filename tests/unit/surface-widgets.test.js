import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isWidgetPath,
  normalizeChallengeProgressWidget,
  normalizeMealPlanWeekWidget,
  normalizeSurfaceWidget,
  parseWidgetBlob
} from '../../netlify/functions/_shared/surface-widgets.mjs';

test('isWidgetPath accepts dated widget instances under data/widgets', () => {
  assert.equal(isWidgetPath('data/widgets/2026-08-31-no-sugar.json'), true);
  assert.equal(isWidgetPath('data/widgets/bad.json'), false);
  assert.equal(isWidgetPath('data/challenges/x.json'), false);
});

test('parseWidgetBlob validates published widget shape', () => {
  const parsed = parseWidgetBlob(JSON.stringify({
    id: 'wg_abc',
    template_id: 'challenge-progress',
    title: 'No sugar',
    props: { progress_pct: 40, title: 'No sugar week' },
    status: 'published'
  }));
  assert.equal(parsed.template_id, 'challenge-progress');
  assert.equal(parsed.title, 'No sugar');
});

test('normalizeChallengeProgressWidget clamps progress_pct', () => {
  const normalized = normalizeChallengeProgressWidget({
    template_id: 'challenge-progress',
    title: 'No sugar',
    props: { progress_pct: 140, title: 'No sugar week', subtitle: 'Day 5' }
  });
  assert.equal(normalized.props.progress_pct, 100);
  assert.equal(normalized.props.subtitle, 'Day 5');
});

test('normalizeMealPlanWeekWidget builds day rows from meals object', () => {
  const normalized = normalizeMealPlanWeekWidget({
    template_id: 'meal-plan-week',
    title: 'Meal plan',
    props: {
      week_id: '2026-W35',
      meals: {
        mon: { dinner: 'Marley Spoon chicken bowl' },
        tue: 'Leftovers + salad'
      },
      notes: 'Vyvanse-light lunches'
    }
  });
  assert.equal(normalized.props.week_id, '2026-W35');
  assert.equal(normalized.props.days.length, 2);
  assert.match(normalized.props.days[0].text, /Marley Spoon/);
  assert.equal(normalized.props.notes, 'Vyvanse-light lunches');
});

test('normalizeSurfaceWidget accepts meal-plan-week', () => {
  const normalized = normalizeSurfaceWidget({
    template_id: 'meal-plan-week',
    title: 'Week plan',
    props: {
      week_id: '2026-W35',
      meals: { wed: 'Soup' }
    }
  });
  assert.equal(normalized.template_id, 'meal-plan-week');
  assert.equal(normalized.props.days.length, 1);
});
