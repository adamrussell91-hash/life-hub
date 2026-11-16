/**
 * Classroom observation workspace: what shows under "Guides in this meeting" when a meeting is linked
 * to an observation. Loads the record, shows the series strip, then this meeting's phase (Planning,
 * Observing or Reflecting). One record, saved whole: typing waits ~600ms, everything else saves at once.
 * Spec: docs/superpowers/specs/2026-11-16-classroom-observation-design.md
 */
import { getObservation, saveObservation } from './api';
import { mountObserving } from './observing';
import { mountPlanning } from './planning';
import { mountReflecting } from './reflecting';
import { mountSeries } from './series';
import type { Observation, ObservationPhase } from './types';
import { h, type ObsCtx, type ObsView } from './ui';

export interface ObservationWorkspaceOptions {
  document: Document;
  observationId: string;
  phase: ObservationPhase;
  meetingId: string;
  /** YYYY-MM-DD */
  meetingDate: string;
  openMeeting: (meetingId: string) => void;
  /** Makes the next meeting, linked and set to `phase`; returns its id. */
  makeLinkedMeeting: (phase: ObservationPhase, date: string) => Promise<string>;
  onUnlink: () => Promise<void>;
}

const SAVE_DELAY_MS = 600;

export function mountObservationWorkspace(host: HTMLElement, opts: ObservationWorkspaceOptions): { destroy(): void } {
  const doc = opts.document;
  const root = h(doc, 'section', { class: 'obs', 'data-part': 'observation-workspace', 'data-phase': opts.phase, 'aria-label': 'Classroom observation' });
  host.append(root);

  let obs: Observation | null = null;
  /** The latest copy the server returned. */
  let server: Observation | null = null;
  let destroyed = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let inFlight = false;
  let queued = false;
  const views: ObsView[] = [];

  const status = h(doc, 'span', { class: 'obs-save', 'data-part': 'obs-save', role: 'status', 'aria-live': 'polite' });

  function setStatus(kind: 'idle' | 'pending' | 'saving' | 'saved' | 'error'): void {
    if (destroyed) return;
    status.dataset.state = kind;
    if (kind === 'error') {
      const retry = h(doc, 'button', { type: 'button', class: 'obs-btn obs-btn--sm obs-btn--quiet', 'data-part': 'obs-save-retry' }, 'Retry');
      retry.addEventListener('click', () => void saveNow());
      status.replaceChildren('Couldn’t save · ', retry);
    } else {
      status.replaceChildren(kind === 'saving' || kind === 'pending' ? 'Saving…' : kind === 'saved' ? 'Saved' : '');
    }
  }

  async function saveNow(): Promise<void> {
    if (timer) { clearTimeout(timer); timer = null; }
    if (!obs) return;
    if (inFlight) { queued = true; return; }
    inFlight = true;
    setStatus('saving');
    try {
      const saved = await saveObservation(obs);
      server = saved;
      if (obs) obs = { ...obs, updated_at: saved.updated_at };
      setStatus(queued ? 'saving' : 'saved');
    } catch {
      setStatus('error');
    } finally {
      inFlight = false;
      if (queued) { queued = false; void saveNow(); }
    }
  }

  const ctx: ObsCtx = {
    doc,
    obs: () => obs as Observation,
    change(fn, when) {
      if (!obs) return;
      obs = fn(obs);
      if (when === 'now') { void saveNow(); return; }
      if (timer) clearTimeout(timer);
      setStatus('pending');
      timer = setTimeout(() => void saveNow(), SAVE_DELAY_MS);
    },
    now: () => new Date()
  };

  function clearViews(): void {
    while (views.length) views.pop()!.destroy();
  }

  function showLoading(): void {
    root.replaceChildren(h(doc, 'p', { class: 'obs-muted', 'data-part': 'obs-loading' }, 'Loading the observation…'));
  }

  function showError(): void {
    const retry = h(doc, 'button', { type: 'button', class: 'obs-btn obs-btn--sm', 'data-part': 'obs-load-retry' }, 'Retry');
    retry.addEventListener('click', () => void load());
    root.replaceChildren(h(doc, 'p', { class: 'obs-error', 'data-part': 'obs-load-error', role: 'alert' }, 'Couldn’t load the observation. ', retry));
  }

  function render(): void {
    clearViews();
    const series = mountSeries(ctx, {
      phase: opts.phase,
      meetingId: opts.meetingId,
      meetingDate: opts.meetingDate,
      openMeeting: opts.openMeeting,
      makeLinkedMeeting: opts.makeLinkedMeeting,
      onUnlink: opts.onUnlink,
      status
    });
    views.push(series);
    const mount = opts.phase === 'planning' ? mountPlanning : opts.phase === 'observing' ? mountObserving : mountReflecting;
    const view = mount(ctx);
    views.push(view);
    root.replaceChildren(series.el, view.el);
  }

  async function load(): Promise<void> {
    showLoading();
    try {
      const loaded = await getObservation(opts.observationId);
      if (destroyed) return;
      obs = loaded;
      server = loaded;
      render();
    } catch {
      if (!destroyed) showError();
    }
  }

  void load();

  return {
    destroy() {
      if (destroyed) return;
      // Anything typed in the last 600ms still goes to the server.
      if (timer && obs && obs !== server) void saveNow();
      destroyed = true;
      clearViews();
      root.remove();
    }
  };
}
