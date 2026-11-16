// Classroom observation: the start panel. Who is observed → which kind (Proficient Teacher only for
// now) → which part this meeting is (Planning, Observing, Reflecting) → link an open observation for
// that person or start a new one. Nothing is saved until Start. Same side panel as the guides.
// Spec: docs/superpowers/specs/2026-11-16-classroom-observation-design.md ("Flow → Start").
import { getObservation, listObservations, saveObservation } from './api';
import { newObservation } from './model';
import type { ObservationPhase, ObservationSummary } from './types';

export interface ObservationStartOptions {
  /** People who can be observed: everyone in the room except you, staff first (the caller decides). */
  about: Array<{ ref: string; name: string }>;
  meetingId: string;
  /** YYYY-MM-DD, the meeting's own day. */
  meetingDate: string;
  supervisorName?: string;
  onLinked: (link: { id: string; phase: ObservationPhase }) => Promise<void>;
  now?: () => Date;
}

const KINDS: Array<{ id: string; name: string; line: string; live: boolean }> = [
  { id: 'nesa_proficient', name: 'Proficient Teacher', line: 'NESA observation report · 3 phases', live: true },
  { id: 'maintenance', name: 'Maintenance', line: 'Later', live: false },
  { id: 'hala', name: 'Highly Accomplished / Lead', line: 'Later', live: false },
  { id: 'walkthrough', name: 'Informal walkthrough', line: 'Later', live: false }
];

export const PHASE_CARDS: Array<{ phase: ObservationPhase; kicker: string; name: string; line: string }> = [
  { phase: 'planning', kicker: 'Before · Phase 1', name: 'Planning', line: 'You meet, agree the lesson and 2 to 4 Standard Descriptors, and set what you’ll look for. The teacher’s answers.' },
  { phase: 'observing', kicker: 'During · Phase 2', name: 'Observing', line: 'You watch the lesson. Planning comes over as quick keys. Tap to log what you see, then write it up.' },
  { phase: 'reflecting', kicker: 'After · Phase 3', name: 'Reflecting', line: 'Teacher’s reflection and your feedback for each descriptor, prefilled from the observation. Sign and export.' }
];

const EYE = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/></svg>';

/** `16 Nov` from `2026-11-16`. */
export function shortDay(ymd: string): string {
  const date = new Date(`${ymd}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return ymd;
  return new Intl.DateTimeFormat('en-AU', { timeZone: 'UTC', day: 'numeric', month: 'short' }).format(date);
}

export function openObservationStart(doc: Document, opts: ObservationStartOptions): { el: HTMLElement; close(): void } {
  const now = opts.now ?? (() => new Date());
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string) => {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const button = (label: string, className: string, part?: string) => {
    const b = el('button', className, label);
    b.type = 'button';
    if (part) b.dataset.part = part;
    return b;
  };

  const panel = el('aside', 'guide-panel guide obs-start');
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Classroom observation');
  const head = el('div', 'guide-panel__head');
  const closeBtn = button('✕', 'btn btn--ghost', 'obs-start-close');
  closeBtn.setAttribute('aria-label', 'Close classroom observation');
  head.append(el('b', undefined, 'Classroom observation'), closeBtn);
  const body = el('div', 'guide-panel__body');
  panel.append(head, body);
  doc.body.append(panel);

  let closed = false;
  const opener = doc.activeElement as HTMLElement | null;
  function close(): void {
    if (closed) return;
    closed = true;
    panel.remove();
    doc.removeEventListener('keydown', onKey);
    doc.defaultView?.removeEventListener('hashchange', close);
    if (opener && doc.contains(opener)) opener.focus();
  }
  const onKey = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') close();
  };
  doc.addEventListener('keydown', onKey);
  doc.defaultView?.addEventListener('hashchange', close);
  closeBtn.addEventListener('click', close);

  let whoRef = opts.about[0]?.ref ?? '';
  const kind = 'nesa_proficient';
  let phase: ObservationPhase | null = null;
  /** 'new', or the id of an open observation to link. */
  let choice: string | null = null;
  let open: ObservationSummary[] | null = null;
  let loadSeq = 0;
  let saving = false;

  // ── Who ──
  body.append(el('p', 'guide-panel__about', 'Who is being observed?'));
  if (!opts.about.length) body.append(el('p', 'guide-panel__empty', 'Add the teacher to the room first.'));
  const who = el('select', 'input guide-input');
  who.dataset.part = 'obs-who';
  who.setAttribute('aria-label', 'Who is being observed');
  for (const person of opts.about) who.append(Object.assign(el('option'), { value: person.ref, textContent: `${person.name} (in the room)` }));
  who.disabled = !opts.about.length;
  who.addEventListener('change', () => {
    whoRef = who.value;
    if (phase) void loadOpen();
  });
  body.append(who);

  // ── Shelf ──
  const shelf = el('div', 'obs-start__shelf');
  for (const k of KINDS) {
    const card = button('', 'guide-shelf-card obs-start__kind');
    card.dataset.kind = k.id;
    card.disabled = !k.live;
    if (k.live) card.setAttribute('aria-pressed', String(k.id === kind));
    const emblem = el('span', 'obs-start__emblem');
    if (k.live) emblem.innerHTML = EYE; // static markup, never user text
    else emblem.textContent = '·';
    const words = el('div');
    words.append(el('b', undefined, k.name), el('span', undefined, k.line));
    card.append(emblem, words);
    shelf.append(card);
  }
  body.append(shelf);

  // ── Which part ──
  body.append(el('h2', 'guide-step__title', 'Which part is this meeting?'));
  body.append(el('p', 'guide-hint', 'The whole observation, planning to reflecting, should be done within two weeks.'));
  const phases = el('div', 'obs-start__phases');
  phases.setAttribute('role', 'group');
  phases.setAttribute('aria-label', 'Which part is this meeting');
  for (const card of PHASE_CARDS) {
    const b = button('', 'obs-start__phase');
    b.dataset.phase = card.phase;
    b.setAttribute('aria-pressed', 'false');
    b.disabled = !opts.about.length;
    b.append(el('span', 'obs-start__kicker', card.kicker), el('b', undefined, card.name), el('span', 'obs-start__line', card.line));
    b.addEventListener('click', () => {
      phase = card.phase;
      for (const other of phases.querySelectorAll<HTMLButtonElement>('[data-phase]')) {
        other.setAttribute('aria-pressed', String(other.dataset.phase === phase));
      }
      void loadOpen();
    });
    phases.append(b);
  }
  body.append(phases);

  const choices = el('div', 'obs-start__choices');
  choices.dataset.part = 'obs-choices';
  const error = el('p', 'guide-panel__error');
  error.setAttribute('role', 'alert');
  const nav = el('div', 'guide-nav');
  const cancel = button('Cancel', 'btn btn--ghost', 'obs-start-cancel');
  cancel.addEventListener('click', close);
  const go = button('Start', 'btn btn--primary', 'obs-start-go');
  nav.append(cancel, go);
  body.append(choices, error, nav);

  const personName = () => opts.about.find((p) => p.ref === whoRef)?.name ?? '';

  function paintGo(): void {
    go.disabled = saving || !whoRef || !phase || !choice || open === null;
    const label = phase ? PHASE_CARDS.find((c) => c.phase === phase)!.name.toLowerCase() : '';
    go.textContent = choice && choice !== 'new' ? 'Link and start' : phase ? `Start ${label}` : 'Start';
  }

  function paintChoices(): void {
    choices.replaceChildren();
    if (!phase) return;
    if (open === null) {
      choices.append(el('p', 'guide-hint', 'Looking for open observations…'));
      return;
    }
    if (!open.length) {
      choices.append(el('p', 'guide-hint', phase === 'planning'
        ? `This starts a new observation for ${personName()}.`
        : `No open observation for ${personName()}. Start one here; the planning fields fill in at the top.`));
      return;
    }
    const option = (value: string, title: string, line: string) => {
      const b = button('', 'guide-about obs-start__choice');
      b.dataset.observation = value;
      b.setAttribute('aria-pressed', String(choice === value));
      b.append(el('b', undefined, title), el('span', 'guide-hint', line));
      b.addEventListener('click', () => {
        choice = value;
        paintChoices();
        paintGo();
      });
      choices.append(b);
    };
    for (const summary of open) {
      option(summary.id, `Open observation · ${summary.teacher_name} · started ${shortDay(summary.planned_on)}`, 'Its descriptors and look-fors come with it.');
    }
    option('new', 'Start a new one', `A fresh observation for ${personName()}.`);
  }

  async function loadOpen(): Promise<void> {
    const seq = ++loadSeq;
    open = null;
    choice = null;
    error.textContent = '';
    paintChoices();
    paintGo();
    let found: ObservationSummary[];
    try {
      found = await listObservations({ person_ref: whoRef, open: true });
    } catch {
      found = [];
      if (seq === loadSeq) error.textContent = 'Open observations couldn’t be loaded. You can still start a new one.';
    }
    if (closed || seq !== loadSeq) return;
    open = found.filter((summary) => summary.status === 'open');
    // Planning starts a new one unless you pick an open one; the later parts link the latest open one.
    choice = !open.length || phase === 'planning' ? 'new' : open[0]!.id;
    paintChoices();
    paintGo();
  }

  go.addEventListener('click', async () => {
    if (go.disabled || !phase || !choice) return;
    const person = opts.about.find((p) => p.ref === whoRef);
    if (!person) return;
    saving = true;
    paintGo();
    error.textContent = '';
    try {
      const stamp = now();
      const record = choice === 'new'
        ? newObservation({
          teacher: { person_ref: person.ref, name: person.name },
          supervisorName: opts.supervisorName ?? '',
          plannedOn: opts.meetingDate,
          meetingId: opts.meetingId,
          phase,
          now: stamp
        })
        : await getObservation(choice).then((existing) => ({
          ...existing,
          meetings: { ...existing.meetings, [phase!]: opts.meetingId },
          updated_at: stamp.toISOString()
        }));
      const saved = await saveObservation(record);
      await opts.onLinked({ id: saved.id, phase });
      close();
    } catch (err) {
      error.textContent = err instanceof Error && err.message ? `That didn’t save. ${err.message}` : 'That didn’t save. Try again.';
    } finally {
      saving = false;
      if (!closed) paintGo();
    }
  });

  paintGo();
  return { el: panel, close };
}
