// apps/tasks/src/views/thinking/checkin-card.ts
// Check-ins at the joints (spec section 2). `fireJoint` asks the guide whether to carry on; only a
// reason to change course shows anything. One card is ever on screen. Errors stay silent, except
// after "Where next?", which says it could not check and offers Retry.
import { el } from '@/views/hub-kit';
import { errorMessage } from '@/views/feedback';
import { loadProtocolCosts } from '../../../../../packages/protocol-view/cost.mjs';
import { mountProtocolDetour, runLabel, timeEstimate, witnessDraft } from './protocol-detour';
import { guideApi, threadsApi } from './api';
import { isProtocolOption, modeLabel, option, optionLabel, protocolName, toolName } from './map';
import type { Joint, LatestStep, ProtocolDraft, Thread, Verdict } from './types';

export type JointContext = {
  threadId: string;
  sessionId: string;
  joint: Joint;
  stepId?: string | null;
  stepTitle?: string;
  latestStep?: LatestStep | null;
};

export type FireOptions = JointContext & {
  /** Where the card goes; defaults to the slot the thread strip registered. */
  host?: HTMLElement | null;
  /** True after "Where next?": a failure and a plain carry-on are both said aloud. */
  explicit?: boolean;
  /** The tool of this session when it is a detour (a hand-over card names it). */
  detourTool?: string;
};

/** Sent on window when a check-in finishes, so the strip can tick and a view can refresh. */
export const CHECKED_EVENT = 'thinking:checked';
export const THREAD_CHANGED_EVENT = 'thinking:thread-changed';

let slot: HTMLElement | null = null;
let current: { host: HTMLElement; card: HTMLElement } | null = null;

/** The strip registers the element cards are drawn into. */
export function registerCardSlot(host: HTMLElement | null): void {
  slot = host;
}

/** Remove the card on screen, if any (one card at a time). */
export function clearCard(): void {
  current?.card.remove();
  current = null;
}

function show(host: HTMLElement | null, card: HTMLElement): void {
  const target = host ?? slot;
  clearCard();
  if (!target) return;
  target.append(card);
  current = { host: target, card };
}

const changed = (thread: Thread | null): void => {
  window.dispatchEvent(new CustomEvent(THREAD_CHANGED_EVENT, { detail: { thread } }));
};

function button(label: string, kind: 'primary' | 'ghost', onClick: () => void): HTMLButtonElement {
  const b = el('button', `btn btn--${kind === 'primary' ? 'primary' : 'ghost'} tt-btn`, label) as HTMLButtonElement;
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
}

/** Start a detour to `optionId`, then open it where the server says. */
export async function startDetour(ctx: JointContext, optionId: string, question: string): Promise<void> {
  const thread = await threadsApi.get(ctx.threadId);
  const { open } = await threadsApi.detour(thread, {
    fromSessionId: ctx.sessionId,
    fromStepId: ctx.stepId ?? null,
    optionId,
    question,
    joint: ctx.joint,
    ...(ctx.stepTitle ? { stepTitle: ctx.stepTitle } : {})
  });
  location.hash = open.route;
}

async function notNow(ctx: JointContext, optionId: string, reason: string | null): Promise<void> {
  const thread = await threadsApi.get(ctx.threadId);
  changed(await threadsApi.route(thread, { joint: ctx.joint, optionId, reason, outcome: 'not_now', stepId: ctx.stepId ?? null, sessionId: ctx.sessionId }));
}

function statusLine(card: HTMLElement): HTMLElement {
  const line = el('p', 'tt-card__status');
  line.setAttribute('role', 'status');
  card.append(line);
  return line;
}

/** The suggestion card: a reason, a folded why, Detour (or Run, for a protocol) and Not now. */
export function suggestionCard(ctx: JointContext, verdict: { optionId: string; reason?: string; why?: string }): HTMLElement {
  const { optionId } = verdict;
  const opt = option(optionId);
  const card = el('section', 'tt-card tt-card--suggest');
  card.setAttribute('aria-label', 'Suggestion');
  card.append(el('p', 'tt-card__eyebrow', 'A thought'), el('h3', 'tt-card__title', optionLabel(optionId)));
  if (verdict.reason) card.append(el('p', 'tt-card__reason', verdict.reason));
  if (opt?.when) card.append(el('p', 'tt-card__when', opt.when));
  if (verdict.why) {
    const why = el('details', 'tt-card__why');
    why.append(el('summary', '', 'Why'), el('p', '', verdict.why));
    card.append(why);
  }
  const status = statusLine(card);
  const actions = el('div', 'tt-card__actions');
  const question = (verdict.reason || `Help with ${ctx.stepTitle || 'this step'}`).slice(0, 400);
  const busy = (on: boolean) => actions.querySelectorAll('button').forEach((b) => ((b as HTMLButtonElement).disabled = on));

  if (isProtocolOption(optionId)) {
    const protocolId = optionId.slice('protocol:'.length);
    const detail = el('p', 'tt-card__cost', 'Getting the draft…');
    card.insertBefore(detail, status);
    const run = button('Run', 'primary', () => void openProtocol());
    run.disabled = true;
    let draft: ProtocolDraft | null = null;
    const panel = el('div', 'tt-card__panel');
    panel.hidden = true;
    card.insertBefore(panel, status);
    void (async () => {
      try {
        const thread = await threadsApi.get(ctx.threadId);
        draft = (await threadsApi.protocolDraft(thread, { fromSessionId: ctx.sessionId, fromStepId: ctx.stepId ?? null, optionId, question })).draft;
        await loadProtocolCosts().catch(() => undefined);
        detail.textContent = `${protocolName(protocolId)}: ${modeLabel(protocolId, draft.mode)}. ${timeEstimate(protocolId, draft.mode)}.`;
        run.textContent = runLabel(protocolId, draft.mode);
        run.disabled = false;
      } catch (err) {
        detail.textContent = '';
        status.textContent = errorMessage(err, 'Could not get the draft.');
      }
    })();
    async function openProtocol(): Promise<void> {
      if (!draft) return;
      panel.hidden = false;
      actions.hidden = true;
      mountProtocolDetour(panel, { threadId: ctx.threadId, draft, fromSessionId: ctx.sessionId, fromStepId: ctx.stepId ?? null, question });
    }
    actions.append(run);
  } else {
    actions.append(button('Detour', 'primary', async () => {
      busy(true);
      status.textContent = '';
      try {
        await startDetour(ctx, optionId, question);
      } catch (err) {
        status.textContent = errorMessage(err, 'Could not start the detour.');
        busy(false);
      }
    }));
  }
  actions.append(button('Not now', 'ghost', async () => {
    busy(true);
    try {
      await notNow(ctx, optionId, verdict.reason ?? null);
      card.remove();
      if (current?.card === card) current = null;
    } catch (err) {
      status.textContent = errorMessage(err, 'Could not save that.');
      busy(false);
    }
  }));
  card.append(actions);
  return card;
}

/** A detour's check-in offering to make it the home tool. */
export function handOverCard(ctx: JointContext, verdict: { reason?: string; why?: string }, detourTool: string): HTMLElement {
  const card = el('section', 'tt-card tt-card--hand');
  card.setAttribute('aria-label', 'Hand over');
  card.append(el('p', 'tt-card__eyebrow', 'A thought'), el('h3', 'tt-card__title', `Make ${toolName(detourTool)} the home tool?`));
  if (verdict.reason) card.append(el('p', 'tt-card__reason', verdict.reason));
  if (verdict.why) {
    const why = el('details', 'tt-card__why');
    why.append(el('summary', '', 'Why'), el('p', '', verdict.why));
    card.append(why);
  }
  const status = statusLine(card);
  const actions = el('div', 'tt-card__actions');
  const lock = (on: boolean) => actions.querySelectorAll('button').forEach((b) => ((b as HTMLButtonElement).disabled = on));
  actions.append(
    button('Make this the home tool', 'primary', async () => {
      lock(true);
      try {
        const thread = await threadsApi.get(ctx.threadId);
        changed(await threadsApi.handOver(thread, ctx.sessionId));
        card.remove();
      } catch (err) {
        status.textContent = errorMessage(err, 'Could not hand over.');
        lock(false);
      }
    }),
    button('Not now', 'ghost', async () => {
      lock(true);
      try {
        await notNow(ctx, `tool:${detourTool}`, verdict.reason ?? null);
        card.remove();
      } catch (err) {
        status.textContent = errorMessage(err, 'Could not save that.');
        lock(false);
      }
    })
  );
  card.append(actions);
  return card;
}

/** Witness at close: an optional review of how the thinking went, drafted from the route and digest, priced like any run. */
function witnessCard(ctx: JointContext, thread: Thread): HTMLElement {
  const card = el('section', 'tt-card tt-card--end');
  card.append(el('p', 'tt-card__eyebrow', 'Witness'), el('h3', 'tt-card__title', 'Look back over the thinking'));
  const panel = el('div', 'tt-card__panel');
  card.append(panel);
  mountProtocolDetour(panel, {
    threadId: ctx.threadId,
    draft: witnessDraft(thread),
    fromSessionId: ctx.sessionId,
    fromStepId: ctx.stepId ?? null,
    question: 'Review how the thinking went across this thread: the route, the detours and what was not taken.'
  });
  return card;
}

const plusDays = (days: number): string => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

/**
 * The end card when the home tool writes its record: close the thread, rest it until a date, or
 * go on (a suggested next tool, and Witness to look back over the thinking). Always shown.
 */
export function endCard(ctx: JointContext, verdict: Verdict | null): HTMLElement {
  const card = el('section', 'tt-card tt-card--end');
  card.setAttribute('aria-label', 'Recorded');
  card.append(el('p', 'tt-card__eyebrow', 'Recorded'), el('h3', 'tt-card__title', 'That is written down. What next?'));
  const status = statusLine(card);
  const rest = el('div', 'tt-card__rest');
  rest.hidden = true;
  const date = el('input', 'tt-input') as HTMLInputElement;
  date.type = 'date';
  date.min = plusDays(1);
  date.value = plusDays(7);
  date.setAttribute('aria-label', 'Rest until');
  const actions = el('div', 'tt-card__actions');
  const lock = (on: boolean) => card.querySelectorAll('button').forEach((b) => ((b as HTMLButtonElement).disabled = on));
  const patch = async (p: { status: 'closed' | 'resting'; restUntil?: string | null }, done: string) => {
    lock(true);
    try {
      const thread = await threadsApi.get(ctx.threadId);
      changed(await threadsApi.patch(thread, p));
      actions.remove();
      rest.remove();
      status.textContent = done;
    } catch (err) {
      status.textContent = errorMessage(err, 'Could not save that.');
      lock(false);
    }
  };
  rest.append(date, button('Rest until then', 'primary', () => {
    if (!date.value || date.value < plusDays(1)) {
      status.textContent = 'Pick a day after today.';
      return;
    }
    void patch({ status: 'resting', restUntil: date.value }, `Resting until ${date.value}.`);
  }));
  actions.append(
    button('Close the thread', 'primary', () => void patch({ status: 'closed' }, 'Thread closed.')),
    button('Rest it with a date', 'ghost', () => {
      rest.hidden = !rest.hidden;
    }),
    button('Look back with Witness', 'ghost', async () => {
      lock(true);
      try {
        const witness = witnessCard(ctx, await threadsApi.get(ctx.threadId));
        card.replaceWith(witness);
        if (current?.card === card) current = { host: current.host, card: witness };
      } catch (err) {
        status.textContent = errorMessage(err, 'Could not open Witness.');
        lock(false);
      }
    })
  );
  card.append(actions, rest);
  if (verdict?.verdict === 'suggest' && verdict.optionId && !isProtocolOption(verdict.optionId)) {
    const next = el('div', 'tt-card__next');
    next.append(el('p', 'tt-card__reason', `Or next: ${optionLabel(verdict.optionId)}${verdict.reason ? `. ${verdict.reason}` : ''}`));
    next.append(button('Detour', 'ghost', async () => {
      lock(true);
      try {
        await startDetour({ ...ctx, joint: 'recorded' }, verdict.optionId!, verdict.reason || `Look at what comes after ${ctx.stepTitle || 'this record'}`);
      } catch (err) {
        status.textContent = errorMessage(err, 'Could not start the detour.');
        lock(false);
      }
    }));
    card.append(next);
  }
  return card;
}

/**
 * Ask the guide at a joint and show what it says. Resolves to the verdict, or null when the
 * check failed. `carry_on` shows nothing (the strip ticks); `suggest` and `hand_over` show a
 * card; `recorded` always shows the end card.
 */
export async function fireJoint(options: FireOptions): Promise<Verdict | null> {
  const { host = null, explicit = false, detourTool = 'tool', ...ctx } = options;
  let verdict: Verdict | null = null;
  try {
    verdict = await guideApi.checkIn({ threadId: ctx.threadId, joint: ctx.joint, sessionId: ctx.sessionId, stepId: ctx.stepId ?? null, latestStep: ctx.latestStep ?? null });
  } catch (err) {
    if (explicit) {
      const card = el('section', 'tt-card tt-card--quiet');
      card.append(el('p', 'tt-card__reason', 'Couldn’t check, try again.'));
      card.append(button('Retry', 'ghost', () => void fireJoint(options)));
      show(host, card);
    }
    window.dispatchEvent(new CustomEvent(CHECKED_EVENT, { detail: { threadId: ctx.threadId, verdict: null } }));
    if (ctx.joint === 'recorded') show(host, endCard(ctx, null));
    return null;
  }
  window.dispatchEvent(new CustomEvent(CHECKED_EVENT, { detail: { threadId: ctx.threadId, verdict } }));
  if (ctx.joint === 'recorded') {
    show(host, endCard(ctx, verdict));
    return verdict;
  }
  if (verdict.verdict === 'suggest' && verdict.optionId) {
    show(host, suggestionCard(ctx, { optionId: verdict.optionId, reason: verdict.reason, why: verdict.why }));
  } else if (verdict.verdict === 'hand_over') {
    show(host, handOverCard(ctx, verdict, detourTool));
  } else if (explicit) {
    const card = el('section', 'tt-card tt-card--quiet');
    card.append(el('p', 'tt-card__reason', 'Nothing to change. Carry on.'));
    show(host, card);
    setTimeout(() => {
      if (current?.card === card) clearCard();
    }, 4000);
  }
  return verdict;
}
