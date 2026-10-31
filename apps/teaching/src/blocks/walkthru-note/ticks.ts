import { applyStepTick, repKey } from '../../../../../packages/walkthrus/reps.mjs';
import { classLabel } from '@/toolkit/class-context';
import { listReps, stepRep, type Rep } from './api';
import type { Slot } from './note';

/**
 * Step ticks on a WalkThru card in the lesson's teacher view: one circle per step, saved at once
 * against the lesson, the class and the technique (or fusion). Ticking derives the rep (every step
 * = Ran it, some = Partly). Never built for Display or for students: callers check ctx first.
 */

export interface TickClass { classId: string | null; label: string; endIso: string | null }

/**
 * The classes a tick can be saved against, one per class this lesson is timetabled for, and the
 * one to start on: the class whose lesson time is nearest now. A lesson on no timetable has one
 * open choice, saved as class `any`.
 */
export function pickTickClasses(slots: Slot[], now = Date.now()): { classes: TickClass[]; chosen: string | null } {
  const best = new Map<string, { slot: Slot; distance: number }>();
  for (const slot of slots) {
    if (!slot.classId) continue;
    const distance = slot.endIso ? Math.abs(Date.parse(slot.endIso) - now) : Infinity;
    const prev = best.get(slot.classId);
    if (!prev || distance < prev.distance) best.set(slot.classId, { slot, distance });
  }
  if (!best.size) return { classes: [{ classId: null, label: 'This lesson', endIso: null }], chosen: null };
  const rows = [...best.values()];
  const chosen = rows.reduce((a, b) => (b.distance < a.distance ? b : a)).slot.classId;
  const classes = rows
    .map(({ slot }) => ({ classId: slot.classId, label: classLabel(slot.classId!), endIso: slot.endIso }))
    .sort((a, b) => a.label.localeCompare(b.label));
  return { classes, chosen };
}

/** Keeps the step ticks and the after-lesson strip of one card showing the same rep. */
export class RepSync {
  private listeners = new Set<(key: string, rep: Rep | null, from: unknown) => void>();
  set(key: string, rep: Rep | null, from: unknown): void { for (const fn of this.listeners) fn(key, rep, from); }
  on(fn: (key: string, rep: Rep | null, from: unknown) => void): void { this.listeners.add(fn); }
}

export interface StepTicks {
  /** The class chooser (when there is more than one class), the rep state, and any save message. */
  el: HTMLElement;
  /** The tick circle for step `n`. */
  button(n: number): HTMLButtonElement;
}

const STATE_LABEL: Partial<Record<Rep['state'], string>> = { ran: 'Ran it', partly: 'Partly' };

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function createStepTicks(opts: { techniqueId: string; lessonId: string; slots: Slot[]; total: number; sync?: RepSync; now?: number }): StepTicks {
  const { techniqueId, lessonId, total, sync } = opts;
  const { classes, chosen } = pickTickClasses(opts.slots, opts.now);
  let current = classes.find((c) => c.classId === chosen) ?? classes[0]!;
  const byKey = new Map<string, Rep>();
  const buttons = new Map<number, HTMLButtonElement>();
  let chain: Promise<unknown> = Promise.resolve();

  const bar = el('div', 'tk-wt__tickbar');
  const state = el('span', 'tk-wt__tickstate');
  const msg = el('span', 'tk-wt__tickmsg block-secondary');
  msg.setAttribute('role', 'status');

  const keyOf = (c: TickClass): string => repKey(lessonId, c.classId);

  const paint = (): void => {
    const rep = byKey.get(keyOf(current));
    const done = new Set(rep?.steps_done ?? []);
    for (const [n, b] of buttons) {
      const on = done.has(n);
      b.setAttribute('aria-pressed', String(on));
      b.classList.toggle('is-done', on);
    }
    state.textContent = rep ? STATE_LABEL[rep.state] ?? '' : '';
  };

  if (classes.length > 1) {
    const chooser = el('div', 'tk-wt__tickclasses');
    chooser.setAttribute('role', 'group');
    chooser.setAttribute('aria-label', 'Class for the ticks');
    const paintChooser = (): void => {
      for (const b of chooser.querySelectorAll<HTMLButtonElement>('button')) b.setAttribute('aria-pressed', String(b.dataset.classId === (current.classId ?? '')));
    };
    for (const c of classes) {
      const b = el('button', 'tk-wt__tickclass', c.label);
      b.type = 'button';
      b.dataset.classId = c.classId ?? '';
      b.addEventListener('click', () => {
        current = c;
        msg.textContent = '';
        paintChooser();
        paint();
      });
      chooser.append(b);
    }
    paintChooser();
    bar.append(chooser);
  }
  bar.append(state, msg);

  const toggle = (n: number): void => {
    const target = current;
    const key = keyOf(target);
    const prev = byKey.get(key) ?? null;
    const done = !(prev?.steps_done ?? []).includes(n);
    const fresh: Rep = { technique_id: techniqueId, lesson_id: lessonId, class_id: target.classId, goal_id: null, state: 'planned', note: '', lesson_end: target.endIso, steps_done: [], at: new Date().toISOString() };
    const optimistic = applyStepTick(prev, { step: n, done, steps_total: total, fresh }) as Rep | null;
    if (optimistic) byKey.set(key, optimistic); else byKey.delete(key);
    msg.textContent = '';
    paint();
    chain = chain
      .then(() => stepRep({ technique_id: techniqueId, lesson_id: lessonId, class_id: target.classId, lesson_end: target.endIso, step: n, done, steps_total: total }))
      .then((next) => {
        if (next) byKey.set(key, next); else byKey.delete(key);
        sync?.set(key, next, bar);
        paint();
      })
      .catch(() => {
        if (prev) byKey.set(key, prev); else byKey.delete(key);
        msg.textContent = 'That tick didn’t save. Try again.';
        paint();
      });
  };

  sync?.on((key, rep, from) => {
    if (from === bar) return;
    if (rep) byKey.set(key, rep); else byKey.delete(key);
    paint();
  });

  listReps(techniqueId)
    .then((reps) => {
      for (const rep of reps) if (rep.lesson_id === lessonId && !byKey.has(repKey(rep.lesson_id, rep.class_id))) byKey.set(repKey(rep.lesson_id, rep.class_id), rep);
      paint();
    })
    .catch(() => { msg.textContent = 'Ticks couldn’t be loaded.'; });

  return {
    el: bar,
    button(n: number): HTMLButtonElement {
      let b = buttons.get(n);
      if (!b) {
        b = el('button', 'tk-wt__tick');
        b.type = 'button';
        b.setAttribute('aria-label', `Did step ${n} in class`);
        b.setAttribute('aria-pressed', 'false');
        const step = n;
        b.addEventListener('click', () => toggle(step));
        buttons.set(n, b);
        paint();
      }
      return b;
    }
  };
}
