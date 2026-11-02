import { apiGet } from '@/api/client';
import { el } from '@/quiz/dom';
import { mountDeepMonitor } from '@/deep/monitor-view';
import type { LessonLike } from '@/deep/editor';
import type { Unit } from '@/schemas';
import type { ScheduledLesson } from '@/schemas/scheduled-lesson';

/**
 * The By deep understanding lens of the Grid: the Monitoring lanes, mounted as
 * they were on the unit page. One pane is kept between redraws so an open
 * student, the chosen understanding and the loaded class are not lost when the
 * markbook repaints. Units, lessons and progress load when the lens first opens.
 */
export type DeepLensOptions = {
  classId: string;
  classLabel: string;
  /** The class's active units. Only those with deep understandings can be monitored. */
  units: readonly Unit[];
  currentUnitId?: string;
  scheduled: readonly ScheduledLesson[];
  /** Preferred unit, e.g. from the link on a unit page. */
  unitId?: string;
  /** Test seams. */
  loadLessons?: (unit: Unit) => Promise<LessonLike[]>;
  mount?: typeof mountDeepMonitor;
};

const loadUnitLessons = (unit: Unit): Promise<LessonLike[]> =>
  Promise.all(unit.lesson_ids.map((id) => apiGet<LessonLike>(`/api/lessons/${id}`).catch(() => null))).then((rows) => rows.filter((l): l is LessonLike => !!l));

/** Which unit Monitoring opens on: the one asked for, else the class's current unit, else the first with deep understandings. */
export function monitorUnit(units: readonly Unit[], currentUnitId: string | undefined, wanted?: string): Unit | null {
  const planned = units.filter((u) => (u.deep_understandings ?? []).length > 0);
  return planned.find((u) => u.id === wanted) ?? planned.find((u) => u.id === currentUnitId) ?? planned[0] ?? null;
}

export function createDeepLens(options: DeepLensOptions): { pane: HTMLElement; open: () => void; destroy: () => void } {
  const pane = el('div', 'mbg-deep');
  const picker = el('div', 'mbg-deep__units');
  picker.setAttribute('role', 'group');
  picker.setAttribute('aria-label', 'Unit');
  const stage = el('div', 'mbg-deep__stage');
  pane.append(picker, stage);
  const planned = options.units.filter((u) => (u.deep_understandings ?? []).length > 0);
  const mount = options.mount ?? mountDeepMonitor;
  const loadLessons = options.loadLessons ?? loadUnitLessons;
  let current: Unit | null = null;
  let handle: { destroy: () => void } | null = null;
  let disposed = false;
  let started = false;

  function paintPicker(): void {
    picker.replaceChildren();
    picker.hidden = planned.length < 2;
    for (const unit of planned) {
      const b = el('button', 'ev-switch__pill', unit.title);
      b.type = 'button';
      b.setAttribute('aria-pressed', String(unit.id === current?.id));
      b.addEventListener('click', () => {
        if (unit.id === current?.id) return;
        void show(unit);
      });
      picker.append(b);
    }
  }

  async function show(unit: Unit): Promise<void> {
    current = unit;
    handle?.destroy();
    handle = null;
    paintPicker();
    stage.replaceChildren(el('p', 'mb__status', 'Loading this unit…'));
    let lessons: LessonLike[];
    try {
      lessons = await loadLessons(unit);
    } catch {
      if (!disposed && current === unit) stage.replaceChildren(el('p', 'mb__empty', 'Could not load this unit’s lessons. Try again in a moment.'));
      return;
    }
    if (disposed || current !== unit) return;
    const host = el('div', 'mbg-deep__monitor');
    stage.replaceChildren(host);
    handle = mount(host, {
      unit,
      deep: (unit.deep_understandings ?? []).map((d) => ({ ...d, pieces: d.pieces.filter((p) => p.text.trim()) })),
      lessons,
      classes: [{ id: options.classId, label: options.classLabel }],
      scheduled: options.scheduled.filter((r) => r.unit_id === unit.id)
    });
  }

  return {
    pane,
    open() {
      if (started || disposed) return;
      started = true;
      const first = monitorUnit(options.units, options.currentUnitId, options.unitId);
      if (!first) {
        stage.replaceChildren(el('p', 'mb__empty', 'No unit this class is teaching has deep understandings yet. Plan one on the unit page, under Deep understandings.'));
        picker.hidden = true;
        return;
      }
      void show(first);
    },
    destroy() {
      disposed = true;
      handle?.destroy();
    }
  };
}
