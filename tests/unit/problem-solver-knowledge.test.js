// tests/unit/problem-solver-knowledge.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { PROCESS } from '../../netlify/functions/_shared/problem-solver/knowledge/process.mjs';
import { CHAPTERS } from '../../netlify/functions/_shared/problem-solver/knowledge/chapters.mjs';
import { FINAL_WORDS } from '../../netlify/functions/_shared/problem-solver/knowledge/final-words.mjs';
import { SELECTION } from '../../netlify/functions/_shared/problem-solver/knowledge/selection.mjs';
import { BOOK_STEP_IDS } from '../../packages/problem-solver/steps.mjs';

test('every book step has a chapter paragraph', () => {
  for (const id of BOOK_STEP_IDS) assert.ok(CHAPTERS[id]?.length > 120, id);
});

test('process layer covers the models and the metacognitive frame', () => {
  for (const phrase of ['seven-step', 'Polya', 'TRIZ', 'orientation', 'verification', 'impulsive']) assert.ok(PROCESS.includes(phrase), phrase);
});

test('final words layer covers skill, emotion and Polya\'s heuristic, with guidance on when', () => {
  for (const phrase of ['skill', 'emotion', 'determination, hope and success', 'curiosity', 'WHEN']) assert.ok(FINAL_WORDS.includes(phrase), phrase);
});

test('selection guides exist for define and contradiction and name only registered tools', async () => {
  const { TOOL_IDS } = await import('../../packages/problem-solver/tools/index.mjs');
  for (const id of ['define', 'contradiction']) assert.ok(SELECTION[id], id);
  for (const [step, text] of Object.entries(SELECTION)) {
    for (const match of text.matchAll(/`([a-z_]+)`/g)) assert.ok(TOOL_IDS.includes(match[1]), `${step} names unknown tool ${match[1]}`);
  }
});

import { STEP_TRIGGERS } from '../../netlify/functions/_shared/problem-solver/knowledge/triggers.mjs';

test('selection guides for analyse and devise name every one of their tools', async () => {
  const { toolsForBookStep } = await import('../../packages/problem-solver/tools/index.mjs');
  for (const step of ['analyse', 'devise']) {
    for (const id of toolsForBookStep(step)) assert.ok(SELECTION[step].includes(`\`${id}\``), `${step} guide names ${id}`);
  }
});

test('step triggers exist for analyse and devise as short lines', () => {
  for (const step of ['analyse', 'devise']) {
    assert.ok(Array.isArray(STEP_TRIGGERS[step]) && STEP_TRIGGERS[step].length >= 3, step);
    for (const line of STEP_TRIGGERS[step]) assert.ok(line.length < 200, line);
  }
});
