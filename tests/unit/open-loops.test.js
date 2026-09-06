import test from 'node:test';
import assert from 'node:assert/strict';
import {
  collectOpenLoops,
  oldestOpenLoop,
  formatOpenLoopLine
} from '../../apps/life/js/core/open-loops.js';

const TODAY = '2026-08-11';

const GOV = [
  '# Governance Log',
  '',
  '## 2026-05-24 — Drift Detection',
  '**Title:** MEd Sem 2',
  '**Status:** Still Active',
  '',
  'Unactioned.',
  ''
].join('\n');

test('collectOpenLoops does not treat a Pattern Review Mind Insight as a Hammond loop', () => {
  const loops = collectOpenLoops({
    today: TODAY,
    governanceLogMarkdown: [
      '# Governance Log',
      '',
      '## 2026-03-10 — Mind Insight',
      '**Title:** Mar 2026 — Pattern Review: First Year',
      '',
      'Historical synthesis.',
      ''
    ].join('\n')
  });
  assert.deepEqual(loops, []);
});

test('collectOpenLoops includes the oldest open governance entry as Hammond', () => {
  const loops = collectOpenLoops({ today: TODAY, governanceLogMarkdown: GOV });
  assert.equal(loops.length, 1);
  assert.equal(loops[0].source, 'governance');
  assert.equal(loops[0].owner, 'Hammond');
  assert.equal(loops[0].title, 'MEd Sem 2');
  assert.equal(loops[0].dateKey, '2026-05-24');
  assert.equal(loops[0].ageDays, 79);
});

test('collectOpenLoops includes Cross-Agent directives', () => {
  const cn = [
    '## 🤝 Cross-Agent Coordination',
    '*One-line directives only.*',
    '- Chadwick→Sara: left knee — avoid loaded flexion.',
    '---'
  ].join('\n');
  const loops = collectOpenLoops({ today: TODAY, centralNodeMarkdown: cn });
  assert.equal(loops.length, 1);
  assert.equal(loops[0].source, 'cross_agent');
  assert.equal(loops[0].owner, 'Cross-agent');
  assert.match(loops[0].title, /left knee/);
  assert.equal(loops[0].dateKey, TODAY);
  assert.equal(loops[0].ageDays, 0);
});

test('collectOpenLoops reads a date on a Cross-Agent line when present', () => {
  const cn = [
    '## 🤝 Cross-Agent Coordination',
    '- Clare→Hammond: park the dump until 2026-07-01 marking is done.'
  ].join('\n');
  const loops = collectOpenLoops({ today: TODAY, centralNodeMarkdown: cn });
  assert.equal(loops[0].dateKey, '2026-07-01');
  assert.equal(loops[0].ageDays, 41);
});

test('collectOpenLoops ignores a cited calendar date that is not the loop age', () => {
  const cn = [
    '## 🤝 Cross-Agent Coordination',
    '- Hammond→Clare: revisit the 2023-03-21 bloods before next labs.'
  ].join('\n');
  const loops = collectOpenLoops({ today: TODAY, centralNodeMarkdown: cn });
  assert.equal(loops[0].dateKey, TODAY);
  assert.equal(loops[0].ageDays, 0);
});

test('collectOpenLoops treats Clare Later items as open loops', () => {
  const loops = collectOpenLoops({
    today: TODAY,
    tasks: [
      { title: 'Mark essays', kind: 'task', priority: 'low', status: 'open', created_at: '2026-07-20T00:00:00Z' },
      { title: 'Call the school', kind: 'communication', priority: 'high', status: 'open', due_date: '2026-08-12' },
      { title: 'Finished brief', kind: 'task', priority: 'low', status: 'done', created_at: '2026-06-01T00:00:00Z' }
    ]
  });
  assert.equal(loops.length, 1);
  assert.equal(loops[0].source, 'clare_later');
  assert.equal(loops[0].owner, 'Clare');
  assert.equal(loops[0].title, 'Mark essays');
  assert.equal(loops[0].dateKey, '2026-07-20');
  assert.equal(loops[0].ageDays, 22);
});

test('collectOpenLoops surfaces week flags from weeks that have already ended', () => {
  const loops = collectOpenLoops({
    today: TODAY,
    weekFlags: {
      weeks: {
        '2026-08-10': { travel: true },
        '2026-06-01': { exam: 'MEd sit' }
      }
    }
  });
  assert.equal(loops.length, 1);
  assert.equal(loops[0].source, 'stale_flag');
  assert.equal(loops[0].owner, 'Remember');
  assert.match(loops[0].title, /exam/);
  assert.equal(loops[0].dateKey, '2026-06-01');
});

test('collectOpenLoops includes Tasks stress flags by created_at', () => {
  const loops = collectOpenLoops({
    today: TODAY,
    stressFlags: [{
      id: 'sf_1',
      pattern_description: 'Two excursions overlap this fortnight',
      pattern_kind: 'overlapping_excursions',
      created_at: '2026-07-01T10:00:00Z'
    }]
  });
  assert.equal(loops[0].source, 'stress_flag');
  assert.equal(loops[0].owner, 'Tasks');
  assert.match(loops[0].title, /excursions overlap/);
  assert.equal(loops[0].dateKey, '2026-07-01');
  assert.equal(loops[0].ageDays, 41);
});

test('oldestOpenLoop prefers the earliest dated item', () => {
  const loops = collectOpenLoops({
    today: TODAY,
    governanceLogMarkdown: GOV,
    tasks: [
      { title: 'Someday reading', kind: 'task', priority: 'low', status: 'open', created_at: '2026-01-01T00:00:00Z' }
    ]
  });
  const oldest = oldestOpenLoop(loops);
  assert.equal(oldest.source, 'clare_later');
  assert.equal(formatOpenLoopLine(oldest), 'Clare: Someday reading — 222d open.');
});

test('collectOpenLoops surfaces research briefs that have expired or expire today', () => {
  const loops = collectOpenLoops({
    today: TODAY,
    researchBriefs: [
      {
        title: 'Knee load after taper',
        expires_at: '2026-08-11T00:00:00.000Z',
        sources: ['https://example.edu/knee']
      },
      {
        title: 'Fresh brief',
        expires_at: '2026-09-01T00:00:00.000Z',
        sources: ['https://example.edu/fresh']
      }
    ]
  });
  assert.equal(loops.length, 1);
  assert.equal(loops[0].source, 'research_brief');
  assert.equal(loops[0].owner, 'Research');
  assert.equal(loops[0].title, 'Knee load after taper');
  assert.equal(loops[0].dateKey, '2026-08-11');
});

test('oldestOpenLoop is null when nothing is open', () => {
  assert.equal(oldestOpenLoop(collectOpenLoops({ today: TODAY })), null);
  assert.equal(formatOpenLoopLine(null), null);
});
