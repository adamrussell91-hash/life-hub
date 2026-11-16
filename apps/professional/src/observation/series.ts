/**
 * Series strip: Planning · Observing · Reflecting, each with its meeting's date or "Not booked", plus the
 * two-week line and a quiet Unlink. Later phases with no meeting can be booked from here.
 */
import { getMeeting } from '@/api/meetings';
import { windowDay, windowTone } from './model';
import { OBSERVATION_PHASES, type ObservationPhase } from './types';
import { dayLabel, formatDay, h, type ObsCtx, type ObsView } from './ui';

const PHASE_NAMES: Record<ObservationPhase, string> = { planning: 'Planning', observing: 'Observing', reflecting: 'Reflecting' };

export interface SeriesOptions {
  phase: ObservationPhase;
  meetingId: string;
  meetingDate: string;
  openMeeting: (meetingId: string) => void;
  makeLinkedMeeting: (phase: ObservationPhase, date: string) => Promise<string>;
  onUnlink: () => Promise<void>;
  /** The workspace's save status, shown at the end of the window line. */
  status: HTMLElement;
}

function meetingDay(scheduledStart: string, timeZone: string): string {
  const t = Date.parse(scheduledStart);
  return Number.isFinite(t) ? formatDay(t, timeZone) : '';
}

export function mountSeries(ctx: ObsCtx, opts: SeriesOptions): ObsView {
  const { doc } = ctx;
  const el = h(doc, 'div', { class: 'obs-series-wrap' });
  const strip = h(doc, 'div', { class: 'obs-series', 'data-part': 'obs-series' });
  const windowLine = h(doc, 'div', { class: 'obs-window', 'data-part': 'obs-window' });
  const dates = new Map<string, string>();
  const errors = new Map<ObservationPhase, string>();
  let destroyed = false;
  const currentIndex = OBSERVATION_PHASES.indexOf(opts.phase);

  function fetchDate(id: string): void {
    if (dates.has(id)) return;
    dates.set(id, '');
    getMeeting(id)
      .then(({ meeting }) => {
        dates.set(id, meetingDay(meeting.scheduled_start, meeting.time_zone));
        if (!destroyed) renderStrip();
      })
      .catch(() => {
        dates.set(id, 'Meeting');
        if (!destroyed) renderStrip();
      });
  }

  function renderStrip(): void {
    const obs = ctx.obs();
    strip.replaceChildren(...OBSERVATION_PHASES.map((phase, i) => {
      const title = h(doc, 'b', {}, `${i + 1} · ${PHASE_NAMES[phase]}`);
      if (phase === opts.phase) {
        return h(doc, 'div', { class: 'obs-series__step is-now', 'data-phase': phase, 'aria-current': 'step' },
          title, h(doc, 'span', { class: 'obs-series__sub' }, `This meeting · ${dayLabel(opts.meetingDate)}`));
      }
      const id = obs.meetings[phase];
      if (id) {
        fetchDate(id);
        const done = i < currentIndex;
        const btn = h(doc, 'button', { type: 'button', class: `obs-series__step${done ? ' is-done' : ''}`, 'data-phase': phase },
          title, h(doc, 'span', { class: 'obs-series__sub' }, dates.get(id) || 'Booked'));
        btn.addEventListener('click', () => opts.openMeeting(id));
        return btn;
      }
      if (i < currentIndex) {
        return h(doc, 'div', { class: 'obs-series__step', 'data-phase': phase }, title, h(doc, 'span', { class: 'obs-series__sub' }, 'Not booked'));
      }
      // A later phase with no meeting yet: book it here.
      const date = h(doc, 'input', { type: 'date', class: 'obs-input obs-input--date', 'aria-label': `Date for ${PHASE_NAMES[phase]}` });
      const make = h(doc, 'button', { type: 'button', class: 'obs-btn obs-btn--sm', 'data-part': 'obs-make-meeting', disabled: true }, 'Make linked meeting');
      date.addEventListener('input', () => { make.disabled = !date.value; });
      make.addEventListener('click', async () => {
        if (!date.value) return;
        make.disabled = true;
        make.textContent = 'Making…';
        errors.delete(phase);
        try {
          const newId = await opts.makeLinkedMeeting(phase, date.value);
          ctx.change((o) => ({ ...o, meetings: { ...o.meetings, [phase]: newId } }), 'now');
          dates.set(newId, dayLabel(date.value));
        } catch {
          errors.set(phase, 'Couldn’t make the meeting. Try again.');
        }
        if (!destroyed) renderStrip();
      });
      const err = errors.get(phase);
      return h(doc, 'div', { class: 'obs-series__step is-open', 'data-phase': phase },
        title,
        h(doc, 'span', { class: 'obs-series__sub' }, 'Not booked'),
        h(doc, 'div', { class: 'obs-series__book' }, date, make),
        err ? h(doc, 'span', { class: 'obs-error', role: 'alert' }, err) : null);
    }));
  }

  function renderWindow(): void {
    const obs = ctx.obs();
    const day = windowDay(obs.planned_on, ctx.now());
    const unlink = h(doc, 'button', { type: 'button', class: 'obs-btn obs-btn--sm obs-btn--quiet', 'data-part': 'obs-unlink' }, 'Unlink');
    unlink.addEventListener('click', async () => {
      unlink.disabled = true;
      try { await opts.onUnlink(); } finally { unlink.disabled = false; }
    });
    let line: HTMLElement;
    if (day < 1) {
      line = h(doc, 'span', {}, 'Planning to reflecting within two weeks, from ', h(doc, 'b', {}, dayLabel(obs.planned_on)), '.');
    } else {
      const tone = windowTone(day);
      windowLine.dataset.tone = tone;
      line = h(doc, 'span', {}, 'Planning to reflecting within two weeks: ', h(doc, 'b', {}, `day ${day} of 14`),
        tone === 'rose' ? ' · past two weeks' : tone === 'amber' ? ' · nearly there' : '');
    }
    windowLine.replaceChildren(line, h(doc, 'span', { class: 'obs-spacer' }), opts.status, unlink);
  }

  renderStrip();
  renderWindow();
  el.append(strip, windowLine);
  return { el, destroy() { destroyed = true; } };
}
