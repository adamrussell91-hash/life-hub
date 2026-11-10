// apps/tasks/src/views/thinking/protocol-detour.ts
// A protocol detour inside the thread view (spec section 5). With a draft and no session it shows
// the intake pre-filled and editable, with the mode, a time estimate and "Run (≈ A$x)" or "no cost
// data yet"; nothing runs until Adam presses Run. Run starts the protocol through the thread API's
// `detour` action, then the running conversation shows in a panel ("Running — you can leave this
// page"). With a sessionId it shows that run, running or finished.
//
// Tells the thread view something changed with THREAD_CHANGED_EVENT (detail.thread) when the run
// starts and when it finishes, so the strip and landing block refresh.
import { el } from '@/views/hub-kit';
import { configureProtocolView } from '../../../../../packages/protocol-view/env';
import { mountProtocolIntake, mountProtocolSession } from '../../../../../packages/protocol-view/view';
import { formatAud, loadProtocolCosts, protocolCost } from '../../../../../packages/protocol-view/cost.mjs';
import '../../../../../packages/protocol-view/style.css';
import { THREAD_CHANGED_EVENT } from './checkin-card';
import { threadsApi, withRevision } from './api';
import { homeSession } from './thread-logic';
import type { ProtocolDraft, Thread } from './types';

export const RUNNING_NOTE = 'Running — you can leave this page. The answer lands on the thread when it finishes.';
export const NO_COST_LABEL = 'Run (no cost data yet)';

/** Rough running time, by mode. A guide to set expectations, not a measurement. */
export function timeEstimate(protocolId: string, mode: string): string {
  const quick = ['sprint', 'quick', 'brief', 'standard'].includes(mode) && protocolId !== 'consilium';
  const long = ['long', 'deep', 'extended', 'full'].includes(mode);
  return long ? 'About 30 to 40 minutes' : quick ? 'About 10 to 15 minutes' : 'About 20 minutes';
}

/** The run button's text: the median cost when three or more runs are logged, else a plain "no cost data yet". */
export function runLabel(protocolId: string, mode: string): string {
  const cost = protocolCost(protocolId, mode);
  return cost ? `Run (≈ ${formatAud(cost.aud)})` : NO_COST_LABEL;
}

function sentence(items: readonly string[]): string {
  return items.map((s) => s.trim().replace(/[.!?]+$/, '')).filter(Boolean).join('; ');
}

/**
 * Witness at close: a Witness intake drafted from the thread's route log and digest, with no AI. The
 * route says which tools and protocols the thread went through and which suggestions were left; the
 * digest says what it settled and what stayed open. Every field stays editable.
 */
export function witnessDraft(thread: Thread): ProtocolDraft {
  const taken = thread.route.filter((r) => r.outcome === 'taken').map((r) => r.optionId);
  const notNow = thread.route.filter((r) => r.outcome === 'not_now').map((r) => r.optionId);
  const tools = [...new Set(thread.sessions.map((s) => s.tool))];
  const process = [
    `The thread went through ${tools.length} tool${tools.length === 1 ? '' : 's'}${tools.length ? ` (${tools.join(', ')})` : ''}.`,
    taken.length ? `Detours taken: ${[...new Set(taken)].join(', ')}.` : 'No detours were taken.',
    notNow.length ? `Suggestions not taken: ${[...new Set(notNow)].join(', ')}.` : ''
  ].filter(Boolean).join(' ');
  const started = thread.createdAt?.slice(0, 10) ?? '';
  const ended = thread.updatedAt?.slice(0, 10) ?? '';
  const intake: Record<string, string> = {
    instance: `How I worked through: ${thread.title}`,
    timeBoundary: started && ended ? (started === ended ? `On ${started}` : `From ${started} to ${ended}`) : '',
    outcome: sentence([...thread.digest.choices, ...thread.digest.facts]),
    process,
    concerns: sentence(thread.digest.openQuestions)
  };
  return { protocolId: 'witness', mode: 'standard', intake: Object.fromEntries(Object.entries(intake).filter(([, v]) => v)) };
}

export type ProtocolDetourOptions = {
  threadId: string;
  sessionId?: string | null;
  draft?: ProtocolDraft | null;
  /** The session and step the detour leaves from. Defaults to the thread's home session and no step. */
  fromSessionId?: string;
  fromStepId?: string | null;
  /** What the detour is for, kept on the thread's session. */
  question?: string;
  /** Called when a started run's session is known. */
  onStarted?: (sessionId: string) => void;
};

function notify(thread: Thread | null): void {
  if (thread) window.dispatchEvent(new CustomEvent(THREAD_CHANGED_EVENT, { detail: { thread } }));
}

/** Mount the intake, or the session when `sessionId` is given. */
export function mountProtocolDetour(host: HTMLElement, options: ProtocolDetourOptions): { teardown: () => void } {
  configureProtocolView({ apiBase: '/api/knowledge', assetRoot: '/knowledge/assets/cognitive-protocols', useLocalData: false });
  host.classList.add('tt-protocol');
  let inner: { teardown: () => void } | null = null;
  let closed = false;

  const showSession = (sessionId: string) => {
    inner?.teardown();
    const note = el('p', 'tt-protocol__note', RUNNING_NOTE);
    note.setAttribute('role', 'status');
    const panel = el('div', 'tt-protocol__panel');
    host.replaceChildren(note, panel);
    inner = mountProtocolSession(panel, {
      sessionId,
      onDone: (session) => {
        if (closed) return;
        if (session.status === 'completed') note.textContent = 'Finished — the answer is on the thread.';
        void threadsApi.get(options.threadId).then(notify).catch(() => undefined);
      }
    });
  };

  const showIntake = (draft: ProtocolDraft) => {
    const panel = el('div', 'tt-protocol__intake');
    host.replaceChildren(panel);
    inner = mountProtocolIntake(panel, {
      protocolId: draft.protocolId,
      mode: draft.mode,
      intake: draft.intake,
      runLabel: (mode) => runLabel(draft.protocolId, mode),
      estimate: (mode) => timeEstimate(draft.protocolId, mode),
      submit: async ({ protocolId, mode, intake }) => {
        const loaded = await threadsApi.get(options.threadId);
        const from = options.fromSessionId ?? homeSession(loaded)?.sessionId;
        if (!from) throw new Error('This thread has no session to leave from.');
        const started = await withRevision(loaded, () => ({
          action: 'detour', joint: 'asked', optionId: `protocol:${protocolId}`, mode, intake,
          fromSessionId: from, fromStepId: options.fromStepId ?? null, question: options.question ?? ''
        })) as unknown as { thread: Thread; open: { sessionId: string } };
        notify(started.thread);
        return { id: started.open.sessionId };
      },
      onStarted: (session) => {
        options.onStarted?.(session.id);
        showSession(session.id);
      }
    });
  };

  if (options.sessionId) showSession(options.sessionId);
  else if (options.draft) {
    host.replaceChildren(el('p', 'canvas-status', 'Loading…'));
    // The cost figures load once; until they do (or if they fail) the button says "no cost data yet".
    const draft = options.draft;
    void loadProtocolCosts().catch(() => undefined).then(() => { if (!closed) showIntake(draft); });
  } else host.replaceChildren(el('p', 'canvas-status', 'Nothing to show.'));

  return { teardown() { closed = true; inner?.teardown(); } };
}
