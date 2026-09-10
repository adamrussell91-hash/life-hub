/**
 * Tranche A — rich pack evidence must remain in model context when the kernel owns the turn.
 * These tests prove prompt contents, not live conversational behaviour.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { runSurfaceAgentTurn } from '../../netlify/functions/_shared/agent-surface.mjs';

const TODAY = '2026-08-20';
const NOW = new Date('2026-08-20T01:00:00.000Z');

test('Clementine kernel turn still contains note excerpts, tags, and connections', () => {
  const turn = runSurfaceAgentTurn({
    surface: 'life',
    slug: 'clementine',
    message: 'what do I already know about cognitive load',
    today: TODAY,
    now: NOW,
    flag: true,
    stores: {
      pages: [{
        id: 'note-cl',
        title: 'Cognitive load',
        excerpt: 'Working memory limits constrain how many elements a learner can hold.',
        claims: ['Intrinsic load rises with interacting elements'],
        tags: ['memory', 'instruction'],
        connected: ['note-sweller']
      }]
    }
  });
  assert.equal(turn.kernel.plan.workflow, 'knowledge_research');
  assert.match(turn.promptBlock, /Working memory limits constrain how many elements/);
  assert.match(turn.promptBlock, /note-cl/);
  assert.match(turn.promptBlock, /memory/);
  assert.match(turn.promptBlock, /note-sweller/);
  assert.match(turn.promptBlock, /Intrinsic load rises/);
  assert.match(turn.promptBlock, /Claims:/);
});

test('Ann kernel turn still contains lesson structure and diagnosis gaps', () => {
  const turn = runSurfaceAgentTurn({
    surface: 'life',
    slug: 'ann',
    message: "help me improve tomorrow's lesson",
    today: TODAY,
    now: NOW,
    flag: true,
    stores: {
      classes: [{ id: 'c1', code: '10ENG', display_name: 'Year 10 English' }],
      units: [{ id: 'u1', title: 'Essay unit', class_id: 'c1', lesson_ids: ['l1'] }],
      lessons: [{
        id: 'l1',
        type: 'lesson',
        title: 'Year 10 essay',
        date: TODAY,
        class_id: 'c1',
        unit_id: 'u1',
        outcome_ids: ['EN5-1A'],
        blocks: [{ id: 'b1', block_type: 'heading', content: { text: 'Write a thesis that answers the prompt' } }]
      }]
    }
  });
  assert.equal(turn.kernel.plan.workflow, 'lesson_diagnosis');
  assert.match(turn.promptBlock, /Year 10 essay/);
  assert.match(turn.promptBlock, /EN5-1A/);
  assert.match(turn.promptBlock, /10ENG|Essay unit/);
  assert.match(turn.promptBlock, /Claims:/);
  assert.match(turn.promptBlock, /lesson_title=Year 10 essay|outcome_ids/);
});

test('Sara kernel turn still contains medical visit details, not only found=true', () => {
  const turn = runSurfaceAgentTurn({
    surface: 'life',
    slug: 'sara',
    message: 'any medical context I should know',
    today: TODAY,
    now: NOW,
    flag: true,
    stores: {
      composition: [{ date: '2026-08-18', weight_kg: 90 }],
      measurements: [],
      medicalEvents: [{
        path: 'data/medical/2026-08-12-clinic.md',
        record: {
          type: 'medical',
          date: '2026-08-12',
          title: 'GP review',
          provider: 'Dr Chen',
          location: 'Broadway clinic',
          notes: 'Discussed flare and bloods from July'
        },
        body: 'Discussed flare and bloods from July. Follow up in six weeks.'
      }]
    }
  });
  assert.equal(turn.kernel.plan.workflow, 'health_timeline');
  assert.match(turn.promptBlock, /Dr Chen|Broadway clinic|Discussed flare and bloods/);
  assert.match(turn.promptBlock, /2026-08-12/);
  assert.doesNotMatch(turn.promptBlock, /^[^{]*found=true[^{]*$/);
});
