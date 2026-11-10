// netlify/functions/_shared/thinking-guide/prompt.mjs
// The guide's prompts: triage of a described situation, and a check-in at a joint. Each shows
// the shortlist (id, title, when, signals) and asks for JSON only. The guide may only pick ids
// from the shortlist; guide.mjs drops anything else.
import { SIGNALS } from '../../../../packages/thinking-map/index.mjs';

const clip = (text, max) => String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

/** One line per option, for the prompt. */
export function optionLines(options) {
  return options.map((o) => `- ${o.id} | ${o.title} | when: ${clip(o.when, 160)} | signals: ${o.signals.join(', ')}`).join('\n');
}

function digestLines(digest) {
  const d = digest ?? {};
  const row = (label, list) => (Array.isArray(list) && list.length ? `${label}: ${list.map((x) => clip(x, 200)).join('; ')}` : null);
  return [row('Facts', d.facts), row('Choices', d.choices), row('Rests on', d.restsOn), row('Open questions', d.openQuestions)].filter(Boolean).join('\n') || 'Nothing yet.';
}

const STANCE = `You are the guide in a personal thinking app. You route; you never solve. You suggest and the person chooses. Be brief and plain. Reply with one JSON object and nothing else: no prose, no code fence.`;

/**
 * Triage: one clarifying question at most (only when `canAsk`), else a start, up to two likely
 * next options and one alternative, each start and alternative with a one-line reason.
 */
export function triagePrompt({ situation, answer = null, options, canAsk }) {
  const system = `${STANCE}
Signals the app understands: ${SIGNALS.join(', ')}.
Choose only from THE OPTIONS by id.`;
  const ask = canAsk
    ? 'If the situation is too thin to judge, you may instead ask ONE short clarifying question: {"question": "..."}.'
    : 'Do not ask a question; choose.';
  const user = `SITUATION: ${clip(situation, 2000)}
${answer ? `ANSWER TO YOUR QUESTION: ${clip(answer, 800)}\n` : ''}
THE OPTIONS:
${optionLines(options)}

Pick where to start, what will likely come after (at most two, "likely, will check as we go"), and one real alternative.
${ask}
Otherwise reply: {"start": {"optionId": "...", "reason": "one line"}, "likely": ["..."], "alternative": {"optionId": "...", "reason": "one line"}}`;
  return { system, user };
}

/**
 * A check-in at a joint. Suggest only for a real reason to change course: a step that is really a
 * choice, a person or relationship at the centre, a values clash, going in circles, drift from the
 * situation, or answers getting thin. `canHandOver` lets a detour offer to become the home tool.
 * At `returned` the digest is rewritten in the same reply.
 */
export function checkInPrompt({ thread, joint, latestStep, options, declined, canSuggest, canHandOver, rewriteDigest }) {
  const system = `${STANCE}
Most check-ins should be {"verdict": "carry_on"}. Suggest a move only when there is a reason to change course: a step that is really a choice, a person or relationship at the centre, a values clash, going in circles, drift from the situation, or answers getting thin.
Choose only from THE OPTIONS by id. Never suggest a DECLINED option.`;
  const verdicts = [
    '{"verdict": "carry_on"}',
    ...(canSuggest ? ['{"verdict": "suggest", "optionId": "...", "reason": "one line the person sees", "why": "two or three lines, folded"}'] : []),
    ...(canHandOver ? ['{"verdict": "hand_over", "reason": "one line", "why": "..."} (this detour has become the real work: offer to make it the home tool)'] : [])
  ];
  const digestAsk = rewriteDigest
    ? `\nAlso rewrite what we know, folding in what came back, under about 150 words in all, as "digest": {"facts": [], "choices": [], "restsOn": [], "openQuestions": []}.`
    : '';
  const step = latestStep && typeof latestStep === 'object'
    ? [latestStep.title && `Step: ${clip(latestStep.title, 120)}`, latestStep.text && `Latest work: ${clip(latestStep.text, 1500)}`].filter(Boolean).join('\n')
    : clip(latestStep, 1500);
  const user = `THREAD: ${clip(thread.title, 120)}
SITUATION: ${clip(thread.situation, 1500)}
WHAT WE KNOW:
${digestLines(thread.digest)}
JOINT: ${joint}
${step || 'No step detail.'}
DECLINED HERE: ${declined.length ? declined.join(', ') : 'none'}

THE OPTIONS:
${optionLines(options)}

Reply with one of:
${verdicts.join('\n')}${digestAsk}`;
  return { system, user };
}
