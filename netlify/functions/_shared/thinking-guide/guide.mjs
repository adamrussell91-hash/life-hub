// netlify/functions/_shared/thinking-guide/guide.mjs
// The guide (spec section 2): triage of a described situation and check-ins at joints, one small
// Haiku call each, with a 12 second timeout. Its output is checked against the shortlist; an id
// outside it, or one already declined at this step, is dropped (carry on). If the call fails,
// triage falls back to the map alone (top 3 for the detected signals, no reasons) and a check-in
// says carry on quietly. Spend is logged per call.
import { completeMessage } from '../anthropic-client.mjs';
import { getOption, shortlist, signalsFromText, TOOLS } from '../../../../packages/thinking-map/index.mjs';
import { recordRoute, sessionOf, setDigest, wasDeclined } from '../thinking-threads/thread.mjs';
import { checkInPrompt, triagePrompt } from './prompt.mjs';
import { recordSpend } from './spend.mjs';
import { GUIDE_MODEL } from './pricing.mjs';

export const GUIDE_TIMEOUT_MS = 12_000;
const MAX_TOKENS = 700;

/** The production model call: Haiku through the shared client, returning text and usage. */
export function haikuModel(env, fetchImpl = fetch) {
  return async ({ system, user, signal }) => {
    if (!env.ANTHROPIC_API_KEY) throw Object.assign(new Error('The guide needs ANTHROPIC_API_KEY.'), { code: 'provider_unavailable', status: 503 });
    let usage = null;
    const text = await completeMessage({
      apiKey: env.ANTHROPIC_API_KEY,
      fetchImpl,
      model: GUIDE_MODEL,
      maxTokens: MAX_TOKENS,
      system,
      messages: [{ role: 'user', content: user }],
      signal,
      onUsage: (u) => { usage = u; }
    });
    return { text, usage };
  };
}

/** The first JSON object in the reply, or null. */
export function parseJsonReply(text) {
  const raw = String(text ?? '');
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const value = JSON.parse(raw.slice(start, end + 1));
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

const line = (text, max = 300) => String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const toolOptions = () => TOOLS.map((t) => getOption(`tool:${t.id}`));

/** The step's own option: what was sent (`latestStep.optionId`) or the session's tool. */
function stepOption(entry, latestStep) {
  const id = latestStep?.optionId;
  if (typeof id === 'string' && getOption(id)) return id;
  return entry ? (entry.kind === 'protocol' ? null : `tool:${entry.tool}`) : null;
}

/**
 * @param {{ model: Function, threads: object, owner: string, now?: () => string, timeoutMs?: number, log?: Function }} deps
 * `threads` is a thread store (store.mjs createThreadStore): get, updateLatest, getMeta, setMeta.
 */
export function createGuide({ model, threads, owner, now = () => new Date().toISOString(), timeoutMs = GUIDE_TIMEOUT_MS, log = () => {} }) {
  async function call(kind, prompt) {
    const controller = new AbortController();
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(Object.assign(new Error('The guide timed out.'), { code: 'guide_timeout' }));
      }, timeoutMs);
    });
    try {
      const result = await Promise.race([model({ ...prompt, signal: controller.signal }), timeout]);
      const text = typeof result === 'string' ? result : result?.text;
      const usage = typeof result === 'string' ? null : result?.usage ?? null;
      if (usage) {
        try { await recordSpend(threads, owner, { model: GUIDE_MODEL, usage, kind, now: now() }); } catch (error) { log(error); }
      }
      return parseJsonReply(text);
    } finally {
      clearTimeout(timer);
    }
  }

  /** The map alone: the top three for the detected signals, without reasons. */
  function triageFallback(text) {
    const picks = shortlist({ signals: signalsFromText(text), limit: 3 });
    const [start, second, third] = picks.length >= 3 ? picks : [...picks, ...toolOptions().filter((o) => !picks.includes(o))].slice(0, 3);
    return { start: { optionId: start.id, reason: '' }, likely: [second.id], alternative: { optionId: third.id, reason: '' }, fallback: true };
  }

  async function triage({ situation, answer = null } = {}) {
    const text = `${situation ?? ''} ${answer ?? ''}`;
    if (!String(situation ?? '').trim()) throw Object.assign(new Error('Describe the situation first.'), { status: 400, code: 'validation_error' });
    const options = [...shortlist({ signals: signalsFromText(text), limit: 8 })];
    for (const tool of toolOptions()) if (!options.some((o) => o.id === tool.id)) options.push(tool);
    const ids = new Set(options.map((o) => o.id));
    let reply;
    try {
      reply = await call('triage', triagePrompt({ situation, answer, options, canAsk: !answer }));
    } catch (error) {
      log(error);
      return triageFallback(text);
    }
    if (!reply) return triageFallback(text);
    if (!answer && typeof reply.question === 'string' && reply.question.trim() && !reply.start) return { question: line(reply.question, 300) };
    const startId = reply.start?.optionId;
    if (!ids.has(startId)) {
      if (startId) log(Object.assign(new Error(`Guide chose ${startId}, outside the shortlist.`), { code: 'off_shortlist' }));
      return triageFallback(text);
    }
    const likely = (Array.isArray(reply.likely) ? reply.likely : []).filter((id) => ids.has(id) && id !== startId).slice(0, 2);
    let alternative = reply.alternative && ids.has(reply.alternative.optionId) && reply.alternative.optionId !== startId
      ? { optionId: reply.alternative.optionId, reason: line(reply.alternative.reason) }
      : null;
    if (!alternative) {
      const next = options.find((o) => o.id !== startId && !likely.includes(o.id));
      alternative = { optionId: next.id, reason: '' };
    }
    return { start: { optionId: startId, reason: line(reply.start.reason) }, likely, alternative };
  }

  const carryOn = (extra = {}) => ({ verdict: 'carry_on', ...extra });

  async function checkIn({ threadId, joint, sessionId, stepId = null, latestStep = null } = {}) {
    const thread = await threads.get(owner, threadId);
    const entry = sessionOf(thread, sessionId);
    const isDetour = entry?.role === 'detour';
    const fromOptionId = stepOption(entry, latestStep);
    // Never offer what is already running in this thread, or what was declined at this step.
    const inThread = thread.sessions.map((s) => (s.kind === 'protocol' ? null : `tool:${s.tool}`)).filter(Boolean);
    const declinedHere = [...new Set(thread.route.filter((r) => r.outcome === 'not_now' && (r.stepId ?? null) === (stepId ?? null)).map((r) => r.optionId))];
    const signals = signalsFromText(`${thread.situation} ${latestStep?.text ?? ''} ${(thread.digest?.openQuestions ?? []).join(' ')}`);
    const options = shortlist({ signals, fromOptionId, exclude: [...inThread, ...declinedHere], limit: 8 });
    const ids = new Set(options.map((o) => o.id));
    const rewriteDigest = joint === 'returned';
    let reply;
    try {
      reply = await call('check_in', checkInPrompt({ thread, joint, latestStep, options, declined: declinedHere, canSuggest: !isDetour, canHandOver: isDetour, rewriteDigest }));
    } catch (error) {
      log(error);
      return carryOn({ fallback: true });
    }
    if (!reply) return carryOn({ fallback: true });

    let verdict = carryOn();
    if (reply.verdict === 'suggest' && !isDetour) {
      const optionId = reply.optionId;
      if (!ids.has(optionId)) log(Object.assign(new Error(`Guide chose ${optionId}, outside the shortlist.`), { code: 'off_shortlist' }));
      else if (!wasDeclined(thread, { optionId, fromStepId: stepId })) verdict = { verdict: 'suggest', optionId, reason: line(reply.reason), why: line(reply.why, 600) };
    } else if (reply.verdict === 'hand_over' && isDetour) {
      verdict = { verdict: 'hand_over', reason: line(reply.reason), why: line(reply.why, 600) };
    }

    // One write: the suggestion shown (every outcome goes in the route) and, after a return, the digest.
    const digest = rewriteDigest && reply.digest && typeof reply.digest === 'object' ? reply.digest : null;
    if (verdict.verdict === 'suggest' || digest) {
      try {
        await threads.updateLatest(owner, threadId, (t) => {
          let next = digest ? setDigest(t, digest, now()) : t;
          if (verdict.verdict === 'suggest') next = recordRoute(next, { joint, optionId: verdict.optionId, reason: verdict.reason, outcome: 'shown', stepId, sessionId, now: now() });
          return next;
        });
      } catch (error) { log(error); }
    }
    return verdict;
  }

  return { triage, checkIn };
}
