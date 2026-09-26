import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HENRY_INFERENCE_FIXTURES,
  inferLinkProposals
} from '../../netlify/functions/_shared/link-inference-rules.mjs';
import {
  closenessTier,
  computeWarmthScore,
  warmthBand,
  warmthFor
} from '../../netlify/functions/_shared/warmth-score.mjs';
import { assemblePersonLedger } from '../../netlify/functions/_shared/person-ledger.mjs';
import {
  proposalEquivalenceHash,
  validateLinkProposalCreateInput
} from '../../netlify/functions/_shared/link-proposal-schema.mjs';

test('inferLinkProposals proposes mentee + task contact for Henry fixtures (D4)', () => {
  const proposals = inferLinkProposals(HENRY_INFERENCE_FIXTURES);
  const types = proposals.map((p) => `${p.proposed_link.relationship_type}:${p.proposed_link.role ?? ''}`);
  assert.ok(types.some((t) => t === 'contact:'));
  assert.ok(types.some((t) => t === 'professional_relationship:mentee'));
  assert.ok(types.some((t) => t === 'professional_relationship:colleague'));
  assert.ok(types.some((t) => t === 'collaborator:'));
  const mentee = proposals.find((p) => p.proposed_link.role === 'mentee');
  assert.match(mentee.reason, /Accreditation Mentor/);
  assert.match(mentee.reason, /from Project/);
});

test('declined equivalence hash is stable across identical proposed links', () => {
  const link = {
    source_ref: 'shared:person:person_self',
    target_ref: 'shared:person:person_henry',
    relationship_type: 'professional_relationship',
    role: 'mentee',
    context_key: null,
    context_ref: 'tasks:project:proj_accreditation',
    valid_from: null,
    occurred_at: null,
    metadata: { human_label: 'Accreditation Mentor' }
  };
  const a = proposalEquivalenceHash(link);
  const b = proposalEquivalenceHash({ ...link });
  assert.equal(a, b);
  const validated = validateLinkProposalCreateInput({
    proposed_link: link,
    reason: 'from Project: Accreditation Mentor',
    sources: [{ ref: 'tasks:project:proj_accreditation', excerpt: 'Accreditation Mentor' }],
    proposer: 'rules',
    person_ref: 'shared:person:person_henry'
  });
  assert.equal(validated.equivalence_hash, a);
});

test('warmthFor: Henry Inner tier; Bianca Former; ring equals score (V4/C2)', () => {
  const touchpoints = [{ type: 'meeting', at: '2026-09-20T00:00:00.000Z' }];
  const henry = warmthFor({
    touchpoints,
    relationships: [
      {
        link: {
          relationship_type: 'professional_relationship',
          role: 'mentee',
          status: 'current',
          valid_to: null
        }
      }
    ],
    personCreatedAt: '2026-09-01T00:00:00.000Z',
    now: '2026-09-26T00:00:00.000Z'
  });
  assert.equal(henry.tier, 'inner');
  assert.equal(closenessTier({ isMentorOrMentee: true }), 'inner');
  assert.equal(warmthBand(henry.warmth), henry.band);
  assert.equal(henry.warmth, computeWarmthScore(touchpoints, 'inner', '2026-09-26T00:00:00.000Z'));

  const bianca = warmthFor({
    touchpoints: [{ type: 'link_created', at: '2026-04-01T00:00:00.000Z' }],
    relationships: [
      {
        link: {
          relationship_type: 'professional_relationship',
          role: 'former_colleague',
          status: 'ended',
          valid_to: '2026-01-01'
        }
      }
    ],
    personCreatedAt: '2024-01-01T00:00:00.000Z',
    now: '2026-09-26T00:00:00.000Z'
  });
  assert.equal(bianca.tier, 'former');
});

test('assemblePersonLedger: Henry mentoring task under you_owe (P3)', () => {
  const ledger = assemblePersonLedger({
    person: { ref: 'shared:person:person_henry', display_name: 'Henry McLennan', aliases: ['Henry'] },
    linkedTasks: [
      {
        ref: 'tasks:task:task_mentor_meet',
        label: 'Set up mentoring meeting',
        status: 'open',
        href: null
      }
    ],
    waitingOnTasks: [
      {
        id: 'task_wait',
        ref: 'tasks:task:task_wait',
        title: 'Draft Standard 5 annotation',
        waiting_on: 'Henry McLennan',
        status: 'open'
      }
    ],
    storedItems: []
  });
  assert.equal(ledger.you_owe_count, 1);
  assert.equal(ledger.they_owe_count, 1);
  assert.equal(ledger.you_owe[0].text, 'Set up mentoring meeting');
  assert.equal(ledger.you_owe[0].source_label, 'task');
  assert.equal(ledger.they_owe[0].text, 'Draft Standard 5 annotation');
  assert.equal(ledger.open_item_count, 2);
});
