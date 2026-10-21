// netlify/functions/_shared/problem-solver/coach-schema.mjs
import { isSkillId } from '../../../../packages/problem-solver/skills.mjs';
import { MODEL_IDS } from '../../../../packages/problem-solver/models.mjs';
import { TOOL_IDS } from '../../../../packages/problem-solver/tools/index.mjs';
import { CATALOGUE_IDS } from '../../../../packages/decision-book/catalogue.mjs';
import { parseSlot } from '../../../../packages/problem-solver/slots.mjs';
import { LIGHTNING_NODE_IDS } from '../../../../packages/problem-solver/lightning.mjs';
import { tidyTitle, titleFromText } from '../../../../packages/problem-solver/titles.mjs';

const VERDICTS = ['accept', 'challenge', 'clarify'];
const FRAME_KEYS = ['goal', 'whatIsTrue', 'whatCanBeDone', 'decision', 'compass', 'known'];
const TEXT_MAX = 600;

/** First balanced JSON object in text, or null. */
export function extractJson(text) {
  const source = String(text ?? '');
  for (let start = source.indexOf('{'); start !== -1; start = source.indexOf('{', start + 1)) {
    let depth = 0;
    let inString = false;
    for (let i = start; i < source.length; i += 1) {
      const ch = source[i];
      if (inString) {
        if (ch === '\\') i += 1;
        else if (ch === '"') inString = false;
      } else if (ch === '"') inString = true;
      else if (ch === '{') depth += 1;
      else if (ch === '}' && --depth === 0) {
        try { return JSON.parse(source.slice(start, i + 1)); } catch { break; }
      }
    }
  }
  return null;
}

const text = (value, max = TEXT_MAX) => (typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null);
const skills = (value) => (Array.isArray(value) ? [...new Set(value.filter(isSkillId))] : []);
const fail = (error) => ({ ok: false, error });

/** A real calendar date as YYYY-MM-DD (rejects 2026-02-31 and 2026-13-01). */
export function isDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function suggestionOf(raw) {
  if (!raw || typeof raw !== 'object') return { value: null };
  const reason = text(raw.reason, 300) ?? '';
  // next_model is Decision Maker's name for next_tool, limited to the book's models.
  if (raw.kind === 'next_model') {
    if (!CATALOGUE_IDS.includes(raw.tool) || !TOOL_IDS.includes(raw.tool)) return { error: `Unknown model in suggestion: ${raw.tool}` };
    return { value: { kind: 'next_tool', tool: raw.tool, reason } };
  }
  if (raw.kind === 'next_tool' || raw.kind === 'switch_tool') {
    if (!TOOL_IDS.includes(raw.tool)) return { error: `Unknown tool in suggestion: ${raw.tool}` };
    return { value: { kind: raw.kind, tool: raw.tool, reason } };
  }
  if (raw.kind === 'next_step' || raw.kind === 'finish_define') return { value: { kind: 'next_step', reason } };
  if (raw.kind === 'escalate') return { value: { kind: 'escalate', reason } };
  if (raw.kind === 'reopen_step') {
    if (!['define', 'analyse'].includes(raw.step)) return { error: 'reopen_step needs step define or analyse.' };
    return { value: { kind: 'reopen_step', step: raw.step, reason } };
  }
  return { value: null };
}

/** @returns {{ ok: true, value: object } | { ok: false, error: string }} */
export function validateCoachTurn(raw) {
  if (!raw || typeof raw !== 'object') return fail('Coach reply was not a JSON object.');
  if (!VERDICTS.includes(raw.verdict)) return fail('verdict must be accept, challenge or clarify.');
  const message = text(raw.message, 1200);
  if (!message) return fail('message is required.');

  let node = null;
  if (raw.node != null) {
    const slot = typeof raw.node.slot === 'string' ? raw.node.slot.trim() : '';
    const nodeText = text(raw.node.text);
    if (!parseSlot(slot)) return fail(`node.slot "${slot}" is not a slot name.`);
    if (!nodeText) return fail('node.text is required.');
    node = { slot, text: nodeText, title: tidyTitle(raw.node.title) ?? titleFromText(nodeText), ...(typeof raw.node.tag === 'string' && raw.node.tag.trim() ? { tag: raw.node.tag.trim().toLowerCase().slice(0, 40) } : {}) };
  }

  const edges = [];
  for (const edge of Array.isArray(raw.edges) ? raw.edges : []) {
    if (!parseSlot(edge?.from) || !parseSlot(edge?.to) || typeof edge?.kind !== 'string') return fail('Each edge needs from, to (slot names) and kind.');
    edges.push({ from: edge.from, to: edge.to, kind: edge.kind });
  }

  let frame = null;
  if (raw.frame && typeof raw.frame === 'object') {
    frame = Object.fromEntries(FRAME_KEYS.flatMap((key) => (text(raw.frame[key]) ? [[key, text(raw.frame[key])]] : [])));
    if (!Object.keys(frame).length) frame = null;
  }

  let model = null;
  if (raw.model != null) {
    if (!MODEL_IDS.includes(raw.model?.id)) return fail(`Unknown model: ${raw.model?.id}`);
    model = { id: raw.model.id, reason: text(raw.model.reason, 300) ?? '' };
  }

  const suggestion = suggestionOf(raw.suggestion);
  if (suggestion.error) return fail(suggestion.error);

  let lightning = null;
  if (raw.lightning != null) {
    if (!LIGHTNING_NODE_IDS.includes(raw.lightning?.node)) return fail(`Unknown Lightning box: ${raw.lightning?.node}`);
    const answer = ['yes', 'no'].includes(raw.lightning.answer) ? raw.lightning.answer : null;
    const note = text(raw.lightning.note);
    lightning = { node: raw.lightning.node, ...(answer ? { answer } : {}), ...(note ? { note } : {}) };
  }

  const proposeTasks = [];
  for (const item of Array.isArray(raw.proposeTasks) ? raw.proposeTasks.slice(0, 5) : []) {
    const title = text(item?.title, 120);
    if (!parseSlot(item?.slot) || !title) return fail('Each proposed task needs a slot and a title.');
    proposeTasks.push({ slot: item.slot, title, due: isDate(item.due) ? item.due : null });
  }
  const proposeReview = raw.proposeReview && isDate(raw.proposeReview.due) ? { due: raw.proposeReview.due, reason: text(raw.proposeReview.reason, 300) ?? '' } : null;
  // A decision record reason's basis: the Explore nodes it rests on, by model id and slot. Items
  // that are not shaped right are dropped; the session keeps only those naming a placed node.
  const basis = (Array.isArray(raw.basis) ? raw.basis : [])
    .filter((item) => typeof item?.tool === 'string' && parseSlot(item?.slot))
    .slice(0, 4)
    .map((item) => ({ tool: item.tool, slot: item.slot }));

  return {
    ok: true,
    value: {
      verdict: raw.verdict,
      message,
      node,
      edges,
      skillsSeen: skills(raw.skillsSeen),
      skillsMissing: skills(raw.skillsMissing),
      frame,
      model,
      suggestion: suggestion.value,
      summary: text(raw.summary, 1200),
      exitObjection: text(raw.exitObjection, 400),
      learning: text(raw.learning, 600),
      lightning,
      proposeTasks,
      proposeReview,
      basis
    }
  };
}
