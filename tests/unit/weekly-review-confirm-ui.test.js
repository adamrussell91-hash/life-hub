/**
 * WR8 — Weekly Review Confirm-stage decision UI.
 * LEVEL 2 UI: informational non-confirmable; selection → callback ids; no Saved claim / no direct persist.
 */
import assert from 'node:assert/strict';
import { describe, it, before, after } from 'node:test';
import { Window } from '../../apps/tasks/node_modules/happy-dom/lib/index.js';
import { createReviewProgressCard } from '../../packages/design-kit/js/agent-productivity-cards.js';

describe('WR8 Weekly Review Confirm decision UI', () => {
  /** @type {Window} */
  let window;

  before(() => {
    window = new Window({ url: 'https://life.example/tasks' });
    globalThis.document = window.document;
    globalThis.HTMLElement = window.HTMLElement;
  });

  after(() => {
    window.close();
    delete globalThis.document;
    delete globalThis.HTMLElement;
  });

  it('informational row is non-confirmable; confirmable rows select independently; callback ids match', () => {
    const generated = [];
    const selections = [];
    const card = createReviewProgressCard(window.document, {
      current: 'confirm',
      completed: [
        'capture',
        'past_calendar',
        'upcoming_calendar',
        'waiting',
        'projects',
        'someday',
        'build_week'
      ],
      pendingChanges: [
        {
          id: 'project_health:proj_orphan',
          kind: 'informational',
          summary: 'Project Orphan needs a next action — provide a concrete title',
          confirmable: false,
          selected: false
        },
        {
          id: 'next_action:proj_A',
          kind: 'next_action',
          summary: 'Create next action “Score Year 10 essays” for project proj_A',
          confirmable: true,
          selected: true
        },
        {
          id: 'waiting:task_wait_B:follow_up',
          kind: 'waiting',
          summary: 'Waiting follow_up: Awaiting exam board reply',
          confirmable: true,
          selected: true
        }
      ],
      onSelectionChange: (ids) => selections.push([...ids]),
      onGenerateProposal: (ids) => generated.push([...ids])
    });

    const rows = [...card.querySelectorAll('[data-change-id]')];
    assert.equal(rows.length, 3);

    const info = card.querySelector('[data-change-id="project_health:proj_orphan"]');
    assert.equal(info?.dataset.confirmable, 'false');
    assert.equal(info.querySelector('input[type="checkbox"]'), null);
    assert.match(info.textContent, /Informational — not confirmable/i);

    const nextAction = card.querySelector('[data-change-id="next_action:proj_A"] input[type="checkbox"]');
    const waiting = card.querySelector('[data-change-id="waiting:task_wait_B:follow_up"] input[type="checkbox"]');
    assert.ok(nextAction);
    assert.ok(waiting);
    assert.equal(nextAction.checked, true);
    assert.equal(waiting.checked, true);

    // Deselect waiting independently.
    waiting.checked = false;
    waiting.dispatchEvent(new window.Event('change', { bubbles: true }));
    assert.ok(selections.length >= 1);
    assert.deepEqual(selections.at(-1).sort(), ['next_action:proj_A']);

    const generate = [...card.querySelectorAll('button')].find((btn) =>
      /Generate Confirm proposal/i.test(btn.textContent || '')
    );
    assert.ok(generate);
    generate.click();
    assert.equal(generated.length, 1);
    assert.deepEqual(generated[0].sort(), ['next_action:proj_A']);

    // UI only asks for proposal generation — it does not claim writes landed.
    assert.match(card.textContent, /Nothing is saved until Adam confirms/i);
    assert.doesNotMatch(card.textContent, /saved to tasks|write succeeded|already saved/i);
  });
});
