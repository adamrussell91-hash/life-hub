import type { Organiser, OrganiserChange } from './types';

/** Set for this week: a section, a due date and a reason, shown as a banner on the student's Organiser tab. */
export function renderWeekRow(org: Organiser, send: (change: OrganiserChange) => unknown): HTMLElement {
  const draft = org.week ? { ...org.week } : { section_id: '', due: '', reason: '' };
  const box = document.createElement('details');
  box.className = 'ko-more';
  const summary = document.createElement('summary');
  const named = org.sections.find((s) => s.id === org.week?.section_id)?.name;
  summary.textContent = named ? `Set for this week: ${named}` : 'Set for this week';
  box.append(summary);

  const save = (): void => {
    if (!draft.section_id) {
      if (org.week) send({ op: 'set_week', week: null });
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.due)) return;
    send({ op: 'set_week', week: { section_id: draft.section_id, due: draft.due, reason: draft.reason.trim().slice(0, 80) } });
  };

  const row = document.createElement('div');
  row.className = 'ko-setbox';
  const section = document.createElement('select');
  section.setAttribute('aria-label', 'Section to practise');
  section.append(new Option('No section', ''));
  for (const s of org.sections.filter((x) => !x.off && x.lines.length)) section.append(new Option(s.name, s.id));
  section.value = draft.section_id;
  section.addEventListener('change', () => { draft.section_id = section.value; save(); });
  const date = document.createElement('input');
  date.type = 'date';
  date.value = draft.due;
  date.setAttribute('aria-label', 'Due date');
  date.addEventListener('change', () => { draft.due = date.value; save(); });
  const why = document.createElement('input');
  why.type = 'text';
  why.maxLength = 80;
  why.placeholder = 'Week 3 Review';
  why.value = draft.reason;
  why.setAttribute('aria-label', 'Reason');
  why.addEventListener('change', () => { draft.reason = why.value; save(); });
  const by = document.createElement('span');
  by.textContent = 'by';
  const forWhat = document.createElement('span');
  forWhat.textContent = 'for';
  row.append(section, by, date, forWhat, why);
  box.append(row);
  return box;
}
