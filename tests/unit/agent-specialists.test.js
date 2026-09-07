/**
 * Phase 3 specialist kernel workflows. Pack-layer plus prompt Delivery.
 * Not a live conversational behaviour suite.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSystemPrompt } from '../../netlify/functions/_shared/persona.mjs';
import { agentKernelEnabled, planTurn, runAgentKernel } from '../../netlify/functions/_shared/agent-kernel.mjs';

const TODAY = '2026-08-20';
const NOW = new Date('2026-08-20T01:00:00.000Z');

const SARA = [
  "how's my health looking",
  'health timeline please',
  'is my weight change unusual lately',
  'any medical context I should know',
  'brief the clinic visit',
  'what do my bloods say',
  'appointment brief for today',
  'has this flare shown up before',
  'doctor visit recap',
  'body and medical check in',
  'gp notes from recent visits',
  'medication and weight together',
  'health overview',
  'is this symptom in the record',
  'medical timeline',
  'clinic history check',
  'what did the last visit cover',
  'unusual weight change',
  'health records recap',
  'walk me through recent medical'
];

const ANN = [
  "help me improve tomorrow's lesson",
  'diagnose this Year 10 class',
  'what is the hinge for tomorrow',
  'repair this teaching sequence',
  'lesson diagnosis please',
  'improve the next class',
  'curriculum check for this unit',
  'student lesson tomorrow',
  'teach this better tomorrow',
  "what's wrong with this lesson",
  'class context before I rewrite',
  'unit and lesson diagnosis',
  'pupil lesson needs a repair',
  'teaching check for tomorrow',
  'look at the upcoming lesson',
  'diagnose the Year 10 essay lesson',
  'improve teaching tomorrow',
  'lesson hinge analysis',
  'help me teach this class',
  "tomorrow's lesson diagnosis"
];

const CLEMENTINE = [
  'what do I already know about cognitive load',
  'search the archive for this topic',
  'what notes do I already have',
  'knowledge research on working memory',
  'synthesise the archive on this',
  'what is already in the corpus',
  'research what I already wrote',
  'notes about load-bearing ideas',
  'archive lookup please',
  'what do I know about this topic',
  'knowledge synthesis of these notes',
  'already-have research on this',
  'pull the notes I already filed',
  'corpus search for this topic',
  'what does the archive say',
  'research my existing notes',
  'knowledge check on this topic',
  'notes I already have about this',
  'synthesise what I already know',
  'archive research please'
];

const BRISKET = [
  'how am I eating lately',
  'nutrition adherence this week',
  'did I log my meals',
  'protein looking okay',
  'what is left in the day macros',
  'calories today',
  'food intake recap',
  'am I hitting nutrition',
  'meal logging check',
  'diet adherence please',
  'how is eating going',
  'macros remaining today',
  'have I eaten enough protein',
  'nutrition overview',
  'logged meals this week',
  'intake completeness',
  'what did I eat today',
  'food logging picture',
  'am I on the diet',
  'eating recap'
];

const HYALURONICA = [
  'is my routine helping',
  'skincare adherence check',
  'is this product doing anything',
  'breakout after the new cream',
  'routine response lately',
  'treatment helping or not',
  'skin flare since the serum',
  'skincare history please',
  'is the routine working',
  'product response evidence',
  'skin looking better',
  'help from this treatment',
  'cream helping the flare',
  'routine check in',
  'skincare logs this month',
  'is my skin improving',
  'serum response',
  'breakout pattern vs routine',
  'helping my skin or not',
  'treatment history'
];

const PENELOPE = [
  'feeling like this often',
  'diary pattern check',
  'has this mood recurred',
  'journal recurrence please',
  'I felt this last month too',
  'often feeling flat',
  'diary search for this feeling',
  'is this a recurring mood',
  'pattern in the journal',
  'how often does this show up',
  'diary history of this feeling',
  'recurrence in my diary',
  'felt like this before',
  'mood pattern lately',
  'journal check for this',
  'does this feeling recur',
  'diary themes around this',
  'often in the diary',
  'pattern of feeling this',
  'search the diary for this'
];

const VERA = [
  'what patterns across sessions',
  'mind session reflection',
  'longitudinal therapy check',
  'compare recent sessions',
  'reflect on the last sessions',
  'mind pattern across weeks',
  'session history please',
  'therapy reflection',
  'what do the sessions show',
  'across these mind sessions',
  'longitudinal mind check',
  'session compare',
  'reflect on session notes',
  'pattern in therapy sessions',
  'mind sessions lately',
  'what came up across sessions',
  'therapy pattern check',
  'session reflection please',
  'compare mind sessions',
  'longitudinal reflection'
];

function hitRate(slug, messages, workflow) {
  const hits = messages.filter(message => planTurn({ slug, message }).plan.workflow === workflow);
  return hits.length / messages.length;
}

test('Phase 3 specialists are kernel-enabled; Hammond is not', () => {
  for (const slug of ['sara', 'ann', 'clementine', 'brisket', 'hyaluronica', 'penelope', 'vera']) {
    assert.equal(agentKernelEnabled({ slug, flag: true }), true, slug);
  }
  assert.equal(agentKernelEnabled({ slug: 'hammond', flag: true }), false);
});

test('specialist paraphrases select the named workflow (≥95% of 20)', () => {
  const rows = [
    ['sara', SARA, 'health_timeline'],
    ['ann', ANN, 'lesson_diagnosis'],
    ['clementine', CLEMENTINE, 'knowledge_research'],
    ['brisket', BRISKET, 'nutrition_adherence'],
    ['hyaluronica', HYALURONICA, 'routine_response'],
    ['penelope', PENELOPE, 'diary_recurrence'],
    ['vera', VERA, 'mind_reflection']
  ];
  for (const [slug, messages, workflow] of rows) {
    assert.equal(messages.length, 20, slug);
    const rate = hitRate(slug, messages, workflow);
    assert.ok(rate >= 0.95, `${slug} ${workflow} only ${Math.round(rate * 20)}/20`);
  }
});

test('greetings stay workflow none for specialists', () => {
  for (const slug of ['sara', 'ann', 'clementine', 'brisket', 'hyaluronica', 'penelope', 'vera']) {
    assert.equal(planTurn({ slug, message: 'hey' }).plan.workflow, 'none');
  }
});

test('Sara Delivery: weight conflict and missing visits reach the prompt', () => {
  const kernel = runAgentKernel({
    slug: 'sara',
    message: 'is my weight change unusual lately',
    today: TODAY,
    now: NOW,
    stores: {
      composition: [
        { date: '2026-08-15', weight_kg: 95 },
        { date: '2026-08-14', weight_kg: 86 }
      ],
      measurements: [],
      medicalEvents: []
    }
  });
  assert.equal(kernel.plan.workflow, 'health_timeline');
  assert.ok(kernel.limitations.some(item => item.kind === 'conflict' || item.text.includes('No matching medical')));
  const prompt = buildSystemPrompt({
    slug: 'sara',
    evidencePackBlock: kernel.promptBlock,
    kernelBlock: kernel.interpretationBlock
  });
  assert.match(prompt, /Do not treat them as one clean trend|Do not invent an appointment/);
});

test('Ann Delivery: missing lesson does not invent a class', () => {
  const kernel = runAgentKernel({
    slug: 'ann',
    message: "help me improve tomorrow's lesson",
    today: TODAY,
    now: NOW,
    stores: { classes: [], lessons: [], units: [] }
  });
  assert.ok(kernel.limitations.some(item => item.kind === 'missing'));
  assert.match(kernel.interpretationBlock, /Do not invent a class/);
});

test('Clementine Delivery: empty archive does not invent a page', () => {
  const kernel = runAgentKernel({
    slug: 'clementine',
    message: 'what do I already know about cognitive load',
    today: TODAY,
    now: NOW,
    stores: { pages: [] }
  });
  assert.match(kernel.interpretationBlock, /Do not invent a page/);
});

test('Brisket Delivery: no meals today is fail-visible', () => {
  const kernel = runAgentKernel({
    slug: 'brisket',
    message: 'how am I eating lately',
    today: TODAY,
    now: NOW,
    stores: { meals: [] }
  });
  assert.ok(kernel.limitations.some(item => item.text.includes('No meals logged today')));
  assert.match(kernel.interpretationBlock, /Do not claim adherence/);
});

test('Hyaluronica Delivery: empty routine window cannot claim help', () => {
  const kernel = runAgentKernel({
    slug: 'hyaluronica',
    message: 'is my routine helping',
    today: TODAY,
    now: NOW,
    stores: { skincare: [] }
  });
  assert.match(kernel.interpretationBlock, /Do not claim the routine is helping/);
});

test('Penelope Delivery: no diary hits does not invent recurrence', () => {
  const kernel = runAgentKernel({
    slug: 'penelope',
    message: 'feeling like this often',
    today: TODAY,
    now: NOW,
    stores: { mindEvents: [] }
  });
  assert.match(kernel.interpretationBlock, /Do not invent a recurring feeling/);
});

test('Vera Delivery: no sessions does not invent a longitudinal pattern', () => {
  const kernel = runAgentKernel({
    slug: 'vera',
    message: 'what patterns across sessions',
    today: TODAY,
    now: NOW,
    stores: { mindEvents: [] }
  });
  assert.match(kernel.interpretationBlock, /Do not invent a longitudinal pattern/);
});

test('Ann with a stored lesson names that lesson', () => {
  const kernel = runAgentKernel({
    slug: 'ann',
    message: 'diagnose the Year 10 essay lesson',
    today: TODAY,
    now: NOW,
    stores: {
      classes: [{ id: 'c1', code: '10ENG', display_name: 'Year 10 English' }],
      lessons: [{ id: 'l1', title: 'Year 10 essay', date: TODAY, class_id: 'c1' }],
      units: [{ id: 'u1', title: 'Essay unit', class_id: 'c1' }]
    }
  });
  assert.match(kernel.promptBlock, /Year 10 essay/);
  assert.match(kernel.interpretationBlock, /Diagnose that lesson/);
});
