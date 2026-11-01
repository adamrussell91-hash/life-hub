import assert from 'node:assert/strict';
import test from 'node:test';

import {
  TASKS_FULL_SUITE_TRIGGERS,
  TEACHING_FULL_SUITE_TRIGGERS,
  fullSuiteTrigger
} from '../../scripts/lib/vitest-scope.mjs';

const tasks = (...files) => fullSuiteTrigger(files, TASKS_FULL_SUITE_TRIGGERS);
const teaching = (...files) => fullSuiteTrigger(files, TEACHING_FULL_SUITE_TRIGGERS);

test('an imported package JS file runs only the tests that reach it', () => {
  assert.equal(tasks('packages/design-kit/js/hub-chat-attachments.js'), undefined);
  assert.equal(teaching('packages/design-kit/js/hub-chat-attachments.js'), undefined);
  assert.equal(tasks('packages/decision-book/fixtures.mjs', 'packages/problem-solver/render/swot.ts'), undefined);
});

test('package CSS that Tasks tests read from disk runs the whole Tasks suite', () => {
  assert.equal(tasks('packages/problem-solver/problem-solver.css'), 'packages/problem-solver/problem-solver.css');
  assert.equal(tasks('packages/design-kit/calendar.css'), 'packages/design-kit/calendar.css');
  assert.equal(teaching('packages/problem-solver/problem-solver.css'), undefined);
});

test('design-kit JS that Tasks tests read as text runs the whole Tasks suite', () => {
  assert.ok(tasks('packages/design-kit/js/visual-viewport.js'));
  assert.ok(tasks('packages/design-kit/js/calendar/render-day-dial.js'));
});

test('grove, config and the gate itself still run whole suites', () => {
  assert.ok(tasks('packages/grove-history/index.js'));
  assert.ok(tasks('apps/tasks/vite.config.ts'));
  assert.ok(tasks('scripts/pre-pr-check.mjs'));
  assert.ok(teaching('scripts/lib/vitest-scope.mjs'));
  assert.ok(teaching('apps/teaching/tests/setup/web-storage.ts'));
  assert.ok(teaching('.github/workflows/pages.yml'));
});
