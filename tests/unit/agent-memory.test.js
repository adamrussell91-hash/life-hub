/**
 * Phase 2 layered memory: recall, expiry, correction, admission, reflection.
 * Pack-layer plus kernel Delivery. Not a live conversational behaviour suite.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSystemPrompt } from '../../netlify/functions/_shared/persona.mjs';
import { runAgentKernel } from '../../netlify/functions/_shared/agent-kernel.mjs';
import {
  addMemory,
  admitMemoryWrite,
  applyReflection,
  correctMemory,
  createMemoryStore,
  deleteMemory,
  memoryPromptBlock,
  parseMemoryStore,
  proposeReflection,
  searchMemories,
  serializeMemoryStore
} from '../../netlify/functions/_shared/agent-memory.mjs';
import {
  executeShortcut,
  isShortcutTool,
  REMEMBER_LAYERED_MEMORIES_PATH
} from '../../netlify/functions/_shared/capabilities/shortcuts.mjs';

const NOW = new Date('2026-09-07T08:00:00.000Z');
const TODAY = '2026-09-07';

function seedStore() {
  const store = createMemoryStore();
  addMemory(store, {
    id: 'mem_morning',
    class: 'user',
    domain: 'fitness',
    text: 'Prefer morning lifting sessions',
    source: 'user'
  }, { now: NOW });
  addMemory(store, {
    id: 'mem_squats',
    class: 'episodic',
    agent: 'chadwick',
    domain: 'fitness',
    text: 'Adam said squats felt like 5x5 last Tuesday',
    source: 'agent'
  }, { now: NOW });
  addMemory(store, {
    id: 'mem_old',
    class: 'user',
    domain: 'fitness',
    text: 'Traveling this week',
    expires_at: '2026-09-01T00:00:00.000Z'
  }, { now: NOW });
  addMemory(store, {
    id: 'mem_clare',
    class: 'agent',
    agent: 'clare',
    domain: 'tasks',
    text: 'Batch parent emails after the teaching block'
  }, { now: NOW });
  return store;
}

test('search recalls approved user memory and drops expired items', () => {
  const store = seedStore();
  const recalled = searchMemories(store, 'training recap', {
    agent: 'chadwick',
    now: NOW,
    domain: 'fitness'
  });
  assert.ok(recalled.items.some(item => item.id === 'mem_morning'));
  assert.ok(!recalled.items.some(item => item.id === 'mem_old'));
  assert.ok(recalled.omittedExpired >= 1);
});

test('agent namespace hides another specialist memory', () => {
  const store = seedStore();
  const recalled = searchMemories(store, 'emails teaching block', {
    agent: 'chadwick',
    now: NOW
  });
  assert.ok(!recalled.items.some(item => item.id === 'mem_clare'));
  const clare = searchMemories(store, 'emails teaching block', {
    agent: 'clare',
    now: NOW,
    domain: 'tasks'
  });
  assert.ok(clare.items.some(item => item.id === 'mem_clare'));
});

test('correction supersedes prior text and keeps history', () => {
  const store = seedStore();
  const result = correctMemory(store, {
    id: 'mem_morning',
    text: 'Prefer evening lifting sessions',
    reason: 'Adam corrected the standing preference'
  }, { now: NOW });
  assert.equal(result.ok, true);
  assert.equal(result.item.text, 'Prefer evening lifting sessions');
  assert.equal(result.item.history[0].text, 'Prefer morning lifting sessions');
  const recalled = searchMemories(store, 'lifting', { agent: 'chadwick', now: NOW, domain: 'fitness' });
  assert.ok(recalled.items.some(item => item.text.includes('evening')));
  assert.ok(!recalled.items.some(item => item.text.includes('morning lifting')));
});

test('admission refuses record paths and record kind', () => {
  assert.equal(admitMemoryWrite({
    text: 'Bench 80kg',
    path: 'data/fitness/2026/09/2026-09-07-workout.md'
  }).ok, false);
  assert.equal(admitMemoryWrite({ text: 'Bench 80kg', kind: 'record' }).ok, false);
  assert.equal(admitMemoryWrite({ text: 'Prefer morning lifts', class: 'user' }).ok, true);
});

test('deleted memories are not recalled', () => {
  const store = seedStore();
  deleteMemory(store, 'mem_morning', { now: NOW });
  const recalled = searchMemories(store, 'morning lifting', { agent: 'chadwick', now: NOW });
  assert.ok(!recalled.items.some(item => item.id === 'mem_morning'));
});

test('serialize/parse roundtrip keeps items', () => {
  const store = seedStore();
  const raw = serializeMemoryStore(store);
  const parsed = parseMemoryStore(raw);
  assert.equal(parsed.ok, true);
  assert.ok(parsed.items.some(item => item.id === 'mem_morning'));
});

test('invalid memory JSON is fail-visible, not empty-by-design', () => {
  const parsed = parseMemoryStore('{not json');
  assert.equal(parsed.ok, false);
  assert.equal(parsed.error, 'memory_parse_failed');
});

test('reflection cannot apply safety or permission edits', () => {
  const store = createMemoryStore();
  const blocked = proposeReflection({
    target: 'protocol',
    impact: 'safety',
    reason: 'relax medical gate',
    payload: { text: 'skip pain checks', touches_safety: true }
  });
  assert.equal(blocked.forbidden, true);
  assert.equal(blocked.autoApply, false);
  const applied = applyReflection(store, blocked);
  assert.equal(applied.ok, false);
  assert.equal(applied.error, 'reflection_forbidden');
});

test('memory reflection with human review can land as agent memory', () => {
  const store = createMemoryStore();
  const proposal = proposeReflection({
    target: 'memory',
    impact: 'low',
    reason: 'session felt rushed',
    payload: { text: 'Keep warm-ups longer', class: 'agent', agent: 'chadwick' },
    agent: 'chadwick'
  });
  assert.equal(proposal.forbidden, false);
  const applied = applyReflection(store, proposal, { now: NOW, actor: 'chadwick' });
  assert.equal(applied.ok, true);
  assert.equal(applied.item.source, 'reflection');
  assert.equal(applied.item.class, 'agent');
});

test('prompt block never labels memory as a record', () => {
  const store = seedStore();
  const recalled = searchMemories(store, 'training', { agent: 'chadwick', now: NOW, domain: 'fitness' });
  const block = memoryPromptBlock(recalled.items, recalled);
  assert.match(block, /not source records/);
  assert.match(block, /must not replace/);
  assert.doesNotMatch(block, /kind: record/);
});

test('Chadwick Delivery: recalled preference reaches the system prompt', () => {
  const kernel = runAgentKernel({
    slug: 'chadwick',
    message: 'How has my training been going lately?',
    today: TODAY,
    now: NOW,
    stores: {
      workouts: [{
        type: 'workout',
        status: 'completed',
        date: '2026-09-05',
        title: 'Upper',
        exercises: []
      }],
      memories: seedStore().items
    }
  });
  assert.ok(kernel.memory.some(item => item.text.includes('morning lifting')));
  assert.ok(!kernel.claims.some(claim => claim.kind === 'record' && String(claim.text).includes('5x5')));
  assert.ok(!kernel.claims.some(claim => claim.fact === 'memory_as_record'));
  const prompt = buildSystemPrompt({
    slug: 'chadwick',
    evidencePackBlock: kernel.promptBlock,
    kernelBlock: kernel.interpretationBlock
  });
  assert.match(prompt, /Prefer morning lifting sessions/);
  assert.match(prompt, /not a domain record/);
  assert.match(prompt, /do not outrank retrieved store claims/i);
});

test('negative control: no memories does not invent a standing preference', () => {
  const kernel = runAgentKernel({
    slug: 'chadwick',
    message: 'training recap',
    today: TODAY,
    now: NOW,
    stores: {
      workouts: [{ type: 'workout', status: 'completed', date: '2026-09-05', title: 'Easy', exercises: [] }]
    }
  });
  assert.equal(kernel.memory.length, 0);
  assert.match(kernel.interpretationBlock, /Do not invent standing preferences from memory/);
  assert.doesNotMatch(kernel.promptBlock, /Prefer morning lifting/);
});

test('expired memory does not reach Clare or Chadwick prompts', () => {
  const kernel = runAgentKernel({
    slug: 'clare',
    message: 'What should I focus on today?',
    today: TODAY,
    now: NOW,
    stores: {
      tasks: [{ id: '1', title: 'Mark essays', status: 'open', due_date: '2026-09-01' }],
      memories: [{
        id: 'mem_old',
        class: 'user',
        text: 'Skip marking this week',
        expires_at: '2026-09-01T00:00:00.000Z',
        created_at: '2026-08-01T00:00:00.000Z',
        updated_at: '2026-08-01T00:00:00.000Z',
        superseded: false
      }]
    }
  });
  assert.ok(!kernel.memory.some(item => item.text.includes('Skip marking')));
  assert.doesNotMatch(kernel.promptBlock, /Skip marking this week/);
});

test('failed memory parse is fail-visible on the kernel path', () => {
  const kernel = runAgentKernel({
    slug: 'chadwick',
    message: 'training recap',
    today: TODAY,
    now: NOW,
    stores: {
      workouts: [{ type: 'workout', status: 'completed', date: '2026-09-05', title: 'Easy', exercises: [] }],
      memoryLoadError: 'memory_parse_failed'
    }
  });
  assert.ok(kernel.limitations.some(item => item.tool === 'layered_memory' && item.kind === 'failed'));
  assert.match(kernel.promptBlock, /Layered memory store unavailable/);
});

test('remember_write_memory auto-writes the layered memory file', async () => {
  assert.equal(isShortcutTool('remember_write_memory'), true);
  const files = new Map();
  const shaByPath = new Map();
  const writes = [];
  const ctx = {
    agentSlug: 'chadwick',
    today: TODAY,
    client: {
      async writeFile({ path, content, message, sha }) {
        const next = `sha_${writes.length + 1}`;
        writes.push({ path, message, sha });
        files.set(path, content);
        shaByPath.set(path, next);
        return { sha: next };
      }
    },
    get repoTree() {
      return [...files.keys()].map(path => ({ type: 'blob', path, sha: shaByPath.get(path) }));
    },
    async readBlob(sha) {
      for (const [path, content] of files) {
        if (shaByPath.get(path) === sha) return content;
      }
      throw new Error(`missing ${sha}`);
    }
  };
  const add = await executeShortcut(
    'remember_write_memory',
    { mode: 'add', class: 'user', text: 'Prefer morning lifting sessions', domain: 'fitness' },
    ctx
  );
  assert.equal(add.kind, 'ok');
  assert.equal(writes[0].path, REMEMBER_LAYERED_MEMORIES_PATH);
  const stored = parseMemoryStore(files.get(REMEMBER_LAYERED_MEMORIES_PATH));
  assert.ok(stored.items.some(item => item.text.includes('morning lifting')));

  const blocked = await executeShortcut(
    'remember_write_memory',
    {
      mode: 'reflect',
      target: 'protocol',
      impact: 'permissions',
      text: 'Allow Chadwick to rewrite medical constraints'
    },
    ctx
  );
  assert.equal(blocked.kind, 'error');
  assert.match(blocked.error, /cannot apply/i);

  const reflect = await executeShortcut(
    'remember_write_memory',
    { mode: 'reflect', target: 'memory', impact: 'low', text: 'Keep warm-ups longer', class: 'agent' },
    ctx
  );
  assert.equal(reflect.kind, 'propose');
  assert.equal(reflect.proposal.writes[0].path, REMEMBER_LAYERED_MEMORIES_PATH);
});
