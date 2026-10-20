import type { AgentJob, AgentProposal } from './agent-client';

export type Decision = 'accepted' | 'dismissed' | 'stale';
/** One suggestion with the review it came from; `key` is unique across reviews. */
export type Entry = { key: string; job: string; proposal: AgentProposal };
export type Ask = { blockId: string; text: string; job: AgentJob | null; error: string };
export type ReviewState = {
  /** The whole-page review. */
  review: AgentJob | null;
  /** Closed reviews keep their job but show no bar results or cards. */
  closed: boolean;
  /** Finished block asks, newest last. */
  blockJobs: AgentJob[];
  /** The block ask box that is open, if any. */
  ask: Ask | null;
  decisions: Map<string, Decision>;
  /** Recently accepted keys still showing "Applied · Undo". */
  applied: Set<string>;
  focus: string | null;
  error: string;
};

const keyOf = (job: string, id: string) => job + ':' + id;

/**
 * The one place Ann's review state lives while a page is open. The bar,
 * the in-place cards and the block ask box all read it, so a redraw of the
 * lesson never loses a card, a focus or a half-typed ask.
 */
export function createReviewStore() {
  const state: ReviewState = { review: null, closed: false, blockJobs: [], ask: null, decisions: new Map(), applied: new Set(), focus: null, error: '' };
  const listeners = new Set<() => void>();
  const emit = () => { for (const fn of [...listeners]) fn(); };

  function entries(job: AgentJob | null): Entry[] {
    return job?.status === 'done' ? (job.result?.proposals ?? []).map(p => ({ key: keyOf(job.job, p.id), job: job.job, proposal: p })) : [];
  }
  function decision(entry: Entry): Decision | undefined {
    const server = state.review?.job === entry.job ? state.review.decisions?.[entry.proposal.id] : state.blockJobs.find(j => j.job === entry.job)?.decisions?.[entry.proposal.id];
    return state.decisions.get(entry.key) ?? server;
  }
  /** Every suggestion still on show, in page order of their reviews (lesson review first). */
  function visible(): Entry[] {
    const all = [...(state.closed ? [] : entries(state.review)), ...state.blockJobs.flatMap(entries)];
    return all.filter(e => { const d = decision(e); return !d || d === 'stale' || state.applied.has(e.key); });
  }
  function pending(): Entry[] { return visible().filter(e => !decision(e)); }

  return {
    state,
    subscribe(fn: () => void) { listeners.add(fn); return () => listeners.delete(fn); },
    decision,
    visible,
    pending,
    setReview(job: AgentJob | null) {
      if (job?.job !== state.review?.job) { state.closed = false; state.focus = null; }
      state.review = job; emit();
    },
    closeReview() { state.closed = true; state.focus = null; emit(); },
    openAsk(blockId: string) { if (state.ask?.job?.status === 'working') { emit(); return; } state.ask = { blockId, text: '', job: null, error: '' }; emit(); },
    setAskText(text: string) { if (state.ask) state.ask.text = text; },
    setAskJob(job: AgentJob | null, error = '') {
      if (!state.ask) return;
      state.ask.job = job; state.ask.error = error;
      if (job?.status === 'done') { state.blockJobs = [...state.blockJobs.filter(j => j.job !== job.job), job]; state.ask = null; }
      emit();
    },
    closeAsk() { if (state.ask?.job?.status !== 'working') { state.ask = null; emit(); } },
    decide(key: string, value: Decision | null) {
      if (value) state.decisions.set(key, value); else state.decisions.delete(key);
      if (value === 'accepted') state.applied.add(key); else state.applied.delete(key);
      emit();
    },
    settle(key: string) { state.applied.delete(key); emit(); },
    /** Moves focus to the next (or previous) suggestion still waiting; returns it. */
    step(direction: 1 | -1): Entry | null {
      const list = pending();
      if (!list.length) { state.focus = null; emit(); return null; }
      const at = list.findIndex(e => e.key === state.focus);
      const next = list[at === -1 ? (direction === 1 ? 0 : list.length - 1) : (at + direction + list.length) % list.length];
      state.focus = next.key; emit();
      return next;
    },
    setError(message: string) { state.error = message; emit(); }
  };
}
export type ReviewStore = ReturnType<typeof createReviewStore>;
