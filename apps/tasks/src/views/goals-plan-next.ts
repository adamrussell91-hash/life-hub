// apps/tasks/src/views/goals-plan-next.ts
import type { Goal } from '@/schemas/goal';
import type { SchoolTerm } from '@/domain/school-time';
import { tasksApi } from '@/services/client-api';
import { errorMessage } from '@/views/feedback';
import { el } from '@/views/hub-kit';
import { createCardSwipe } from '../../design-kit/js/card-swipe.js';
import { showHubToast } from '../../design-kit/js/hub-feedback.js';
import { goalBelongsToTerm, termYear } from '@/domain/goal-runway';

type TermOutcome = 'carried' | 'parked' | 'achieved' | 'dropped';
type OngoingOutcome = 'put_in_term' | 'keep_ongoing' | 'parked' | 'dropped';

const TERM_CHOICES: Array<{ outcome: TermOutcome; label: string; key: string }> = [
  { outcome: 'carried', label: 'Carry', key: '1' },
  { outcome: 'parked', label: 'Park', key: '2' },
  { outcome: 'achieved', label: 'Achieved', key: '3' },
  { outcome: 'dropped', label: 'Drop', key: '4' }
];

function ongoingChoices(nextTermNum: number): Array<{ outcome: OngoingOutcome; label: string; key: string }> {
  return [
    { outcome: 'put_in_term', label: `Put in Term ${nextTermNum}`, key: '1' },
    { outcome: 'keep_ongoing', label: 'Keep ongoing', key: '2' },
    { outcome: 'parked', label: 'Park', key: '3' },
    { outcome: 'dropped', label: 'Drop', key: '4' }
  ];
}

function nextTerm(term: SchoolTerm): { year: number; term: 1 | 2 | 3 | 4 } {
  const year = termYear(term);
  if (term.term === 4) return { year: year + 1, term: 1 };
  return { year, term: (term.term + 1) as 1 | 2 | 3 | 4 };
}

/** G-16 Plan next term — card-swipe deck; nothing writes until Confirm. Always opens. */
export function openPlanNextTerm(
  host: HTMLElement,
  goals: Goal[],
  term: SchoolTerm,
  onDone: () => void,
  options: { onNewGoal?: () => void } = {}
): void {
  document.querySelector('.goals-plan-sheet')?.remove();
  const unfinished = goals.filter((g) => g.status === 'active' && goalBelongsToTerm(g, term));
  const ongoing = goals.filter((g) => g.status === 'active' && !g.term);
  const deck: Array<{ goal: Goal; kind: 'term' | 'ongoing' }> = [
    ...unfinished.map((goal) => ({ goal, kind: 'term' as const })),
    ...ongoing.map((goal) => ({ goal, kind: 'ongoing' as const }))
  ];

  const sheet = el('div', 'goals-plan-sheet');
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-label', 'Plan next term');
  const next = nextTerm(term);
  const termDecisions = new Map<string, TermOutcome>();
  const ongoingDecisions = new Map<string, OngoingOutcome>();

  if (!deck.length) {
    sheet.append(
      el('h2', 'page-header__title', `Plan Term ${next.term}`),
      el(
        'p',
        'goals-plan-sheet__lede',
        'Nothing to review — no active goals in this term and no ongoing goals.'
      )
    );
    const newGoal = el('button', 'btn btn--primary', 'New goal') as HTMLButtonElement;
    newGoal.type = 'button';
    newGoal.addEventListener('click', () => {
      sheet.remove();
      options.onNewGoal?.();
    });
    const close = el('button', 'btn btn--ghost', 'Back to runway');
    close.type = 'button';
    close.addEventListener('click', () => {
      sheet.remove();
      onDone();
    });
    sheet.append(newGoal, close);
    host.append(sheet);
    return;
  }

  sheet.append(el('h2', 'page-header__title', `Plan Term ${next.term}`));
  sheet.append(
    el(
      'p',
      'goals-plan-sheet__lede',
      `Review ${deck.length} goal${deck.length === 1 ? '' : 's'}. Ongoing goals can join Term ${next.term} or stay ongoing. Nothing is written until you Confirm.`
    )
  );

  const deckHost = el('div', 'goals-plan-deck');
  const ongChoices = ongoingChoices(next.term);
  const slides = deck.map(({ goal, kind }) => {
    const card = el('article', 'goals-plan-card glass-tile');
    card.dataset.goalId = goal.id;
    card.dataset.kind = kind;
    card.append(el('p', 'goal-card__eyebrow', kind === 'ongoing' ? 'ONGOING' : goal.structure.toUpperCase()));
    card.append(el('h3', '', goal.title));
    if (goal.lead_measure) card.append(el('p', 'meta', goal.lead_measure.label));
    const choices = el('div', 'goals-plan-card__choices');
    const list = kind === 'ongoing' ? ongChoices : TERM_CHOICES;
    for (const choice of list) {
      const btn = el('button', 'btn btn--secondary', `${choice.key} · ${choice.label}`);
      btn.type = 'button';
      btn.dataset.outcome = choice.outcome;
      btn.addEventListener('click', () => pick(goal.id, kind, choice.outcome, card));
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
    const current = deck.find(
      (d) =>
        (d.kind === 'term' && !termDecisions.has(d.goal.id)) ||
        (d.kind === 'ongoing' && !ongoingDecisions.has(d.goal.id))
    );
    if (!current) return;
    const list = current.kind === 'ongoing' ? ongChoices : TERM_CHOICES;
    const choice = list.find((c) => c.key === event.key);
    if (!choice) return;
    event.preventDefault();
    const card = deckHost.querySelector<HTMLElement>(`[data-goal-id="${current.goal.id}"]`);
    if (card) pick(current.goal.id, current.kind, choice.outcome, card);
  };
  document.addEventListener('keydown', onKey);

  function pick(goalId: string, kind: 'term' | 'ongoing', outcome: string, card: HTMLElement): void {
    if (kind === 'term') termDecisions.set(goalId, outcome as TermOutcome);
    else ongoingDecisions.set(goalId, outcome as OngoingOutcome);
    card.dataset.outcome = outcome;
    card.classList.add(`is-${outcome}`);
    const remaining = deck.filter(
      (d) =>
        (d.kind === 'term' && !termDecisions.has(d.goal.id)) ||
        (d.kind === 'ongoing' && !ongoingDecisions.has(d.goal.id))
    );
    if (remaining.length) {
      const idx = deck.findIndex((d) => d.goal.id === remaining[0]!.goal.id);
      swipe.setIndex(idx);
      return;
    }
    showSummary();
  }

  function showSummary(): void {
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('keydown', onEsc);
    deckHost.hidden = true;
    summary.hidden = false;
    summary.replaceChildren();
    summary.append(el('h3', '', 'Summary'));
    const list = el('ul', 'goals-plan-summary__counts');
    const counts: Record<string, number> = {};
    for (const o of termDecisions.values()) counts[o] = (counts[o] ?? 0) + 1;
    for (const o of ongoingDecisions.values()) counts[o] = (counts[o] ?? 0) + 1;
    for (const [label, n] of Object.entries(counts)) {
      const li = el('li');
      const num = el('span', 'goals-plan-summary__num');
      num.dataset.hubCount = '1';
      num.textContent = String(n);
      li.append(num, document.createTextNode(` ${label.replace(/_/g, ' ')}`));
      list.append(li);
    }
    summary.append(list);
    const confirm = el('button', 'btn btn--primary', 'Confirm');
    confirm.type = 'button';
    confirm.dataset.action = 'plan-confirm';
    confirm.addEventListener('click', () => {
      confirm.disabled = true;
      const termPayload = [...termDecisions.entries()].map(([goal_id, outcome]) => ({ goal_id, outcome }));
      const ongoingWork = [...ongoingDecisions.entries()].map(([id, outcome]) => {
        if (outcome === 'keep_ongoing') return Promise.resolve(null);
        if (outcome === 'put_in_term') return tasksApi.updateGoal(id, { term: next, status: 'active' });
        return tasksApi.updateGoal(id, { status: outcome === 'parked' ? 'parked' : 'dropped' });
      });
      const plan = termPayload.length
        ? tasksApi.planTerm({
            from: { year: termYear(term), term: term.term },
            decisions: termPayload
          })
        : Promise.resolve(null);
      void Promise.all([plan, ...ongoingWork])
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
      sheet.remove();
      options.onNewGoal?.();
    });
    summary.append(confirm, addNew);
  }

  const cancel = el('button', 'btn btn--ghost', 'Cancel');
  cancel.type = 'button';
  const closeSheet = () => {
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('keydown', onEsc);
    sheet.remove();
  };
  const onEsc = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeSheet();
    }
  };
  document.addEventListener('keydown', onEsc);
  cancel.addEventListener('click', closeSheet);
  sheet.append(cancel);
  host.append(sheet);
}
