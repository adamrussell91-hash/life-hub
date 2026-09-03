import type { CurriculumOutcome } from '@/schemas/outcome';
import { catalogForSubject, resolveOutcomes, toPublicOutcome } from '@/curriculum/outcome-catalog';
import { attachedOutcomeIds } from '@/curriculum/outcome-ids';
import { openOutcomePicker } from '@/outcomes/picker';

export interface OutcomeStripOptions {
  catalog: CurriculumOutcome[];
  subject: { id: string; outcome_ids: string[] };
  attached: { outcome_ids?: string[]; syllabus_outcomes?: string[] };
  editable?: boolean;
  onChange?: (ids: string[]) => void | Promise<void>;
  onCatalogChange?: (outcome: CurriculumOutcome) => void;
}

export interface OutcomeStripHandle {
  update(next: Partial<OutcomeStripOptions>): void;
  element: HTMLElement;
  dispose(): void;
}

export function mountOutcomeStrip(
  host: HTMLElement,
  options: OutcomeStripOptions
): OutcomeStripHandle {
  let current = options;
  const root = document.createElement('div');
  root.className = 'outcome-strip';
  host.append(root);

  function catalog(): CurriculumOutcome[] {
    return catalogForSubject(current.subject, current.catalog);
  }

  function paint(): void {
    root.replaceChildren();
    const ids = attachedOutcomeIds(current.attached);
    const resolved = resolveOutcomes(ids, current.catalog);
    const chips = document.createElement('div');
    chips.className = 'outcome-strip__chips';

    for (const outcome of resolved) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'outcome-chip';
      chip.dataset.outcomeId = outcome.id;
      chip.setAttribute('aria-expanded', 'false');
      chip.textContent = outcome.code;
      chip.title = outcome.title;
      chip.addEventListener('click', () => {
        const open = root.querySelector<HTMLElement>('.outcome-strip__expand');
        const wasThis = open?.dataset.outcomeId === outcome.id;
        open?.remove();
        chips.querySelectorAll('.outcome-chip.is-open').forEach((el) => {
          el.classList.remove('is-open');
          el.setAttribute('aria-expanded', 'false');
        });
        if (wasThis) return;
        chip.classList.add('is-open');
        chip.setAttribute('aria-expanded', 'true');
        const expand = document.createElement('div');
        expand.className = 'outcome-strip__expand';
        expand.dataset.outcomeId = outcome.id;
        const heading = document.createElement('strong');
        heading.textContent = `${outcome.code} · ${outcome.title}`;
        const body = document.createElement('p');
        body.textContent = outcome.description;
        expand.append(heading, body);
        root.append(expand);
      });
      chips.append(chip);
    }

    if (current.editable) {
      const add = document.createElement('button');
      add.type = 'button';
      add.className = 'outcome-chip outcome-chip--add';
      add.textContent = '+ Add';
      add.addEventListener('click', () => {
        openOutcomePicker({
          catalog: catalog(),
          selectedIds: attachedOutcomeIds(current.attached),
          subjectId: current.subject.id,
          onCreated: (created) => {
            current = {
              ...current,
              catalog: [...current.catalog, created],
              subject: {
                ...current.subject,
                outcome_ids: [...current.subject.outcome_ids, created.id]
              }
            };
            current.onCatalogChange?.(created);
          },
          onApply: async (nextIds) => {
            current = { ...current, attached: { outcome_ids: nextIds } };
            await current.onChange?.(nextIds);
            paint();
          }
        });
      });
      chips.append(add);
    }

    root.append(chips);
  }

  paint();

  return {
    element: root,
    update(next) {
      current = { ...current, ...next };
      paint();
    },
    dispose() {
      root.remove();
    }
  };
}

export function mountPublicOutcomeChips(
  host: HTMLElement,
  outcomes: Array<{
    id: string;
    code: string;
    title: string;
    description: string;
  }>
): void {
  const root = document.createElement('div');
  root.className = 'outcome-strip';
  const chips = document.createElement('div');
  chips.className = 'outcome-strip__chips';
  for (const outcome of outcomes) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'outcome-chip';
    chip.textContent = outcome.code;
    chip.title = outcome.title;
    chip.addEventListener('click', () => {
      const open = root.querySelector<HTMLElement>('.outcome-strip__expand');
      const wasThis = open?.dataset.outcomeId === outcome.id;
      open?.remove();
      chips.querySelectorAll('.outcome-chip.is-open').forEach((el) => {
        el.classList.remove('is-open');
        el.setAttribute('aria-expanded', 'false');
      });
      if (wasThis) return;
      chip.classList.add('is-open');
      const expand = document.createElement('div');
      expand.className = 'outcome-strip__expand';
      expand.dataset.outcomeId = outcome.id;
      const heading = document.createElement('strong');
      heading.textContent = `${outcome.code} · ${outcome.title}`;
      const body = document.createElement('p');
      body.textContent = outcome.description;
      expand.append(heading, body);
      root.append(expand);
    });
    chips.append(chip);
  }
  root.append(chips);
  host.append(root);
}

export function publicOutcomesForPage(
  attached: { outcome_ids?: string[]; syllabus_outcomes?: string[] },
  catalog: CurriculumOutcome[]
) {
  return resolveOutcomes(attachedOutcomeIds(attached), catalog).map(toPublicOutcome);
}
