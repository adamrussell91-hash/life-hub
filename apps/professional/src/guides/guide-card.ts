import { createContinuumChart, shortDate } from './continuum-chart';
import type { GuideDefinition, GuideRun, Values } from './types';

export function emblemEl(doc: Document, guide: GuideDefinition): HTMLElement {
  const span = doc.createElement('span');
  span.className = 'guide-emblem';
  span.innerHTML = guide.emblem; // a constant in the guide definition, never user text
  return span;
}

export function renderGuideCard(
  doc: Document,
  input: {
    guide: GuideDefinition;
    run: GuideRun;
    history: Array<{ at: string; values: Values }>;
    onEdit?: () => void;
    onProfile?: (profileId: string) => void;
  }
): HTMLElement {
  const { guide, run } = input;
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string) => {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const card = el('article', 'guide-card guide');
  card.dataset.run = run.id;

  const head = el('div', 'guide-card__head');
  const titles = el('div');
  titles.append(el('div', 'guide-card__kicker', `${guide.name} guide · ${shortDate(run.created_at)}`), el('div', 'guide-card__title', run.context));
  head.append(emblemEl(doc, guide), titles);
  if (input.onEdit) {
    const edit = el('button', 'btn btn--ghost guide-card__edit', 'Edit');
    edit.type = 'button';
    edit.dataset.part = 'guide-edit';
    edit.addEventListener('click', () => input.onEdit!());
    head.append(edit);
  }

  const profile = guide.profiles.find((p) => p.id === run.profile) ?? guide.profileFor(run.values);
  const profileRow = el('div', 'guide-card__profile');
  const words = el('div');
  words.append(el('div', 'guide-card__pname', profile.name), el('div', 'guide-card__pline', profile.line));
  profileRow.append(words);
  if (input.onProfile) {
    const select = el('select', 'guide-card__pick');
    select.setAttribute('aria-label', 'Change the profile');
    for (const p of guide.profiles) {
      const option = el('option', undefined, p.name);
      option.value = p.id;
      option.selected = p.id === profile.id;
      select.append(option);
    }
    select.addEventListener('change', () => input.onProfile!(select.value));
    profileRow.append(select);
  }

  const chart = createContinuumChart(doc, { scales: guide.scales, values: run.values, lean: (v) => guide.lean(v), history: input.history });

  const moves = el('section', 'guide-card__moves');
  moves.append(el('h4', undefined, 'Suggested moves'));
  const list = el('ol');
  for (const move of run.moves) list.append(el('li', undefined, move));
  moves.append(list);

  card.append(head, profileRow, chart.el, moves);
  if (run.quotes.length) {
    const said = el('section', 'guide-card__words');
    said.append(el('h4', undefined, 'In their words'));
    for (const quote of run.quotes.slice(0, 3)) said.append(el('blockquote', undefined, quote));
    card.append(said);
  }
  card.append(el('p', 'guide-card__cite', guide.cite));
  return card;
}
