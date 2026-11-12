// The saved Achievement card on the meeting page: the read, the stream picture (last run as dashed
// edges where it moved), their words, the moves, their next step and the look-again date.
import type { GuideRun, Values as RunValues } from '../types';
import { shortDate } from '../continuum-chart';
import { ACHIEVEMENT_EMBLEM } from './icons';
import { AREA, AREA_IDS, CITE, MOVES, PROFILES, leadArea, readRun, readWords, type Values } from './model';
import { createStream } from './stream';

export function renderAchievementCard(
  doc: Document,
  input: { run: GuideRun; history: Array<{ at: string; values: RunValues }>; onEdit?: () => void }
): HTMLElement {
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string) => {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const { run } = input;
  const view = readRun(run);
  const lead = leadArea(view.profile);
  const card = el('article', `guide-card guide achv achv-card${lead ? ` achv-a--${lead}` : ''}`);
  card.dataset.run = run.id;

  const head = el('div', 'guide-card__head');
  const emblem = el('span', 'guide-emblem');
  emblem.innerHTML = ACHIEVEMENT_EMBLEM; // a constant, never user text
  const titles = el('div');
  titles.append(el('div', 'guide-card__kicker', `Achievement guide · ${shortDate(run.created_at)}`), el('div', 'guide-card__title', run.context));
  head.append(emblem, titles);
  if (input.onEdit) {
    const edit = el('button', 'btn btn--ghost guide-card__edit', 'Edit');
    edit.type = 'button';
    edit.dataset.part = 'guide-edit';
    edit.addEventListener('click', () => input.onEdit!());
    head.append(edit);
  }

  const p = PROFILES[view.profile];
  const profile = el('div', 'guide-card__profile achv-card__profile');
  const words = el('div');
  words.append(el('div', 'guide-card__pname', p.name), el('div', 'guide-card__pline', p.line));
  profile.append(words);

  const last = input.history[0];
  const ghost: Values | null = last ? Object.fromEntries(AREA_IDS.filter((k) => typeof last.values[k] === 'number').map((k) => [k, last.values[k]])) : null;
  const stream = createStream(doc, view.values, { ghost, pin: view.profile });
  const key = el('p', 'achv-key', readWords(view.values, view.profile));
  if (last) key.append(doc.createTextNode(` · dashed: ${shortDate(last.at)}, where it moved`));
  const their = AREA_IDS.filter((k) => view.their[k] != null);
  if (their.length) key.append(doc.createTextNode(` · they rated ${their.map((k) => `${AREA[k].short} ${view.their[k]}/5`).join(', ')}`));

  card.append(head, profile, stream.el, key);

  if (view.quotes.length) {
    const box = el('div', 'guide-card__words');
    box.append(el('h4', undefined, 'Their words'));
    for (const q of view.quotes) box.append(el('blockquote', `achv-a--${q.area}`, `“${q.text}”`));
    card.append(box);
  }
  if (run.moves.length) {
    const box = el('div', 'guide-card__moves achv-card__moves');
    box.append(el('h4', undefined, 'Moves'));
    const ol = el('ol');
    for (const text of run.moves) {
      const li = el('li');
      const m = Object.values(MOVES).find((x) => x.text === text);
      const span = el('span', undefined, text);
      if (m) span.append(el('small', undefined, m.source));
      li.append(span);
      ol.append(li);
    }
    box.append(ol);
    card.append(box);
  }
  if (view.next || view.againDate) {
    const box = el('div', 'guide-card__words');
    box.append(el('h4', undefined, 'Their next step'));
    const next = el('div', 'achv-card__next', view.next ? `“${view.next}”` : 'Not set');
    if (view.againDate) next.append(el('small', undefined, `Look again ${shortDate(`${view.againDate}T00:00:00`)}`));
    box.append(next);
    card.append(box);
  }
  card.append(el('p', 'guide-card__cite', CITE));
  return card;
}
