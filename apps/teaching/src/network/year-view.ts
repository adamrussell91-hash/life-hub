import { apiPatch } from '@/api/client';
import { subjectUsesAlignment } from '@/alignment/model';
import type { Subject } from '@/schemas';
import { resolveScheduleToday } from '@/schedule/today';
import type { CurriculumResponse } from '@/teacher/nav';
import { saveSubjectLines, yearNetworkUnits } from '@/teacher/network-context';
import { mountNetworkStage, networkLegend } from './draw';
import { liveNudges } from './layout';
import { el, ghostButton, mountLinesEditor, selectOf } from './lines-editor';
import { buildYearNetwork, classNow, outcomeCoverage } from './year';

const LEVEL_WORD = { introduced: 'Introduced', reinforced: 'Reinforced', mastered: 'Mastered' } as const;

/**
 * The year as a network (teacher, Scope & Sequence → Network): units are
 * stations in scope order, the subject's lines run through them to the HSC,
 * the class-now dot shows where a class is, and the outcome panel lists what
 * each outcome reaches. Drag a unit to nudge it; tap one to open its plan.
 */
export function mountYearNetworkView(host: HTMLElement, curriculum: CurriculumResponse, subjectId: string): void {
  const subject = curriculum.subjects.find((s) => s.id === subjectId);
  if (!subject) return;
  const classes = curriculum.classes.filter((c) => c.subject_id === subjectId && c.status !== 'archived' && c.status !== 'trashed');
  let classId = classes[0]?.id ?? '';
  let linesOpen = false;

  const root = el('div', 'net-year');
  host.replaceChildren(root);

  async function saveNudge(unitId: string, across: number, along: number): Promise<void> {
    const was = subject!.network_nudges?.[unitId] ?? { dx: 0, dy: 0 };
    const units = yearNetworkUnits(curriculum, subjectId);
    const next = liveNudges({ ...(subject!.network_nudges ?? {}), [unitId]: { dx: was.dx + across, dy: was.dy + along } }, units.map((u) => u.id));
    subject!.network_nudges = next;
    paint();
    try {
      await apiPatch<Subject>(`/api/subjects/${subjectId}`, { network_nudges: next });
    } catch {
      window.alert('Could not save the new position. Try again.');
    }
  }

  function toolbar(): HTMLElement {
    const bar = el('div', 'net-year__bar');
    if (classes.length) {
      const pick = selectOf(
        [{ value: '', label: 'No class' }, ...classes.map((c) => ({ value: c.id, label: c.display_name || c.title || 'Class' }))],
        classId,
        'Show where a class is now'
      );
      pick.addEventListener('change', () => { classId = pick.value; paint(); });
      const label = el('label', 'net-year__field');
      label.append(el('span', undefined, 'Class now'), pick);
      bar.append(label);
    }
    const lines = ghostButton(linesOpen ? 'Hide lines' : 'Edit lines', () => { linesOpen = !linesOpen; paint(); });
    lines.setAttribute('aria-expanded', String(linesOpen));
    bar.append(lines);
    if (Object.keys(subject!.network_nudges ?? {}).length) {
      bar.append(ghostButton('Reset positions', () => {
        subject!.network_nudges = {};
        paint();
        void apiPatch<Subject>(`/api/subjects/${subjectId}`, { network_nudges: {} }).catch(() => window.alert('Could not save. Try again.'));
      }));
    }
    bar.append(el('span', 'net-year__hint', 'Tap a unit to open its plan. Drag one to tidy the map.'));
    return bar;
  }

  function linesPanel(): HTMLElement {
    const panel = el('div', 'net-year__lines');
    panel.append(el('h3', 'net-year__heading', 'Lines'));
    panel.append(el('p', 'net-year__hint', 'Every unit map in this subject and this network share these lines. Trains are syllabus groupings, metro lines are concepts, light rail is skills.'));
    const units = yearNetworkUnits(curriculum, subjectId);
    mountLinesEditor(panel, {
      lines: subject!.network_lines ?? [],
      syllabus: subjectUsesAlignment(subject!.title),
      onSave: async (next) => {
        await saveSubjectLines(curriculum, subjectId, next);
        paintMap();
      },
      usage: (lineId) => units.flatMap((u) => u.lessons.filter((l) => l.line_stops?.some((s) => s.line_id === lineId)).map((l) => `${u.title}: ${l.title || 'untitled lesson'}`))
    });
    return panel;
  }

  function coveragePanel(): HTMLElement {
    const panel = el('aside', 'net-year__coverage');
    panel.append(el('h3', 'net-year__heading', 'Outcome coverage'));
    const outcomes = (curriculum.outcomes ?? []).filter((o) => subject!.outcome_ids.includes(o.id));
    if (!outcomes.length) {
      panel.append(el('p', 'net-year__hint', 'Add outcomes to this subject to see where each one is taught.'));
      return panel;
    }
    const rows = outcomeCoverage(outcomes.map((o) => ({ id: o.id, code: o.code, title: o.description })), yearNetworkUnits(curriculum, subjectId), subject!.network_lines ?? []);
    const list = el('ul', 'net-year__outcomes');
    for (const row of rows) {
      const item = el('li', `net-year__outcome${row.flagged ? ' net-year__outcome--flagged' : ''}`);
      const head = el('div', 'net-year__outcome-head');
      head.append(el('strong', undefined, row.code || 'Outcome'));
      head.append(el('span', `net-year__depth${row.level ? ` net-year__depth--${row.level}` : ''}`, row.flagged ? 'Not tagged' : row.level ? LEVEL_WORD[row.level] : 'No line depth'));
      item.append(head);
      if (row.title) item.append(el('p', 'net-year__outcome-text', row.title));
      item.append(el('p', 'net-year__outcome-units', row.flagged ? 'No lesson tags this outcome yet.' : row.units.map((u) => u.title).join(' · ')));
      list.append(item);
    }
    panel.append(list);
    return panel;
  }

  const mapHost = el('div', 'net-year__map');
  function paintMap(): void {
    const units = yearNetworkUnits(curriculum, subjectId);
    const lines = subject!.network_lines ?? [];
    if (!units.length || !lines.length) {
      mapHost.replaceChildren(el('p', 'net-empty', !lines.length
        ? 'No lines yet. Add this subject’s lines (Edit lines), then tag lessons with the lines they serve.'
        : 'Add units to the Scope & Sequence to see them on the network.'));
      return;
    }
    const schedule = curriculum.scheduled_lessons.filter((row) => row.class_id === classId);
    const now = classId ? classNow(units, schedule, resolveScheduleToday(curriculum.schedule_anchor_date)) : undefined;
    const input = buildYearNetwork(lines, units, { nudges: subject!.network_nudges ?? {}, ...(now ? { now } : {}) });
    mapHost.replaceChildren(
      mountNetworkStage(input, { label: `${subject!.title} year network`, nudgeRows: true, onNudge: (key, across, along) => void saveNudge(key, across, along) }),
      networkLegend('year')
    );
  }

  function paint(): void {
    paintMap();
    const body = el('div', 'net-year__body');
    body.append(mapHost, coveragePanel());
    root.replaceChildren(toolbar(), ...(linesOpen ? [linesPanel()] : []), body);
  }
  paint();
}
