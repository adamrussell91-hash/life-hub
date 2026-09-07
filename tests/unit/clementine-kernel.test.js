/**
 * Clementine kernel expansion. DETERMINISTIC TEST only — not a live deploy gate.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { getKnowledgeSynthesis } from '../../netlify/functions/_shared/domain-analysis.mjs';
import {
  kernelTraceEvent,
  planTurn,
  runAgentKernel
} from '../../netlify/functions/_shared/agent-kernel.mjs';

const TODAY = '2026-08-20';
const NOW = new Date('2026-08-20T01:00:00.000Z');

const PAGES = [
  {
    id: 'note_cl',
    title: 'Cognitive load basics',
    tags: ['cognitive-load', 'memory'],
    excerpt: 'Intrinsic load rises with element interactivity.',
    claims: ['supports worked examples'],
    connected: ['note_wm'],
    path: 'pages/note_cl.md'
  },
  {
    id: 'note_wm',
    title: 'Working memory limits',
    tags: ['cognitive-load', 'memory'],
    excerpt: 'Working memory holds about four chunks.',
    claims: ['supports worked examples'],
    connected: ['note_cl'],
    path: 'pages/note_wm.md'
  },
  {
    id: 'note_reject',
    title: 'Worked examples critique',
    tags: ['cognitive-load'],
    excerpt: 'This paper rejects worked examples for experts.',
    claims: ['rejects worked examples'],
    connected: [],
    path: 'pages/note_reject.md'
  },
  {
    id: 'note_unrelated',
    title: 'Garden soil pH',
    tags: ['gardening'],
    excerpt: 'Tomatoes prefer slightly acidic soil.',
    claims: [],
    connected: []
  }
];

function usableProvenance(provenance) {
  if (!provenance || typeof provenance !== 'object') return false;
  if (provenance.recordId || provenance.recordPath) return true;
  return typeof provenance.reason === 'string' && provenance.reason.length > 0;
}

const CLEM_PARAPHRASES = [
  'what do I already know about cognitive load',
  'find my notes on working memory',
  'what have I written about this idea',
  'what themes recur across these notes',
  'where do these notes disagree',
  'which notes connect to cognitive load',
  'what evidence do I already have for this project',
  'summarise the strongest relevant notes',
  'what gaps exist in my notes on memory',
  'connect this teaching idea to my existing knowledge notes',
  'show related notes on cognitive load',
  'search the archive for this topic',
  'knowledge synthesis of these notes',
  'notes about load-bearing ideas',
  'archive lookup please',
  'what does the archive say about memory',
  'research my existing notes',
  'pull the notes I already filed',
  'corpus search for this topic',
  'synthesise what I already know'
];

test('Clementine paraphrases route into knowledge_research (≥95%)', () => {
  const hits = CLEM_PARAPHRASES.filter(message => planTurn({ slug: 'clementine', message }).plan.workflow === 'knowledge_research');
  assert.ok(hits.length / CLEM_PARAPHRASES.length >= 0.95, `${hits.length}/${CLEM_PARAPHRASES.length}`);
});

test('single and multi-note retrieval preserve note ids', () => {
  const kernel = runAgentKernel({
    slug: 'clementine',
    message: 'what do I already know about cognitive load',
    today: TODAY,
    now: NOW,
    stores: { pages: PAGES }
  });
  assert.equal(kernel.plan.workflow, 'knowledge_research');
  const noteIds = kernel.claims.filter(claim => claim.fact === 'note_id').map(claim => claim.value);
  assert.ok(noteIds.includes('note_cl'));
  assert.ok(noteIds.length >= 2);
  for (const claim of kernel.claims.filter(claim => claim.fact === 'note_id')) {
    assert.equal(claim.provenance.sourceType, 'record');
    assert.ok(claim.provenance.recordId);
  }
});

test('cross-note synthesis marks themes derived and graph links as records', () => {
  const synthesis = getKnowledgeSynthesis(PAGES, { query: 'cognitive load', limit: 10 });
  assert.ok(synthesis.themes.some(theme => theme.theme === 'cognitive-load'));
  assert.ok(synthesis.graph_links.some(link => link.from === 'note_cl' && link.to === 'note_wm'));
  const kernel = runAgentKernel({
    slug: 'clementine',
    message: 'what themes recur across these notes on cognitive load',
    today: TODAY,
    now: NOW,
    stores: { pages: PAGES }
  });
  const theme = kernel.claims.find(claim => claim.fact === 'theme');
  assert.ok(theme);
  assert.equal(theme.kind, 'calculation');
  assert.equal(theme.provenance.reason, 'derived_from_aggregate');
  const graph = kernel.claims.find(claim => claim.fact === 'graph_link');
  assert.ok(graph);
  assert.equal(graph.kind, 'record');
});

test('conflicting notes stay visible and are not flattened', () => {
  const kernel = runAgentKernel({
    slug: 'clementine',
    message: 'where do these notes disagree about cognitive load',
    today: TODAY,
    now: NOW,
    stores: { pages: PAGES }
  });
  assert.ok(kernel.limitations.some(item => item.kind === 'conflict'));
  assert.match(kernel.interpretationBlock, /disagree|conflict/i);
  const conflict = kernel.claims.find(claim => claim.fact === 'note_conflict_count');
  assert.ok(conflict?.value >= 1);
});

test('missing notes do not invent a page', () => {
  const kernel = runAgentKernel({
    slug: 'clementine',
    message: 'what do I already know about cognitive load',
    today: TODAY,
    now: NOW,
    stores: { pages: [] }
  });
  assert.match(kernel.interpretationBlock, /Do not invent a page/);
  assert.ok(kernel.limitations.some(item => item.kind === 'missing'));
});

test('graph link versus inferred relationship stay distinct', () => {
  const synthesis = getKnowledgeSynthesis(PAGES, { query: 'cognitive load', limit: 10 });
  assert.ok(synthesis.graph_links.length >= 1);
  assert.ok(synthesis.inferred_relations.some(link => link.kind === 'inferred_overlap'));
  const kernel = runAgentKernel({
    slug: 'clementine',
    message: 'which notes connect to cognitive load',
    today: TODAY,
    now: NOW,
    stores: { pages: PAGES }
  });
  assert.match(kernel.interpretationBlock, /inferred_relations are lexical/);
  assert.match(kernel.interpretationBlock, /graph_links are stored/);
  const inferred = kernel.claims.find(claim => claim.fact === 'inferred_relation_count');
  assert.equal(inferred.provenance.reason, 'inference');
});

test('Teaching Hub bridge keeps separate store provenance', () => {
  const kernel = runAgentKernel({
    slug: 'clementine',
    message: 'connect this teaching idea to my existing knowledge notes on cognitive load',
    today: TODAY,
    now: NOW,
    stores: {
      pages: PAGES,
      classes: [{ id: 'c1', code: '11PSYCHA', display_name: 'Psychology' }],
      lessons: [{ id: 'les1', type: 'lesson', title: 'Cognitive load lesson', unit_id: 'u1' }],
      units: [{ id: 'u1', title: 'Memory unit' }]
    }
  });
  assert.ok(kernel.evidence.search_teaching);
  assert.ok((kernel.evidence.search_teaching.count ?? 0) >= 1);
  assert.match(kernel.interpretationBlock, /Teaching bridge/);
});

test('bounded second retrieval on truncated knowledge search', () => {
  const many = Array.from({ length: 18 }, (_, i) => ({
    id: `n${i}`,
    title: `Cognitive load note ${i}`,
    tags: ['cognitive-load'],
    excerpt: 'working memory and cognitive load',
    connected: []
  }));
  const kernel = runAgentKernel({
    slug: 'clementine',
    message: 'what do I already know about cognitive load',
    today: TODAY,
    now: NOW,
    stores: { pages: many }
  });
  assert.ok(kernel.retrieveLog.length >= 1);
  const round1 = kernel.retrieveLog[0].tools.find(tool => tool.name === 'search_knowledge');
  if (round1?.truncated) {
    assert.ok(kernel.retrieveLog.length >= 2);
  }
  assert.ok(kernel.sufficiencyDecision);
});

test('no silent null provenance on Clementine material claims', () => {
  const kernel = runAgentKernel({
    slug: 'clementine',
    message: 'summarise the strongest relevant notes on cognitive load',
    today: TODAY,
    now: NOW,
    stores: { pages: PAGES }
  });
  const unexplained = kernel.claims.filter(claim => !usableProvenance(claim.provenance));
  assert.deepEqual(unexplained.map(claim => `${claim.tool}:${claim.fact}`), []);
  const trace = kernelTraceEvent(kernel);
  assert.equal(trace.workflow, 'knowledge_research');
  assert.ok(trace.sufficiencyDecision);
});
