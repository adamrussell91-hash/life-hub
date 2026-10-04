import test from 'node:test';
import assert from 'node:assert/strict';
import { catalog } from '../../config/knowledge/cognitive/definitions.mjs';
import { buildSystemPrompt } from '../../netlify/functions/_shared/persona.mjs';
import { loadHammondProtocol } from '../../netlify/functions/_shared/load-hammond-protocol.mjs';
import { KERNEL_PILOT_SLUGS } from '../../netlify/functions/_shared/agent-kernel.mjs';
import { findProtocol, protocolsForSlug } from '../../apps/life/js/app/agent-protocols.js';
import {
  formatThinkingProtocolCatalogForPrompt,
  recommendThinkingProtocol,
  thinkingProtocolDeepLink
} from '../../netlify/functions/_shared/thinking-protocol-recommend.mjs';

const CATALOG_IDS = catalog.map(item => item.id);

test('catalog formatter lists all eight Knowledge Hub thinking protocols from definitions', () => {
  const block = formatThinkingProtocolCatalogForPrompt();
  assert.match(block, /Knowledge Hub Thinking protocols/);
  assert.match(block, /not a Thinking protocol|not Thinking protocols/i);
  assert.match(block, /Direction Session/);
  for (const item of catalog) {
    assert.match(block, new RegExp(item.id));
    assert.match(block, new RegExp(item.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(block, /#protocols\?id=/);
});

test('screenshot: recomposition "which thinking protocol" is Mirror Council, not a refusal', () => {
  const pick = recommendThinkingProtocol({
    message: 'I might do number 2, which thinking protocol should I do with it?',
    context: 'Recomposition pace frustration. Body fat 18.9% against an 8–10% target, weight 86.3kg against 82kg ceiling. Chadwick owns training; Brisket owns nutrition.'
  });
  assert.equal(pick.id, 'mirror');
  assert.equal(pick.name, 'The Mirror Council');
  assert.equal(pick.mode, 'quick');
  assert.match(pick.why, /behaviour|aspiration|capacity/i);
  assert.equal(pick.link, '#protocols?id=mirror&mode=quick');
  assert.ok(CATALOG_IDS.includes(pick.id));
});

test('screenshot: open "what thinking protocol" on stay-vs-leave / HPGE is Horizon Council, not Direction Session', () => {
  const pick = recommendThinkingProtocol({
    message: "I want to do a thinking protocol but I don't know what one to do or what to do it on. What is your suggestion?",
    context: "The stay-vs-leave / HPGE direction thread. Possible leadership role at Corey's school, staying put, or the Department of Ed. Grief layer — family, unlived life — and a flake label distorting both options."
  });
  assert.equal(pick.id, 'horizon');
  assert.equal(pick.name, 'The Horizon Council');
  assert.equal(pick.mode, 'brief');
  assert.doesNotMatch(pick.name, /Direction Session|Session Triage|decision-architecture/i);
  assert.equal(pick.link, thinkingProtocolDeepLink({ id: 'horizon', mode: 'brief' }));
});

test('every Life agent prompt carries the thinking-protocol catalog and the Direction Session disambiguation', () => {
  for (const slug of KERNEL_PILOT_SLUGS) {
    const prompt = buildSystemPrompt({
      slug,
      digest: '',
      constraints: '',
      hammondProtocol: slug === 'hammond' ? loadHammondProtocol() : ''
    });
    assert.match(prompt, /The Three Fates/, `${slug} missing Fates`);
    assert.match(prompt, /The Horizon Council/, `${slug} missing Horizon`);
    assert.match(prompt, /The Mirror Council/, `${slug} missing Mirror`);
    assert.match(prompt, /Tribunal of Frames/, `${slug} missing Tribunal`);
    assert.match(prompt, /Direction Session/, `${slug} must name Direction Session only to reject it as a Thinking protocol`);
    assert.match(prompt, /not a Thinking protocol|not Thinking protocols/i, `${slug} missing disambiguation`);
  }
});

test('Hammond prompt last-read rule: a direct thinking-protocol ask must name a catalog protocol', () => {
  const prompt = buildSystemPrompt({
    slug: 'hammond',
    digest: '',
    constraints: '',
    hammondProtocol: loadHammondProtocol()
  });
  const tail = prompt.slice(-900);
  assert.match(tail, /thinking protocol/i);
  assert.match(tail, /Direction Session/);
  assert.match(tail, /name (exactly )?one/i);
});

test('Hammond operating manual treats Thinking protocols as Knowledge Hub catalog, not follow-on coaching', () => {
  const text = loadHammondProtocol();
  assert.match(text, /## Thinking protocols/);
  assert.match(text, /The Three Fates/);
  assert.match(text, /Knowledge Hub Thinking/);
  assert.match(text, /Follow-on protocols .*are not Thinking protocols|not Thinking protocols/i);
  assert.match(text, /When Adam asks for a thinking protocol/i);
});

test('Hammond has an explicit thinking-protocol pill', () => {
  const pill = findProtocol('hammond', 'thinking-protocol');
  assert.ok(pill, 'Hammond needs a thinking-protocol pill');
  assert.match(pill.label, /thinking protocol/i);
  assert.match(pill.steer, /Knowledge Hub Thinking|Horizon Council|Mirror Council/i);
  assert.ok(protocolsForSlug('hammond').pills.some(row => row.id === 'thinking-protocol'));
});
