import type { Project } from '@/schemas/project';
import type { ExcursionTemplate } from '@/schemas/templates';
import type { SchoolTerm } from '@/domain/school-time';
import { addDaysKey, termAt } from '@/domain/school-time';
import { leadTimeSlack } from '@/domain/excursion';
import { newExcursionHash } from '@/domain/cards';
import {
  openFolderNames,
  tightestNotice,
  type UsualCall
} from '@/domain/excursion-desk';
import { formatDisplayDate } from '../../design-kit/js/format-display-date.js';
import { el } from '@/views/hub-kit';

export const EXCURSION_CARRY_KEY = 'tasks-hub:excursion-carry';

export type DeskModel = {
  terms: SchoolTerm[];
  excursions: Project[];
  usual: UsualCall[];
  closed: Project[];
  template: ExcursionTemplate | null;
  today: string;
  proposedDate: string;
  historyId: string | null;
  placedId: string | null;
  carry: Set<string>;
};

export type DeskHandlers = {
  onPropose: (date: string) => void;
  onSelectHistory: (id: string) => void;
  onPlace: (call: UsualCall) => void;
  onToggleCarry: (name: string, on: boolean) => void;
};

function planHash(templateId: string | undefined, date: string, title: string): string {
  const base = newExcursionHash(templateId);
  const [path, query = ''] = base.split('?');
  const params = new URLSearchParams(query);
  params.set('date', date);
  if (title) params.set('title', title);
  return `${path}?${params.toString()}`;
}

function stashCarry(names: string[]): void {
  sessionStorage.setItem(EXCURSION_CARRY_KEY, JSON.stringify(names));
}

export function readExcursionCarry(): string[] {
  try {
    const raw = sessionStorage.getItem(EXCURSION_CARRY_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function slackList(template: ExcursionTemplate, date: string): HTMLElement {
  const list = el('ul', 'excursion-desk__slack');
  for (const row of leadTimeSlack(template, date)) {
    const li = el('li', row.tight ? 'is-tight' : '');
    li.append(
      el('span', undefined, row.label),
      el('span', undefined, row.tight ? `${Math.abs(row.slackDays)} days short` : `${row.slackDays} days to spare`)
    );
    list.append(li);
  }
  return list;
}

function termMarks(term: SchoolTerm, excursions: Project[]): HTMLElement[] {
  const marks = excursions.filter((project) => {
    const date = project.current_end_date;
    return date ? termAt(date, [term]) : false;
  });
  if (!marks.length) return [el('span', 'excursion-term__empty', 'No trip')];
  return marks.map((project) => el('span', 'excursion-term__mark', project.title));
}

export function renderSeasonDesk(model: DeskModel, handlers: DeskHandlers): HTMLElement {
  const section = el('section', 'excursion-desk');
  section.setAttribute('aria-label', 'Season');
  section.append(el('p', 'page-header__eyebrow', 'Season'));

  const lead = model.usual[0];
  const grid = el('div', 'excursion-terms');
  for (const term of model.terms) {
    const card = el('article', 'excursion-term');
    card.append(
      el('p', 'excursion-term__name', `Term ${term.term}`),
      el('p', 'meta-line', `${formatDisplayDate(term.starts_on)} – ${formatDisplayDate(term.ends_on)}`)
    );
    for (const mark of termMarks(term, model.excursions)) card.append(mark);
    if (lead && lead.monthPassed && lead.term === term.term) {
      card.append(el('span', 'excursion-term__ghost', `${lead.name} · usually ${lead.usualMonth}`));
    }
    grid.append(card);
  }
  section.append(grid);
  const panel = el('article', 'hub-card excursion-desk__panel');
  if (!lead) {
    panel.append(el('p', 'meta-line', 'Nothing in the catalogue is waiting on this month.'));
  } else {
    const copy = lead.monthPassed
      ? `${lead.name} usually falls in ${lead.usualMonth}, which has passed.`
      : `${lead.name} usually falls in ${lead.usualMonth}.`;
    panel.append(el('p', 'excursion-desk__copy', copy));
    panel.append(
      el(
        'p',
        'meta-line',
        lead.monthPassed
          ? `${formatDisplayDate(lead.suggestedDate)} is the next open term.`
          : `The usual window is ${formatDisplayDate(lead.suggestedDate)}.`
      )
    );
    if (model.placedId === lead.programId && model.template) {
      panel.append(slackList(model.template, model.proposedDate));
    }
    const place = el('button', 'btn btn--primary', `Place on ${formatDisplayDate(lead.suggestedDate)}`);
    place.type = 'button';
    place.addEventListener('click', () => handlers.onPlace(lead));
    panel.append(place);
  }
  section.append(panel);
  return section;
}

export function renderCarryForward(model: DeskModel, handlers: DeskHandlers): HTMLElement | null {
  const source = model.closed[0] ?? null;
  const names = openFolderNames(source);
  if (!source || !names.length) return null;

  const section = el('section', 'excursion-desk');
  section.setAttribute('aria-label', 'Carry forward');
  section.append(el('p', 'page-header__eyebrow', 'Carry into the next one'));
  const panel = el('article', 'hub-card excursion-desk__panel');
  panel.append(el('p', 'meta-line', `Still open on ${source.title}.`));
  for (const name of names) {
    const label = el('label', 'excursion-desk__check');
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = model.carry.has(name);
    box.addEventListener('change', () => handlers.onToggleCarry(name, box.checked));
    const text = el('span');
    text.append(el('strong', undefined, name));
    label.append(box, text);
    panel.append(label);
  }
  const chosen = names.filter((name) => model.carry.has(name));
  panel.append(
    el(
      'p',
      'meta-line',
      chosen.length
        ? `${chosen.length} item${chosen.length === 1 ? '' : 's'} carry into the next excursion.`
        : 'Nothing selected. The next excursion starts with an empty folder.'
    )
  );
  const start = el('button', 'btn btn--primary', chosen.length ? 'Start with these' : 'Start empty');
  start.type = 'button';
  start.addEventListener('click', () => {
    stashCarry(chosen);
    const title = model.closed.find((project) => project.id === model.historyId)?.title ?? source.title;
    location.hash = planHash(model.template?.id, model.proposedDate, title);
  });
  panel.append(start);
  section.append(panel);
  return section;
}

export function renderYearLog(model: DeskModel, handlers: DeskHandlers): HTMLElement {
  const section = el('section', 'excursion-desk');
  section.setAttribute('aria-label', 'Year log');
  section.append(el('p', 'page-header__eyebrow', 'Year log'));

  const split = el('div', 'excursion-desk__split');
  const history = el('div');
  history.append(el('p', 'page-header__eyebrow', 'Run again'));
  if (!model.closed.length) {
    history.append(el('p', 'meta-line', 'No closed excursions yet.'));
  } else {
    const list = el('div', 'excursion-desk__rows');
    list.setAttribute('role', 'listbox');
    list.setAttribute('aria-label', 'Closed excursions');
    for (const project of model.closed) {
      const row = el('button', `excursion-desk__row${project.id === model.historyId ? ' is-on' : ''}`);
      row.type = 'button';
      row.setAttribute('role', 'option');
      row.setAttribute('aria-selected', project.id === model.historyId ? 'true' : 'false');
      row.append(el('strong', undefined, project.title));
      const when = project.current_end_date ? formatDisplayDate(project.current_end_date) : 'No event date';
      const tight = model.template ? tightestNotice(project, model.template.default_lead_times) : null;
      row.append(el('span', undefined, tight ? `${when} · ${tight.label.toLowerCase()} was short` : when));
      row.addEventListener('click', () => handlers.onSelectHistory(project.id));
      list.append(row);
    }
    history.append(list);
  }

  const next = el('div');
  next.append(el('p', 'page-header__eyebrow', 'Next date'));
  const panel = el('article', 'hub-card excursion-desk__panel');
  const stepper = el('div', 'excursion-desk__date');
  const earlier = el('button', 'icon-plus-btn', '');
  earlier.type = 'button';
  earlier.setAttribute('aria-label', 'One week earlier');
  earlier.disabled = addDaysKey(model.proposedDate, -7) < model.today;
  earlier.append(chevron(false));
  earlier.addEventListener('click', () => {
    const nextDate = addDaysKey(model.proposedDate, -7);
    if (nextDate < model.today) return;
    handlers.onPropose(nextDate);
  });
  const later = el('button', 'icon-plus-btn', '');
  later.type = 'button';
  later.setAttribute('aria-label', 'One week later');
  later.append(chevron(true));
  later.addEventListener('click', () => handlers.onPropose(addDaysKey(model.proposedDate, 7)));
  stepper.append(earlier, el('p', 'excursion-desk__when', formatDisplayDate(model.proposedDate)), later);
  panel.append(stepper);

  const selected = model.closed.find((project) => project.id === model.historyId) ?? null;
  const tight = selected && model.template ? tightestNotice(selected, model.template.default_lead_times) : null;
  if (tight) {
    panel.append(
      el(
        'p',
        'meta-line',
        `${tight.label} had ${tight.had} days last time. The template asks for ${tight.need}.`
      )
    );
  }
  if (model.template) panel.append(slackList(model.template, model.proposedDate));

  const plan = el('button', 'btn btn--primary', 'Plan this date');
  plan.type = 'button';
  plan.addEventListener('click', () => {
    const title = selected?.title ?? model.usual.find((call) => call.programId === model.placedId)?.name ?? '';
    location.hash = planHash(model.template?.id, model.proposedDate, title);
  });
  panel.append(plan);
  next.append(panel);
  split.append(history, next);
  section.append(split);
  return section;
}

function chevron(forward: boolean): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.75');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', forward ? 'm9 6 6 6-6 6' : 'M15 6 9 12l6 6');
  svg.append(path);
  return svg;
}
