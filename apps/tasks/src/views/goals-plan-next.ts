// apps/tasks/src/views/goals-plan-next.ts
import type { Goal } from '@/schemas/goal';
import type { SchoolTerm } from '@/domain/school-time';
import { tasksApi } from '@/services/client-api';
import { errorMessage } from '@/views/feedback';
import { el } from '@/views/hub-kit';
import { createCardSwipe } from '../../design-kit/js/card-swipe.js';
import { showHubToast } from '../../design-kit/js/hub-feedback.js';
import { goalBelongsToTerm, termYear } from '@/domain/goal-runway';

type Outcome = 'carried' | 'parked' | 'achieved' | 'dropped';

const CHOICES: Array<{ outcome: Outcome; label: string; key: string }> = [
  { outcome: 'carried', label: 'Carry', key: '1' },
  { outcome: 'parked', label: 'Park', key: '2' },
  { outcome: 'achieved', label: 'Achieved', key: '3' },
  { outcome: 'dropped', label: 'Drop', key: '4' }
];

function nextTerm(term: SchoolTerm): { year: number; term: 1 | 2 | 3 | 4 } {
  const year = termYear(term);
  if (term.term === 4) return { year: year + 1, term: 1 };
  return { year, term: (term.term + 1) as 1 | 2 | 3 | 4 };
}

/** G-16 Plan next term — card-swipe deck; nothing writes until Confirm. */
export function openPlanNextTerm(host: HTMLElement, goals: Goal[], term: SchoolTerm, onDone: () => void): void {
  const unfinished = goals.filter((g) => g.status === 'active' && goalBelongsToTerm(g, term));
  const sheet = el('div', 'goals-plan-sheet');
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-label', 'Plan next term');
  const decisions = new Map<string, Outcome>();

  if (!unfinished.length) {
    const close = el('button', 'btn btn--primary', 'Back to runway');
    close.type = 'button';
    close.addEventListener('click', () => {
      sheet.remove();
      onDone();
    });
    sheet.append(
      el('p', 'goals-plan-sheet__lede', 'Nothing to review — every goal in this term is finished or parked.'),
      close
    );
    host.append(sheet);
    return;
  }

  const next = nextTerm(term);
  sheet.append(el('h2', 'page-header__title', `Plan Term ${next.term}`));
  sheet.append(
    el(
      'p',
      'goals-plan-sheet__lede',
      `Review ${unfinished.length} active goal${unfinished.length === 1 ? '' : 's'} from Term ${term.term}. Nothing is written until you Confirm.`
    )
  );

  const deckHost = el('div', 'goals-plan-deck');
  const slides = unfinished.map((goal) => {
    const card = el('article', 'goals-plan-card glass-tile');
    card.dataset.goalId = goal.id;
    card.append(el('p', 'goal-card__eyebrow', goal.structure.toUpperCase()));
    card.append(el('h3', '', goal.title));
    if (goal.lead_measure) card.append(el('p', 'meta', goal.lead_measure.label));
    const choices = el('div', 'goals-plan-card__choices');
    for (const choice of CHOICES) {
      const btn = el('button', 'btn btn--secondary', `${choice.key} · ${choice.label}`);
      btn.type = 'button';
      btn.dataset.outcome = choice.outcome;
      btn.addEventListener('click', () => pick(goal.id, choice.outcome, card));
      choices.append(btn);
    }
    card.append(choices);
    return card;
  });

  const swipe = createCardSwipe({
    root: document,
    slides,
    label: 'Plan next term',
    fluid: true
  });
  deckHost.append(swipe.el);
  sheet.append(deckHost);

  const summary = el('div', 'goals-plan-summary');
  summary.hidden = true;
  sheet.append(summary);

  const onKey = (event: KeyboardEvent) => {
    const choice = CHOICES.find((c) => c.key === event.key);
    if (!choice) return;
    const current = unfinished.find((g) => !decisions.has(g.id));
    if (!current) return;
    event.preventDefault();
    const card = deckHost.querySelector<HTMLElement>(`[data-goal-id="${current.id}"]`);
    if (card) pick(current.id, choice.outcome, card);
  };
  document.addEventListener('keydown', onKey);

  function pick(goalId: string, outcome: Outcome, card: HTMLElement): void {
    decisions.set(goalId, outcome);
    card.dataset.outcome = outcome;
    card.classList.add(`is-${outcome}`);
    const remaining = unfinished.filter((g) => !decisions.has(g.id));
    if (remaining.length) {
      const idx = unfinished.findIndex((g) => g.id === remaining[0]!.id);
      swipe.setIndex(idx);
      return;
    }
    showSummary();
  }

  function showSummary(): void {
    document.removeEventListener('keydown', onKey);
    deckHost.hidden = true;
    summary.hidden = false;
    summary.replaceChildren();
    summary.append(el('h3', '', 'Summary'));
    const counts: Record<Outcome, number> = { carried: 0, parked: 0, achieved: 0, dropped: 0 };
    for (const outcome of decisions.values()) counts[outcome] += 1;
    const list = el('ul', 'goals-plan-summary__counts');
    for (const choice of CHOICES) {
      const li = el('li');
      const num = el('span', 'goals-plan-summary__num');
      num.dataset.hubCount = '1';
      num.textContent = String(counts[choice.outcome]);
      li.append(num, document.createTextNode(` ${choice.label}`));
      list.append(li);
    }
    summary.append(list);
    const confirm = el('button', 'btn btn--primary', 'Confirm');
    confirm.type = 'button';
    confirm.dataset.action = 'plan-confirm';
    confirm.addEventListener('click', () => {
      confirm.disabled = true;
      void tasksApi
        .planTerm({
          from: { year: termYear(term), term: term.term },
          decisions: [...decisions.entries()].map(([goal_id, outcome]) => ({ goal_id, outcome }))
        })
        .then(() => {
          showHubToast(`Term ${term.term} planned.`, { tone: 'success' });
          sheet.remove();
          window.dispatchEvent(
            new CustomEvent('goals:select-term', { detail: { year: next.year, term: next.term } })
          );
          onDone();
        })
        .catch((err) => {
          confirm.disabled = false;
          window.alert(errorMessage(err));
        });
    });
    const addNew = el('button', 'btn btn--secondary', `Add a new goal for Term ${next.term}`);
    addNew.type = 'button';
    addNew.addEventListener('click', () => {
      addNew.textContent = `After Confirm, use New goal for Term ${next.term}`;
    });
    summary.append(confirm, addNew);
  }

  const cancel = el('button', 'btn btn--ghost', 'Cancel');
  cancel.type = 'button';
  cancel.addEventListener('click', () => {
    document.removeEventListener('keydown', onKey);
    sheet.remove();
  });
  sheet.append(cancel);
  host.append(sheet);
}
