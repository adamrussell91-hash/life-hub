import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isWidgetPath,
  normalizeChallengeProgressWidget,
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

test('normalizeSurfaceWidget rejects unknown templates', () => {
  assert.equal(normalizeSurfaceWidget({
    template_id: 'unknown',
    title: 'Nope',
    props: {}
  }), null);
});
