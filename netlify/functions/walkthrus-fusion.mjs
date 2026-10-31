import { errorResponse, methodNotAllowed, okResponse, withCors } from './_shared/http.mjs';
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { readJsonObject } from './_shared/teaching-record-get.mjs';
import { defaultGetProfessionalStore, getJSON, setJSON } from './_shared/professional-blobs.mjs';
import { AnthropicClientError, completeMessage as defaultCompleteMessage } from './_shared/anthropic-client.mjs';
import { addUsage, createTurnUsage, estimateUsd, usageLogLine } from './_shared/chat-usage-log.mjs';
import { fusionById, MAX_DRAW_NOTE, normalizeFusions } from '../../packages/walkthrus/fusions.mjs';
import { isFusionId } from '../../packages/walkthrus/tiles.mjs';
import { techniqueById } from '../../packages/walkthrus/catalogue.mjs';
import { partList, renderScene, validateScene } from '../../packages/walkthrus/draw/scene.mjs';
import { examplesFor } from '../../packages/walkthrus/draw/examples.mjs';

export const config = { path: '/api/walkthrus-fusion-draw' };

const KEY = 'walkthrus_board/v1';
export const DRAW_MODEL = 'claude-sonnet-5-5';
const MAX_TOKENS = 16000;
/** What one drawing costs, in A$, shown before Adam says yes: one call, or two with the retry. */
export const DRAW_ESTIMATE = Object.freeze({ low_aud: 0.1, high_aud: 0.25 });

const SYSTEM = `You draw small classroom pictures for a teacher's board of teaching techniques. Each picture sits inside a hexagon tile.

You never write code. You answer with a JSON list of drawing-kit calls, nothing else: [{"fn": "person", "args": [20, 88, {"s": 0.6}]}, ...]. Calls draw in order, so later parts sit on top.

House style, every rule required:
- Outlined white people with hair, collar and belt. No faces, no fingers, no words.
- Black line art, one pen weight (the kit sets it).
- Exactly ONE ink focus: one part with "ink": true, or one disc/blob/limb with "ink" colour, or one ink(...) shape. It marks what the technique is about. Nothing else is filled.
- The frame is 120 wide by 90 tall, y grows down. Keep every part inside it. People usually stand with feet at y 87-88 and s 0.4-0.62; pupils sit behind a desk with s about 0.6.
- Show a classroom moment: what the technique looks like in action, with at least one person.
- Speech bubbles hold only one mark: ?, …, ! or ✓.

Kit parts (only these):
${partList()}

Path strings ("M.. L.. Z") use plain SVG path commands and numbers only.`;

function stepLine(step, i) {
  const from = step.from ? ` (from ${techniqueById(step.from.id)?.name ?? 'a parent'}, step ${step.from.n})` : '';
  const loop = step.loop_to ? ` Then loop back to step ${step.loop_to}.` : '';
  const text = step.text.length > 180 ? `${step.text.slice(0, 177)}…` : step.text;
  return `${i + 1}. ${step.label}${from}: ${text}${loop}`;
}

/** The user message for one drawing: the fusion, its parents' scenes as worked examples, any redraw note. */
export function drawPrompt(fusion, note) {
  const parents = fusion.parents.map((id) => techniqueById(id)?.name ?? id);
  const examples = examplesFor(fusion.parents).map(({ id, scene }) => `${techniqueById(id)?.name ?? id}:\n${JSON.stringify(scene)}`).join('\n\n');
  return [
    `Draw the fused technique "${fusion.name}". It fuses ${parents.join(' + ')}.`,
    fusion.why ? `Why fuse them: ${fusion.why}` : '',
    `Its steps:\n${fusion.steps.map(stepLine).join('\n')}`,
    `Worked examples, existing tiles drawn with the same kit:\n\n${examples}`,
    note ? `The teacher's note for this redraw: ${note}` : '',
    'Answer with the JSON list only.'
  ].filter(Boolean).join('\n\n');
}

/** The scene out of Claude's answer: a bare list, a fenced block or {"scene": [...]}. */
export function parseScene(text) {
  const raw = String(text ?? '').replace(/```(?:json)?/gi, '').trim();
  const tries = [raw];
  const a = raw.indexOf('['), b = raw.lastIndexOf(']');
  if (a >= 0 && b > a) tries.push(raw.slice(a, b + 1));
  for (const t of tries) {
    try {
      const v = JSON.parse(t);
      if (Array.isArray(v)) return v;
      if (v && Array.isArray(v.scene)) return v.scene;
    } catch { /* try the next shape */ }
  }
  return null;
}

/** Counts tokens from the API's usage block while completeMessage returns only text. */
function usageFetch(baseFetch, turn) {
  return async (url, init) => {
    const res = await baseFetch(url, init);
    try {
      const u = (await res.clone().json())?.usage;
      if (u) addUsage(turn, { type: 'usage', inputTokens: u.input_tokens, outputTokens: u.output_tokens, cacheReadTokens: u.cache_read_input_tokens, cacheWriteTokens: u.cache_creation_input_tokens });
    } catch { /* usage is for the log only */ }
    return res;
  };
}

/**
 * Teacher only. POST { fusion_id, note? } draws (or redraws) one fusion's hexagon figure with Claude
 * and saves it into that fusion in the board document. GET ?estimate=1 is the A$ range to show first.
 */
export function createWalkthrusFusionHandler(deps = {}) {
  const complete = deps.completeMessage ?? defaultCompleteMessage;
  const baseFetch = deps.fetchImpl ?? ((...a) => fetch(...a));
  const now = deps.nowIso ?? (() => new Date().toISOString());
  const log = deps.log ?? ((line) => console.log(line));
  return createOperatorHandler(async (request, context) => {
    const { env, store } = context;
    if (request.method === 'GET') {
      return withCors(okResponse(200, { ...DRAW_ESTIMATE }, { 'cache-control': 'no-store' }), request, env);
    }
    if (request.method !== 'POST') return withCors(methodNotAllowed('GET, POST, OPTIONS'), request, env);

    const parsed = await readJsonObject(request);
    if (parsed.error) return withCors(parsed.error, request, env);
    const { fusion_id: id } = parsed.value;
    if (!isFusionId(id)) return withCors(errorResponse(400, 'validation_error', 'fusion_id is not a fusion.', false), request, env);
    const note = typeof parsed.value.note === 'string' ? parsed.value.note.replace(/\s+/g, ' ').trim().slice(0, MAX_DRAW_NOTE) : '';
    const apiKey = typeof env?.ANTHROPIC_API_KEY === 'string' ? env.ANTHROPIC_API_KEY : '';
    if (!apiKey) return withCors(errorResponse(503, 'anthropic_unconfigured', 'Drawing is not set up.', false), request, env);

    const fusion = fusionById(normalizeFusions((await getJSON(store, KEY))?.fusions), id);
    if (!fusion) return withCors(errorResponse(404, 'not_found', 'No fusion with that id.', false), request, env);

    const turn = createTurnUsage();
    const messages = [{ role: 'user', content: drawPrompt(fusion, note) }];
    let scene = null;
    let svg = null;
    let errors = [];
    let chars = SYSTEM.length + messages[0].content.length;
    let outChars = 0;
    for (let attempt = 0; attempt < 2 && !svg; attempt++) {
      let text;
      try {
        text = await complete({ apiKey, fetchImpl: usageFetch(baseFetch, turn), model: DRAW_MODEL, maxTokens: MAX_TOKENS, system: SYSTEM, messages: [...messages], thinking: { type: 'adaptive' } });
      } catch (err) {
        if (err instanceof AnthropicClientError) return withCors(errorResponse(502, err.code, 'Claude could not draw it just now. Try again.', err.retryable), request, env);
        throw err;
      }
      outChars += String(text ?? '').length;
      const candidate = parseScene(text);
      const check = candidate ? validateScene(candidate) : { ok: false, errors: ['The answer was not a JSON list of parts.'] };
      if (check.ok) {
        try { scene = candidate; svg = renderScene(candidate); } catch (e) { check.ok = false; check.errors = [String(e?.message ?? e)]; }
      }
      if (!svg) {
        errors = check.errors.slice(0, 12);
        messages.push({ role: 'assistant', content: String(text ?? '').slice(0, 8000) || '[]' }, { role: 'user', content: `That drawing broke these rules:\n- ${errors.join('\n- ')}\nFix them and answer with the corrected JSON list only.` });
        chars += messages.at(-2).content.length + messages.at(-1).content.length;
      }
    }

    // completeMessage returns text only; when the usage block was not seen, count about 4 characters a token.
    if (!turn.rounds) Object.assign(turn, { rounds: 1, inputTokens: Math.ceil(chars / 4), outputTokens: Math.ceil(outChars / 4) });
    log(usageLogLine({ agent: 'walkthrus-fusion-draw', model: DRAW_MODEL, turn }));
    const cost_usd = estimateUsd(turn, DRAW_MODEL);

    // Read again: the call took a while and the board may have changed. Only this fusion's drawing moves.
    const stored = (await getJSON(store, KEY)) ?? {};
    const list = Array.isArray(stored.fusions) ? stored.fusions : [];
    const current = list.find((f) => f && f.id === id);
    if (!current) return withCors(errorResponse(404, 'not_found', 'The fusion was removed while drawing.', false), request, env);
    const keepOld = !svg && current.drawing?.status === 'drawn';
    const drawing = svg
      ? { status: 'drawn', scene, svg, note: note || null, at: now() }
      : keepOld ? current.drawing : { status: 'failed', scene: null, svg: null, note: note || null, at: now() };
    const next = { ...stored, fusions: list.map((f) => (f && f.id === id ? { ...f, drawing } : f)), updated_at: now() };
    await setJSON(store, KEY, next);
    const saved = fusionById(normalizeFusions(next.fusions), id);
    return withCors(okResponse(200, { fusion: saved, cost_usd, ...(svg ? {} : { failed: true, errors }) }), request, env);
  }, { ...deps, getContentStore: deps.getContentStore ?? defaultGetProfessionalStore, unboundCode: 'professional_blobs_unbound', unboundMessage: 'Professional content store is not bound.' });
}

export default createWalkthrusFusionHandler();
