// apps/tasks/src/views/thinking/session-hooks.ts
// What a tool's session view adds for thinking threads, in one place so each of the eight views
// takes three lines: mount the strip and the landing block, fire the check-in at each joint the
// session crosses, check in when a thread is opened after time away, and watch for detours that
// come back. Nothing here blocks the tool: every failure is silent.
import { el } from '@/views/hub-kit';
import { stepName, detourEndStep } from '../../../../../packages/problem-solver/steps.mjs';
import type { PsSession } from '../../../../../packages/problem-solver/types';
import { threadsApi } from './api';
import { fireJoint, THREAD_CHANGED_EVENT, type JointContext } from './checkin-card';
import { mountLandingBlock, type LandingBlock } from './landing-block';
import { mountThreadStrip, type StepInfo, type ThreadStrip } from './thread-strip';
import { jointBetween, waitingOn, type SessionSnap } from './thread-logic';
import { resumeIfDue } from './resume';
import type { Thread } from './types';

export type SessionThread = {
  /** Put this between the page's step track and its board. Hidden until the session has a thread. */
  el: HTMLElement;
  update(session: PsSession): void;
  destroy(): void;
};

const POLL_MS = 6000;

/** Remembered in this browser; where storage is blocked, for as long as the page lives. */
const memory = new Map<string, string>();
const store = {
  get(key: string): string | null {
    try { return localStorage.getItem(key) ?? memory.get(key) ?? null; } catch { return memory.get(key) ?? null; }
  },
  set(key: string, value: string): void {
    memory.set(key, value);
    try { localStorage.setItem(key, value); } catch { /* the check-in may repeat after a reload; nothing breaks */ }
  }
};

/** Where the session is, as the guide and the strip want it. */
export function stepInfo(session: PsSession): StepInfo {
  const phase = session.phase;
  const title = !session.model || phase === 'frame' ? 'Framing' : phase === 'finished' ? 'Finished' : stepName(session.model.id, phase);
  const learned = [...(session.learnings ?? [])].reverse().find((l) => l.step === phase)?.text;
  const frame = Object.values(session.frame ?? {}).filter((v) => typeof v === 'string' && v).join(' ');
  const text = (phase === 'frame' ? frame : learned || session.summary || frame).slice(0, 1200);
  return { stepId: phase, stepTitle: title, latestStep: { title, text } };
}

export function snapOf(session: PsSession): SessionSnap {
  const c = session.caseFile;
  return {
    phase: session.phase,
    endStep: session.model ? (detourEndStep(session.model.id) as string) : null,
    recordKey: c ? `${c.version}:${c.writtenAt}` : null
  };
}

export function mountSessionThread({ say }: { say: (text: string) => Promise<void> }): SessionThread {
  const root = el('div', 'tt-session');
  root.hidden = true;
  const stripHost = el('div');
  const landingHost = el('div');
  root.append(stripHost, landingHost);

  let session: PsSession | null = null;
  let threadId: string | null = null;
  let thread: Thread | null = null;
  let strip: ThreadStrip | null = null;
  let landing: LandingBlock | null = null;
  let prev: SessionSnap | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let alive = true;
  let seen = new Map<string, string>();

  const ctxOf = (joint: JointContext['joint'], over: Partial<JointContext> = {}): JointContext | null => {
    if (!session || !threadId) return null;
    const step = stepInfo(session);
    return { threadId, sessionId: session.id, joint, stepId: step.stepId, stepTitle: step.stepTitle, latestStep: step.latestStep, ...over };
  };

  const fire = (joint: JointContext['joint'], over: Partial<JointContext> = {}) => {
    const ctx = ctxOf(joint, over);
    if (!ctx || !alive) return;
    const entry = thread?.sessions.find((s) => s.sessionId === ctx.sessionId);
    void fireJoint({ ...ctx, host: undefined, detourTool: entry?.role === 'detour' ? entry.tool : undefined });
  };

  /** Take a fresh thread: redraw the pieces, and check in on a detour that has just come back. */
  function apply(next: Thread): void {
    if (!alive || !session) return;
    const before = seen;
    thread = next;
    strip?.update(next);
    landing?.update(next);
    root.hidden = false;
    seen = new Map(next.sessions.map((s) => [s.sessionId, s.state]));
    if (next.sessions.find((s) => s.sessionId === session!.id)?.role !== 'home') return;
    // A return is checked once, when this page first sees it: now, or on the next visit.
    const back = next.sessions.find((s) => s.role === 'detour' && s.from?.sessionId === session!.id && s.state === 'returned' && !s.landing && !store.get(`tt.returned.${s.sessionId}`) && (before.get(s.sessionId) !== 'returned'));
    if (back) {
      store.set(`tt.returned.${back.sessionId}`, new Date().toISOString());
      fire('returned', { stepId: back.from?.stepId ?? session.phase, latestStep: { title: back.question ?? 'Detour', text: back.packet?.answer ?? '' } });
    }
    schedule();
  }

  async function refresh(): Promise<void> {
    if (!threadId || !alive) return;
    try {
      apply(await threadsApi.get(threadId));
    } catch { /* the page carries on without the thread */ }
  }

  /** Poll while a detour is out; otherwise only when the tab is shown again. */
  function schedule(): void {
    const waiting = thread?.sessions.some((s) => waitingOn(s) && s.from?.sessionId === session?.id) ?? false;
    if (waiting && !timer) timer = setInterval(() => { if (!document.hidden) void refresh(); }, POLL_MS);
    if (!waiting && timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  const onChanged = (event: Event) => {
    const next = (event as CustomEvent<{ thread: Thread | null }>).detail?.thread;
    if (next && next.id === threadId) apply(next);
    else void refresh();
  };
  const onVisible = () => {
    if (document.visibilityState === 'visible') void refresh();
  };
  window.addEventListener(THREAD_CHANGED_EVENT, onChanged);
  document.addEventListener('visibilitychange', onVisible);

  /** The first sight of a thread this visit: a check-in if it has been away, or its rest is over. */
  async function start(first: Thread): Promise<void> {
    const current = await resumeIfDue(first, session?.updatedAt, () => fire('resumed'));
    apply(current);
  }

  return {
    el: root,
    update(next) {
      session = next;
      root.parentElement?.classList.toggle('tt-is-detour', Boolean(next.threadDetour));
      if (!next.threadId) return;
      if (!threadId) {
        threadId = next.threadId;
        strip = mountThreadStrip(stripHost, { threadId, sessionId: next.id, getStep: () => stepInfo(session!) });
        landing = mountLandingBlock(landingHost, { sessionId: next.id, say });
        prev = snapOf(next);
        void threadsApi.get(threadId).then((t) => (alive ? start(t) : undefined), () => undefined);
        return;
      }
      const snap = snapOf(next);
      const joint = next.model && !['lightning', 'quick', 'start'].includes(next.kind) ? jointBetween(prev, snap) : null;
      prev = snap;
      if (!joint) return;
      // The thread may have just changed (a detour started or returned); fire on the freshest copy.
      fire(joint);
    },
    destroy() {
      alive = false;
      if (timer) clearInterval(timer);
      timer = null;
      window.removeEventListener(THREAD_CHANGED_EVENT, onChanged);
      document.removeEventListener('visibilitychange', onVisible);
      strip?.destroy();
    }
  };
}
