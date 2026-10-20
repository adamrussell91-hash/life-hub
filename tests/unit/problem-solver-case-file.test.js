// tests/unit/problem-solver-case-file.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { caseFileOffer, composeCaseFile, hashText, sectionDigests } from '../../packages/problem-solver/case-file.mjs';

const NAME = 'Kitchen rota case file 20261020 v1 Final';
const node = (slot, text) => ({ id: `n-${slot}`, slot, text, title: slot, state: 'accepted' });
const run = (id, tool, nodes, status = 'done') => ({ id, tool, status, nodes, edges: [] });
const fiveCs = (extra = []) => run('r5', 'five_cs', [
  node('contextualise', 'So next term starts without the same scramble'),
  node('categorise', 'On the Kitchen rota project page'),
  node('condense:1', 'Publish on Wednesday'),
  node('correct', 'Nothing needs correcting'),
  node('correspond', NAME),
  ...extra
]);

function session(extra = {}) {
  return {
    title: 'Late rota',
    status: 'active',
    model: { id: 'seven_step' },
    phase: 'document',
    frame: { goal: 'Rota fixed a week ahead', whatIsTrue: 'Changed 3 of 4 weeks' },
    steps: {
      decide: { runs: [run('rd', 'swot', [node('choice', 'Move publish day to Wednesday')])], status: 'done', objection: null },
      improve: { runs: [run('ra', 'after_action_review', [node('learned', 'One person signing off is a weak point')]), run('rl', 'double_loop', [node('strategy:1', 'Two people can sign off')])], status: 'done', objection: null },
      document: { runs: [fiveCs()], status: 'open', objection: null }
    },
    learnings: [{ step: 'decide', text: 'I decide faster with a matrix', at: 't' }],
    proposedTasks: [{ id: 'p1', title: 'Draft rota', status: 'confirmed', taskId: 't1' }, { id: 'p2', title: 'Idea', status: 'proposed' }],
    reviewState: null,
    caseFile: null,
    caseFileDeclined: null,
    ...extra
  };
}

test('compose: the name, the version from the name and every non-empty section in order', () => {
  const file = composeCaseFile(session());
  assert.equal(file.title, NAME);
  assert.equal(file.version, 1);
  assert.deepEqual(file.sections.map((s) => s.key), ['purpose', 'problem', 'decision', 'actions', 'kept', 'learned', 'corrections', 'filed', 'learnings']);
  assert.deepEqual(file.sections.find((s) => s.key === 'learned').lines, ['One person signing off is a weak point', 'New strategy: Two people can sign off']);
  assert.deepEqual(file.sections.find((s) => s.key === 'actions').lines, ['Draft rota'], 'only confirmed tasks');
  assert.deepEqual(file.sections.find((s) => s.key === 'learnings').lines, ['Decide: I decide faster with a matrix']);
});

test('compose: null until a 5 Cs run is complete; knowledge management adds its section', () => {
  const s = session();
  assert.equal(composeCaseFile({ ...s, steps: { ...s.steps, document: { ...s.steps.document, runs: [run('r5', 'five_cs', [node('contextualise', 'x')], 'active')] } } }), null);
  const km = run('rk', 'knowledge_management', [node('consider', 'c'), node('explicit:1', 'The checklist on the project page'), node('tacit:1', 'Show the new manager once'), node('review', 'Each January')]);
  const file = composeCaseFile({ ...s, steps: { ...s.steps, document: { ...s.steps.document, runs: [fiveCs(), km] } } });
  assert.deepEqual(file.sections.find((x) => x.key === 'knowledge').lines, ['Written down: The checklist on the project page', 'Know-how: Show the new manager once', 'Review: Each January']);
});

test('digests are stable eight-character hashes per section', () => {
  const file = composeCaseFile(session());
  const a = sectionDigests(file);
  assert.deepEqual(a, sectionDigests(composeCaseFile(session())));
  assert.ok(Object.values(a).every((d) => /^[0-9a-f]{8}$/.test(d)));
  assert.notEqual(hashText('a'), hashText('b'));
});

test('offer: write first, every section, at the version in the name', () => {
  const offer = caseFileOffer(session());
  assert.equal(offer.kind, 'write');
  assert.equal(offer.version, 1);
  assert.equal(offer.changed.length, offer.file.sections.length);
  assert.match(offer.key, /^[0-9a-f]{8}$/);
});

test('offer: held before Document, while a Document tool is part-done, during a review, and after Not now', () => {
  const s = session();
  assert.equal(caseFileOffer({ ...s, steps: { decide: s.steps.decide } }), null);
  const partKm = run('rk', 'knowledge_management', [node('consider', 'c')], 'active');
  assert.equal(caseFileOffer({ ...s, steps: { ...s.steps, document: { ...s.steps.document, runs: [fiveCs(), partKm] } } }), null);
  assert.equal(caseFileOffer({ ...s, reviewState: { status: 'reviewing' } }), null);
  assert.equal(caseFileOffer({ ...s, caseFileDeclined: caseFileOffer(s).key }), null);
  assert.equal(caseFileOffer({ ...s, status: 'archived' }), null);
});

test('offer: after a write, only a changed section other than the learnings offers an update', () => {
  const s = session();
  const written = { ...s, caseFile: { title: NAME, version: 1, target: { kind: 'project', id: 'p' }, writtenAt: 't', sections: caseFileOffer(s).digests, history: [] } };
  assert.equal(caseFileOffer(written), null);
  assert.equal(caseFileOffer({ ...written, learnings: [...s.learnings, { step: 'document', text: 'Naming it took longest', at: 't' }] }), null);
  const later = { ...written, steps: { ...s.steps, improve: { ...s.steps.improve, runs: [...s.steps.improve.runs, run('ra2', 'after_action_review', [node('learned', 'The Wednesday rota held for a month')])] } } };
  const offer = caseFileOffer(later);
  assert.equal(offer.kind, 'update');
  assert.equal(offer.version, 2);
  assert.deepEqual(offer.changed, ['learned']);
});
