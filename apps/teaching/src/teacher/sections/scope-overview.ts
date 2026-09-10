import { navigate } from '@/app/router';
import { pastelFromId } from '@/design/pastel';
import type { ScopeSequence, Subject, TimelineItem, Unit } from '@/schemas';
import type { CurriculumResponse } from '@/teacher/nav';

export function barPositionStyle(
  startWeek: number,
  endWeek: number,
  weekCount: number
): string {
  const left = ((startWeek - 1) / weekCount) * 100;
  const width = ((endWeek - startWeek + 1) / weekCount) * 100;
  return `left:${left}%;width:${width}%`;
}

export function subjectsWithScope(
  curriculum: CurriculumResponse
): Array<{ subject: Subject; scope: ScopeSequence }> {
  const scopesById = new Map(curriculum.scope_sequences.map((scope) => [scope.id, scope]));
  const rows: Array<{ subject: Subject; scope: ScopeSequence }> = [];

  for (const subject of [...curriculum.subjects].sort((a, b) =>
    a.title.localeCompare(b.title)
  )) {
    if (!subject.scope_id) continue;
    const scope = scopesById.get(subject.scope_id);
    if (!scope) continue;
    rows.push({ subject, scope });
  }

  return rows;
}

function itemLabel(item: TimelineItem, unitsById: Map<string, Unit>): string {
  if (item.kind === 'note') return item.title;
  return unitsById.get(item.unit_id)?.title ?? 'Unknown unit';
}

function bindNavigate(anchor: HTMLAnchorElement, path: string): void {
  anchor.addEventListener('click', (event) => {
    event.preventDefault();
    navigate(path);
  });
}

/**
 * Overall year Gantt: term bands + one spacious row per subject that has a scope.
 */
export function renderScopeOverview(
  host: HTMLElement,
  curriculum: CurriculumResponse
): void {
  host.replaceChildren();

  const rows = subjectsWithScope(curriculum);
  if (rows.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'teacher-layout__canvas-status';
    empty.textContent = 'No scope & sequences yet. Create one to start the year timeline.';
    host.append(empty);
    return;
  }

  const weekCount = Math.max(...rows.map(({ scope }) => scope.week_count));
  const terms = rows[0]!.scope.terms;
  const unitsById = new Map(curriculum.units.map((unit) => [unit.id, unit]));

  const overview = document.createElement('div');
  overview.className = 'scope-overview glass-panel';

  const termsRow = document.createElement('div');
  termsRow.className = 'scope-overview__terms';
  termsRow.style.setProperty('--week-count', String(weekCount));

  for (const term of terms) {
    const band = document.createElement('div');
    band.className = 'scope-overview__term';
    band.style.cssText = barPositionStyle(term.start_week, term.end_week, weekCount);
    band.textContent = term.title;
    termsRow.append(band);
  }

  const rowsHost = document.createElement('div');
  rowsHost.className = 'scope-overview__rows';

  for (const { subject, scope } of rows) {
    const row = document.createElement('div');
    row.className = 'scope-overview__row';
    row.dataset.subjectId = subject.id;

    const subjectPath = `/scope-sequences/${subject.id}`;
    const label = document.createElement('a');
    label.className = 'scope-overview__label';
    label.href = subjectPath;
    label.textContent = subject.title;
    bindNavigate(label, subjectPath);

    const track = document.createElement('div');
    track.className = 'scope-overview__track';
    track.style.setProperty('--week-count', String(weekCount));

    const sortedItems = [...scope.timeline_items].sort(
      (a, b) => a.order - b.order || a.start_week - b.start_week
    );

    for (const item of sortedItems) {
      const bar = document.createElement('a');
      bar.className = `scope-overview__bar scope-overview__bar--${item.kind}`;
      bar.dataset.scopeBarKind = item.kind;
      bar.style.cssText = barPositionStyle(item.start_week, item.end_week, weekCount);
      bar.textContent = itemLabel(item, unitsById);
      bar.title = itemLabel(item, unitsById);

      if (item.kind === 'unit') {
        const path = `/units/${item.unit_id}`;
        bar.href = path;
        bar.dataset.unitId = item.unit_id;
        bar.dataset.tint = pastelFromId(item.unit_id);
        bindNavigate(bar, path);
      } else {
        const path = `/scope-sequences/${subject.id}?selectNote=${encodeURIComponent(item.id)}`;
        bar.href = path;
        bar.dataset.noteId = item.id;
        bindNavigate(bar, path);
      }

      track.append(bar);
    }

    row.append(label, track);
    rowsHost.append(row);
  }

  overview.append(termsRow, rowsHost);
  host.append(overview);
}
