// netlify/functions/_shared/problem-solver/coach-schema.mjs
import { isSkillId } from '../../../../packages/problem-solver/skills.mjs';
import { MODEL_IDS } from '../../../../packages/problem-solver/models.mjs';
import { TOOL_IDS } from '../../../../packages/problem-solver/tools/index.mjs';
import { parseSlot } from '../../../../packages/problem-solver/slots.mjs';
import { tidyTitle, titleFromText } from '../../../../packages/problem-solver/titles.mjs';

const VERDICTS = ['accept', 'challenge', 'clarify'];
const FRAME_KEYS = ['goal', 'whatIsTrue', 'whatCanBeDone'];
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

function suggestionOf(raw) {
  if (!raw || typeof raw !== 'object') return { value: null };
  const reason = text(raw.reason, 300) ?? '';
  if (raw.kind === 'next_tool' || raw.kind === 'switch_tool') {
    if (!TOOL_IDS.includes(raw.tool)) return { error: `Unknown tool in suggestion: ${raw.tool}` };
    return { value: { kind: raw.kind, tool: raw.tool, reason } };
  }
  if (raw.kind === 'next_step' || raw.kind === 'finish_define') return { value: { kind: 'next_step', reason } };
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
      learning: text(raw.learning, 600)
    }
  };
}
