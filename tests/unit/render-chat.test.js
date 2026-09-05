import test from 'node:test';
import assert from 'node:assert/strict';
import { appendMessage, appendRecordProposal, appendCnPatchProposal, appendActionProposal, renderChatMarkdown, renderInlineMarkdown } from '../../apps/life/js/app/render-chat.js';

class FakeElement {
  constructor(tag) {
    this.tagName = tag;
    this.className = '';
    this.dataset = {};
    this.textContent = '';
    this.hidden = false;
    this.children = [];
    this.parent = null;
    this.scrollTop = 0;
    this.scrollHeight = 0;
    this.attributes = new Map();
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  append(...nodes) {
    for (const node of nodes) {
      this.children.push(node);
      node.parent = this;
    }
  }

  replaceChildren(...nodes) {
    for (const child of this.children) child.parent = null;
    this.children = nodes;
    for (const node of nodes) node.parent = this;
  }
}

class FakeDocument {
  constructor() {
    this.elements = new Map([['#chat-messages', new FakeElement('ul')]]);
  }

  querySelector(selector) {
    return this.elements.get(selector) ?? null;
  }

  createElement(tag) {
    return new FakeElement(tag);
  }

  querySelectorAll() {
    return [];
  }
}

test('renderInlineMarkdown renders **bold** segments as strong elements and the rest as plain spans', () => {
  const root = new FakeDocument();
  const bubble = root.createElement('li');
  renderInlineMarkdown(root, bubble, 'Now **452 calories**, buddy.');

  assert.equal(bubble.children.length, 3);
  assert.equal(bubble.children[0].tagName, 'span');
  assert.equal(bubble.children[0].textContent, 'Now ');
  assert.equal(bubble.children[1].tagName, 'strong');
  assert.equal(bubble.children[1].textContent, '452 calories');
  assert.equal(bubble.children[2].tagName, 'span');
  assert.equal(bubble.children[2].textContent, ', buddy.');
});

test('renderInlineMarkdown re-renders cleanly on repeated calls (streaming updates)', () => {
  const root = new FakeDocument();
  const bubble = root.createElement('li');
  renderInlineMarkdown(root, bubble, 'Now **45');
  renderInlineMarkdown(root, bubble, 'Now **452 calories**.');

  assert.equal(bubble.children.length, 3);
  assert.equal(bubble.children[1].tagName, 'strong');
  assert.equal(bubble.children[1].textContent, '452 calories');
  assert.equal(bubble.children[2].textContent, '.');
});

test('renderInlineMarkdown treats plain text with no markers as a single span', () => {
  const root = new FakeDocument();
  const bubble = root.createElement('li');
  renderInlineMarkdown(root, bubble, 'Just plain text here.');

  assert.equal(bubble.children.length, 1);
  assert.equal(bubble.children[0].tagName, 'span');
  assert.equal(bubble.children[0].textContent, 'Just plain text here.');
});

test('appendMessage still sets plain textContent for simple system-style bubbles', () => {
  const root = new FakeDocument();
  const item = appendMessage(root, { role: 'assistant', text: '🔍 Searched the web: pizza' });
  const body = item.children.find(child => child.className === 'chat-message__body');
  assert.equal(body.textContent, '🔍 Searched the web: pizza');
  assert.match(item.className, /chat-message chat-message--assistant/);
  assert.match(item.className, /chat-message--latest/);
});

test('renderInlineMarkdown turns headings, quotes, and fenced code into structured blocks', () => {
  const root = new FakeDocument();
  const container = root.createElement('div');
  renderInlineMarkdown(root, container, '# Title\n> quoted\n```js\nconst x = 1;\n```', { multiline: true });

  assert.equal(container.children[0].tagName, 'h3');
  assert.equal(container.children[0].children[0].textContent, 'Title');
  assert.equal(container.children[1].tagName, 'blockquote');
  assert.equal(container.children[1].children[0].textContent, 'quoted');
  assert.equal(container.children[2].tagName, 'pre');
  assert.equal(container.children[2].children[0].textContent, 'const x = 1;');
});

test('renderInlineMarkdown groups consecutive "- " lines into a single bulleted list', () => {
  const root = new FakeDocument();
  const container = root.createElement('div');
  renderInlineMarkdown(root, container, 'Notes:\n- First point\n- Second point with **bold**', { multiline: true });

  assert.equal(container.children.length, 2);
  const [paragraph, list] = container.children;
  assert.equal(paragraph.tagName, 'p');
  assert.equal(paragraph.children[0].textContent, 'Notes:');
  assert.equal(list.tagName, 'ul');
  assert.equal(list.children.length, 2);
  assert.equal(list.children[0].tagName, 'li');
  assert.equal(list.children[0].children[0].textContent, 'First point');
  assert.equal(list.children[1].children[0].textContent, 'Second point with ');
  assert.equal(list.children[1].children[1].tagName, 'strong');
  assert.equal(list.children[1].children[1].textContent, 'bold');
});

test('renderInlineMarkdown starts a fresh list when bullet lines are interrupted by a paragraph', () => {
  const root = new FakeDocument();
  const container = root.createElement('div');
  renderInlineMarkdown(root, container, '- One\n- Two\nInterruption.\n- Three', { multiline: true });

  assert.equal(container.children.length, 3);
  assert.equal(container.children[0].tagName, 'ul');
  assert.equal(container.children[0].children.length, 2);
  assert.equal(container.children[1].tagName, 'p');
  assert.equal(container.children[1].children[0].textContent, 'Interruption.');
  assert.equal(container.children[2].tagName, 'ul');
  assert.equal(container.children[2].children.length, 1);
});

test('renderInlineMarkdown skips blank lines between paragraphs', () => {
  const root = new FakeDocument();
  const container = root.createElement('div');
  renderInlineMarkdown(root, container, 'First.\n\nSecond.', { multiline: true });

  assert.equal(container.children.length, 2);
  assert.equal(container.children[0].children[0].textContent, 'First.');
  assert.equal(container.children[1].children[0].textContent, 'Second.');
});

test('renderInlineMarkdown re-renders cleanly when switching from multi-line to single-line output', () => {
  const root = new FakeDocument();
  const container = root.createElement('div');
  renderInlineMarkdown(root, container, '- One\n- Two', { multiline: true });
  renderInlineMarkdown(root, container, 'Plain text.');

  assert.equal(container.children.length, 1);
  assert.equal(container.children[0].tagName, 'span');
  assert.equal(container.children[0].textContent, 'Plain text.');
});

test('renderInlineMarkdown without { multiline: true } renders embedded newlines as flat text, matching the original single-pass behaviour exactly', () => {
  const root = new FakeDocument();
  const container = root.createElement('div');
  renderInlineMarkdown(root, container, 'Here are the options:\n- Option A\n- Option B');

  assert.equal(container.children.length, 1);
  assert.equal(container.children[0].tagName, 'span');
  assert.equal(container.children[0].textContent, 'Here are the options:\n- Option A\n- Option B');
});

function findByClass(node, name) {
  const classes = String(node?.className ?? '').split(/\s+/);
  if (classes.includes(name)) return node;
  for (const child of node?.children ?? []) {
    const found = findByClass(child, name);
    if (found) return found;
  }
  return null;
}

test('appendRecordProposal adds a read-only exercises summary with cable types', () => {
  const root = new FakeDocument();
  const { card } = appendRecordProposal(root, {
    path: 'data/fitness/2026/07/2026-07-30-test.md',
    record: {
      type: 'workout',
      date: '2026-07-30',
      title: 'Chest and Curls',
      session_kind: 'strength',
      status: 'completed',
      exercises: [{
        name: 'Chest Press',
        bench_angle_deg: 0,
        sets: [
          { reps: 10, weight_kg: 32, cable_type: 'concentric' },
          { reps: 8, weight_kg: 34, cable_type: 'concentric' }
        ]
      }, {
        name: 'Bicep Curl',
        sets: [{ reps: 12, weight_kg: 12, cable_type: 'constant_force' }]
      }]
    },
    notes: 'Good session.'
  });

  const summary = findByClass(card, 'record-proposal__exercises');
  assert.ok(summary);
  assert.equal(summary.tagName, 'ul');
  assert.equal(summary.children.length, 2);
  const firstCopy = summary.children[0].children[1];
  assert.equal(firstCopy.children[0].tagName, 'strong');
  assert.match(firstCopy.children[0].textContent, /Chest Press @ 0°/);
  assert.match(firstCopy.children[1].textContent, /Set 1: 32 kg × 10 reps · cable: concentric/);
  const secondCopy = summary.children[1].children[1];
  assert.match(secondCopy.children[0].textContent, /Bicep Curl/);
  assert.match(secondCopy.children[1].textContent, /cable: constant force/);
});

test('appendRecordProposal renders a planned workout as a save-to-Fitness card', () => {
  const root = new FakeDocument();
  const { card, confirm } = appendRecordProposal(root, {
    path: 'data/fitness/2026/07/2026-07-30-test.md',
    record: {
      type: 'workout',
      date: '2026-07-30',
      title: 'Upper Body',
      session_kind: 'strength',
      status: 'planned',
      duration_min: 35,
      exercises: [
        { name: 'Bench Press', sets: [{}, {}, {}, {}] },
        { name: 'Push-Up', sets: [{}, {}, {}, {}] }
      ]
    },
    notes: ''
  });

  assert.equal(findByClass(card, 'workout-plan-card__day').textContent, 'Thursday');
  assert.equal(findByClass(card, 'workout-plan-card__title').textContent, 'Upper Body');
  assert.equal(findByClass(card, 'workout-plan-card__meta').textContent, '35 min');
  assert.equal(findByClass(card, 'workout-plan-card__sets').textContent, '4 sets');
  assert.equal(confirm.textContent, 'Save to Fitness');
  // Planned workouts expose day_type / duration_min / status (+ notes) as editable pairs.
  assert.equal(card.children.find(child => child.className === 'record-proposal__fields').children.length, 6);
});

test('appendRecordProposal renders protocol lint warnings without disabling Confirm', () => {
  const root = new FakeDocument();
  const { card, confirm } = appendRecordProposal(root, {
    path: 'data/fitness/2026/07/2026-07-30-test.md',
    record: {
      type: 'workout',
      date: '2026-07-30',
      title: 'Quick Session',
      session_kind: 'strength',
      status: 'planned',
      exercises: [{ name: 'Chest Press', sets: [{ reps: 10, weight_kg: 32, cable_type: 'concentric' }] }]
    },
    notes: '',
    warnings: ['3 exercises — the protocol default is 5-9 per session.', 'No exercise looks like a warmup by name.']
  });

  const warningsList = card.children.find(child => child.className === 'record-proposal__warnings');
  assert.ok(warningsList, 'expected a warnings element on the card');
  assert.equal(warningsList.children.length, 2);
  assert.match(warningsList.children[0].textContent, /5-9/);
  assert.match(warningsList.children[1].textContent, /warmup/i);
  assert.notEqual(confirm.disabled, true, 'lint warnings must never disable Confirm -- Adam can always override');
});

test('appendRecordProposal renders no warnings element when there are no lint warnings', () => {
  const root = new FakeDocument();
  const { card } = appendRecordProposal(root, {
    path: 'data/nutrition/2026/08/2026-08-07-breakfast.md',
    record: { type: 'meal', date: '2026-08-07', meal: 'breakfast', calories: 520, protein_g: 38, fat_g: 12 },
    notes: '',
    warnings: []
  });

  assert.equal(card.children.find(child => child.className === 'record-proposal__warnings'), undefined);
});

test('appendRecordProposal tolerates a missing warnings field entirely (older event shape)', () => {
  const root = new FakeDocument();
  const { card } = appendRecordProposal(root, {
    path: 'data/nutrition/2026/08/2026-08-07-breakfast.md',
    record: { type: 'meal', date: '2026-08-07', meal: 'breakfast', calories: 520, protein_g: 38, fat_g: 12 },
    notes: ''
  });

  assert.equal(card.children.find(child => child.className === 'record-proposal__warnings'), undefined);
});

test('appendRecordProposal always shows a sodium field for meal proposals', () => {
  const root = new FakeDocument();
  const { inputs } = appendRecordProposal(root, {
    path: 'data/nutrition/2026/08/2026-08-07-breakfast.md',
    record: {
      type: 'meal',
      date: '2026-08-07',
      meal: 'breakfast',
      calories: 520,
      protein_g: 38,
      fat_g: 12
    },
    notes: 'Bacon and egg roll'
  });

  assert.ok(inputs.sodium_mg);
  assert.equal(inputs.sodium_mg.value, '');
  assert.equal(inputs.calories.value, '520');
});

test('appendCnPatchProposal renders summary, section/op, affected detail, and Confirm/Discard buttons', () => {
  const root = new FakeDocument();
  const { card, confirm, discard } = appendCnPatchProposal(root, {
    patch: {
      section: 'constraints',
      op: 'delete_lines',
      payload: { match: 'Steroid taper', summary: 'Remove taper constraint' }
    }
  });

  assert.ok(card);
  assert.match(card.className, /record-proposal/);
  assert.match(card.className, /cn-patch-proposal/);
  assert.equal(
    card.children.find(child => child.className === 'cn-patch-proposal__summary')?.textContent,
    'Remove taper constraint'
  );
  assert.equal(
    card.children.find(child => child.className === 'cn-patch-proposal__meta')?.textContent,
    'constraints · delete_lines'
  );
  assert.equal(
    card.children.find(child => child.className === 'cn-patch-proposal__detail')?.textContent,
    'Steroid taper'
  );
  assert.equal(confirm.textContent, 'Confirm');
  assert.equal(discard.textContent, 'Discard');
  assert.match(card.className, /confirm-card/);
  assert.match(confirm.className, /btn--primary/);
  assert.match(discard.className, /btn--ghost/);
  assert.equal(root.querySelector('#chat-messages').children.includes(card), true);
});

test('appendCnPatchProposal includes truncated payload.text in the detail line', () => {
  const root = new FakeDocument();
  const longText = `${'Keep surplus and hold the line. '.repeat(12)}tail`;
  const { card } = appendCnPatchProposal(root, {
    patch: {
      section: 'cross_agent',
      op: 'append_line',
      payload: {
        summary: 'Nudge Brisket',
        match: 'old directive',
        text: longText
      }
    }
  });

  const detail = card.children.find(child => child.className === 'cn-patch-proposal__detail')?.textContent ?? '';
  assert.match(detail, /^old directive · /);
  const textPart = detail.slice('old directive · '.length);
  assert.ok(textPart.length <= 160);
  assert.match(textPart, /…$/);
  assert.doesNotMatch(detail, /tail/);
});

function collectCardText(node) {
  const parts = [];
  function walk(el) {
    if (el.textContent) parts.push(el.textContent);
    if (el.value != null && el.value !== '') parts.push(String(el.value));
    for (const child of el.children ?? []) walk(child);
  }
  walk(node);
  return parts.join(' ');
}

test('appendRecordProposal hides system_note on diary cards but shows cross_agent_note', () => {
  const root = new FakeDocument();
  const { card } = appendRecordProposal(root, {
    path: 'data/mind/2026/08/2026-08-13-diary.md',
    record: {
      type: 'diary',
      date: '2026-08-13',
      system_note: 'hidden',
      cross_agent_note: 'Penelope→Vera: hi'
    },
    notes: ''
  });

  const cardText = collectCardText(card);
  assert.doesNotMatch(cardText, /hidden/);
  assert.doesNotMatch(cardText, /system_note/i);
  assert.match(cardText, /Penelope→Vera/);
});

test('renderInlineMarkdown keeps bullet lines in one list even when a blank line separates them', () => {
  const root = new FakeDocument();
  const container = root.createElement('div');
  renderInlineMarkdown(root, container, '- One\n\n- Two', { multiline: true });

  assert.equal(container.children.length, 1);
  assert.equal(container.children[0].tagName, 'ul');
  assert.equal(container.children[0].children.length, 2);
  assert.equal(container.children[0].children[0].children[0].textContent, 'One');
  assert.equal(container.children[0].children[1].children[0].textContent, 'Two');
});

test('renderInlineMarkdown groups consecutive numbered lines into an ordered list', () => {
  const root = new FakeDocument();
  const container = root.createElement('div');
  renderInlineMarkdown(root, container, 'Steps:\n1. First\n2. Second with **bold**', { multiline: true });

  assert.equal(container.children.length, 2);
  const list = container.children[1];
  assert.equal(list.tagName, 'ol');
  assert.equal(list.children.length, 2);
  assert.equal(list.children[0].children[0].textContent, 'First');
  assert.equal(list.children[1].children[1].tagName, 'strong');
  assert.equal(list.children[1].children[1].textContent, 'bold');
});

test('renderChatMarkdown turns a flattened workout dump into stacked exercise rows', () => {
  const root = new FakeDocument();
  const container = root.createElement('div');
  renderChatMarkdown(root, container, [
    '1. **Bar Squat** — legs first while you\'re fresh - Set 1: 10 reps x 25kg (cable: none) - Set 2: 10 reps x 25kg (cable: none) - Set 3: 10 reps x 25kg (cable: none)',
    '2. **Bar Row** — pull that back thick - Set 1: 10 reps x 26kg (cable: constant force) - Set 2: 10 reps x 26kg (cable: constant force) - Set 3: 10 reps x 26kg (cable: constant force)',
    '3. **Bar Press** — chest gets its pump, always - Set 1: 10 reps x 30kg (cable: constant force)'
  ].join(' '));

  const card = findByClass(container, 'chat-workout');
  assert.ok(card);
  const exercises = findByClass(card, 'chat-workout__exercises');
  assert.equal(exercises.children.length, 3);
  assert.equal(findByClass(exercises.children[0], 'chat-workout__name').textContent, 'Bar Squat');
  assert.equal(findByClass(exercises.children[0], 'chat-workout__cue').textContent, 'legs first while you\'re fresh');
  assert.equal(findByClass(exercises.children[0], 'chat-workout__set-n').textContent, '3 sets');
  assert.equal(findByClass(exercises.children[0], 'chat-workout__set-load').textContent, '10 × 25 kg');
  assert.equal(findByClass(exercises.children[0], 'chat-workout__set-cable').textContent, 'constant force');
  assert.equal(findByClass(exercises.children[1], 'chat-workout__name').textContent, 'Bar Row');
  assert.equal(findByClass(exercises.children[1], 'chat-workout__set-cable').textContent, 'constant force');
});

test('renderChatMarkdown parses compact loads and between-set arms', () => {
  const root = new FakeDocument();
  const container = root.createElement('div');
  renderChatMarkdown(root, container, [
    '1. Bar Squat — 10x25kg, 10x25kg, 10x25kg (cable: none) - *between sets:* Bar Bicep Curl — 10x5kg, 10x5kg (cable: none)',
    '2. Bar Press — 20 reps x 20kg (cable: constant force)'
  ].join('\n'));

  const exercises = findByClass(container, 'chat-workout__exercises');
  assert.equal(exercises.children.length, 2);
  assert.equal(findByClass(exercises.children[0], 'chat-workout__name').textContent, 'Bar Squat');
  assert.equal(findByClass(exercises.children[0], 'chat-workout__set-n').textContent, '3 sets');
  assert.match(findByClass(exercises.children[0], 'chat-workout__between').textContent, /Bar Bicep Curl/);
  assert.equal(findByClass(exercises.children[1], 'chat-workout__set-load').textContent, '20 × 20 kg');
});

test('renderChatMarkdown leaves ordinary chat as multiline markdown', () => {
  const root = new FakeDocument();
  const container = root.createElement('div');
  renderChatMarkdown(root, container, 'First.\n\nSecond.');

  assert.equal(container.children.length, 2);
  assert.equal(container.children[0].tagName, 'p');
  assert.equal(container.children[0].children[0].textContent, 'First.');
  assert.equal(container.children[1].children[0].textContent, 'Second.');
});

test('appendActionProposal renders intent, path diffs, and Confirm/Discard', () => {
  const root = new FakeDocument();
  const { card, confirm, discard } = appendActionProposal(root, {
    proposal: {
      agent: 'brisket',
      intent: 'open a 7-day no-refined-sugar tracker',
      writes: [{
        path: 'data/challenges/2026-08-01-no-sugar.json',
        mode: 'create',
        diff: 'new challenge file'
      }]
    }
  });

  assert.ok(card);
  assert.match(card.className, /action-proposal/);
  assert.equal(
    card.children.find(child => child.className === 'action-proposal__summary')?.textContent,
    'open a 7-day no-refined-sugar tracker'
  );
  assert.equal(
    card.children.find(child => child.className === 'action-proposal__meta')?.textContent,
    'via brisket'
  );
  const diffs = card.children.find(child => child.className === 'action-proposal__diffs');
  assert.ok(diffs);
  assert.match(diffs.children[0].children[0].textContent, /data\/challenges\/2026-08-01-no-sugar\.json/);
  assert.match(diffs.children[0].children[1].textContent, /create: new challenge file/);
  assert.equal(confirm.textContent, 'Confirm');
  assert.equal(discard.textContent, 'Discard');
});
