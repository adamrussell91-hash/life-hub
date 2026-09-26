import { createEntityPicker } from '../../design-kit/js/entity-picker.js';
import { createFuture, createStone, draftFuture, updateFuture } from '@/api/career';
import { searchEntities } from '@/api/entities';
import { createTask, createUniversalLink } from '@/api/universal-links';
import { careerCardRoute, careerFutureRoute } from '@/app/router';
import type { buildCareerModel } from '@/domain/career-model';
import { selectGhostPaths } from '@/domain/career-ghost-paths';
import { branchColour } from '@/domain/career-river-geometry';

type CareerModel = ReturnType<typeof buildCareerModel>;
type FutureModel = CareerModel['futures'][number];

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function coverageDot(coverage: number): string {
  if (coverage >= 1) return 'career-future__dot career-future__dot--green';
  if (coverage >= 0.5) return 'career-future__dot career-future__dot--amber';
  return 'career-future__dot career-future__dot--red';
}

function formatFadingSince(iso: string | null | undefined): string {
  if (!iso) return 'a while';
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso);
  if (!Number.isFinite(d.getTime())) return 'a while';
  return d.toLocaleString('en-AU', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

/**
 * Detailed Future panel for the selected branch.
 */
export function renderFutureDetail(
  host: HTMLElement,
  future: FutureModel,
  options: { onChanged: () => void }
): void {
  host.replaceChildren();
  const panel = el('section', 'career-page__panel career-page__future-detail');
  panel.style.background = 'var(--glass)';
  panel.style.border = '1px solid var(--line)';
  panel.style.borderRadius = 'var(--radius-md)';
  panel.style.boxShadow = 'var(--elev-1)';

  const head = el('div', 'career-future__head');
  const titles = el('div', 'career-future__titles');
  titles.append(el('h2', 'career-page__heading', future.title));
  if (future.where) titles.append(el('p', 'career-page__meta', future.where));
  if (future.arrival_label) {
    titles.append(el('p', 'career-page__meta', `ready around ${future.arrival_label}`));
  }
  head.append(titles);

  const ring = el('div', 'career-future__ring');
  ring.style.setProperty('--ring-color', branchColour(future.colour_slot));
  ring.style.setProperty('--ring-pct', String(future.readiness ?? 0));
  ring.append(el('span', 'career-future__ring-label', future.readiness_label));
  head.append(ring);
  panel.append(head);

  if (future.fading) {
    const banner = el('div', 'career-future__fading');
    banner.append(
      el(
        'p',
        null,
        `No new evidence for this future since ${formatFadingSince(future.fading_since)}. Still want it?`
      )
    );
    const actions = el('div', 'career-future__fading-actions');
    const keep = el('button', 'btn btn--secondary', 'Keep it') as HTMLButtonElement;
    keep.type = 'button';
    keep.addEventListener('click', () => {
      void (async () => {
        keep.disabled = true;
        try {
          // Touch updated_at only — banner stays until new evidence arrives.
          await updateFuture(future.id, { status: 'active' });
          options.onChanged();
        } catch {
          keep.disabled = false;
        }
      })();
    });
    const park = el('button', 'btn btn--ghost', 'Park it') as HTMLButtonElement;
    park.type = 'button';
    park.addEventListener('click', () => {
      void (async () => {
        park.disabled = true;
        try {
          await updateFuture(future.id, { status: 'parked' });
          location.hash = '#/career';
          options.onChanged();
        } catch {
          park.disabled = false;
        }
      })();
    });
    actions.append(keep, park);
    banner.append(actions);
    panel.append(banner);
  }

  panel.append(el('h3', 'career-future__subhead', 'What this role asks for'));
  const criteriaList = el('ul', 'career-future__criteria');
  for (const criterion of [...future.criteria].sort((a, b) => a.order - b.order)) {
    const li = document.createElement('li');
    li.className = 'career-future__criterion';
    const row = el('div', 'career-future__criterion-row');
    row.append(el('span', coverageDot(criterion.coverage)));
    row.append(el('span', 'career-future__criterion-text', criterion.text));
    li.append(row);
    if (criterion.supporting?.length) {
      const chips = el('div', 'career-future__chips');
      for (const card of criterion.supporting) {
        const chip = el('a', 'career-future__chip', card.title);
        chip.href = careerCardRoute(card.id);
        chips.append(chip);
      }
      li.append(chips);
    }
    if (criterion.coverage < 0.5) {
      const make = el('button', 'btn btn--ghost career-future__gap-btn', 'Make it a stepping stone') as HTMLButtonElement;
      make.type = 'button';
      make.addEventListener('click', () => {
        void (async () => {
          make.disabled = true;
          try {
            const { stone } = (await createStone({
              label: criterion.text.slice(0, 200),
              origin: 'gap',
              target_term_start: null,
              status_override: null
            })) as { stone: { id: string } };
            await createUniversalLink({
              source_ref: `professional:stepping_stone:${stone.id}`,
              target_ref: `professional:future:${future.id}`,
              relationship_type: 'stone_for'
            });
            options.onChanged();
          } catch {
            make.disabled = false;
          }
        })();
      });
      li.append(make);
    }
    criteriaList.append(li);
  }
  if (!future.criteria.length) {
    criteriaList.append(
      el('li', 'empty-state', 'No criteria yet. Edit this future to add what the role asks for.')
    );
  }
  panel.append(criteriaList);

  panel.append(el('h3', 'career-future__subhead', 'Stepping stones'));
  const stonesList = el('ul', 'career-future__stones');
  const stones = future.stones ?? [];
  if (!stones.length) {
    stonesList.append(el('li', 'empty-state', 'No stepping stones yet.'));
  }
  for (const stone of stones) {
    const li = document.createElement('li');
    li.className = 'career-future__stone';
    const term = stone.target_term_start
      ? (() => {
          const m = Number(stone.target_term_start.slice(5, 7));
          const y = stone.target_term_start.slice(0, 4);
          const termN = m <= 3 ? 1 : m <= 6 ? 2 : m <= 9 ? 3 : 4;
          return `T${termN} ${y}`;
        })()
      : 'No date';
    const top = el('div', 'career-future__stone-top');
    top.append(el('span', 'career-future__stone-term', term));
    top.append(el('span', 'career-future__stone-label', stone.label));
    if (stone.shared) {
      top.append(el('span', 'career-future__helps', `helps ${stone.helps_count} futures`));
    }
    if (stone.done) top.append(el('span', 'career-future__done', '✓'));
    li.append(top);

    const action = el('div', 'career-future__stone-actions');
    const addTask = el('button', 'btn btn--secondary', 'Add to Tasks') as HTMLButtonElement;
    addTask.type = 'button';
    addTask.addEventListener('click', () => {
      void (async () => {
        addTask.disabled = true;
        try {
          const task = await createTask({ title: stone.label, status: 'todo', domain: 'work' });
          await createUniversalLink({
            source_ref: `tasks:task:${task.id}`,
            target_ref: `professional:stepping_stone:${stone.id}`,
            relationship_type: 'stone_action'
          });
          options.onChanged();
        } catch {
          addTask.disabled = false;
        }
      })();
    });
    action.append(addTask);

    const linkExisting = el('div', 'career-future__link-existing');
    const input = el('input', 'career-future__picker-input') as HTMLInputElement;
    input.type = 'search';
    input.placeholder = 'Link existing…';
    input.setAttribute('aria-label', 'Link existing task, project, goal or program');
    linkExisting.append(input);
    createEntityPicker({
      input,
      allowedKinds: ['task'],
      emptyText: 'No matching tasks.',
      search: async (query, signal) => {
        const result = await searchEntities(query, 'task', { signal });
        return { groups: { task: result.groups.task ?? [] } };
      },
      onSelect: (item) => {
        void (async () => {
          try {
            await createUniversalLink({
              source_ref: item.ref,
              target_ref: `professional:stepping_stone:${stone.id}`,
              relationship_type: 'stone_action'
            });
            options.onChanged();
          } catch {
            /* keep picker usable */
          }
        })();
      }
    });
    action.append(linkExisting);
    li.append(action);
    stonesList.append(li);
  }
  panel.append(stonesList);

  panel.append(el('h3', 'career-future__subhead', 'People who got there'));
  const ghosts = selectGhostPaths([], {
    title: future.title,
    aliases: future.aliases
  });
  if (!ghosts.length) {
    panel.append(
      el('p', 'empty-state', 'Nobody in your Network holds this role yet.')
    );
  } else {
    const list = el('ul', 'career-future__ghosts');
    for (const person of ghosts) {
      const li = document.createElement('li');
      li.className = 'career-future__ghost';
      li.append(el('strong', null, person.display_name));
      const route = person.route_labels.length
        ? person.route_labels.join(' → ')
        : person.role;
      li.append(el('p', 'career-page__meta', route));
      list.append(li);
    }
    panel.append(list);
  }

  const edit = el('button', 'btn btn--ghost', 'Edit future') as HTMLButtonElement;
  edit.type = 'button';
  edit.addEventListener('click', () => {
    openEditFutureSheet(document.body, future, options.onChanged);
  });
  panel.append(edit);

  host.append(panel);
}

export function openAddFutureSheet(root: HTMLElement, onSaved: () => void): void {
  const sheet = el('div', 'career-sheet');
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-label', 'Add a future');
  const inner = el('div', 'career-sheet__inner');
  inner.append(el('h2', 'career-page__heading', 'Add a future'));
  inner.append(
    el('p', 'career-page__meta', 'Paste an ad or describe the role. Ann drafts the criteria — you edit and save.')
  );

  const titleField = el('label', 'career-sheet__field', 'Role title');
  const titleInput = el('input') as HTMLInputElement;
  titleInput.type = 'text';
  titleInput.required = true;
  titleField.append(titleInput);

  const descField = el('label', 'career-sheet__field', 'Ad or description');
  const desc = el('textarea') as HTMLTextAreaElement;
  desc.rows = 8;
  descField.append(desc);

  const status = el('p', 'career-page__meta');
  const criteriaHost = el('div', 'career-sheet__criteria');

  let draft: {
    title: string;
    where: string | null;
    aliases: string[];
    criteria: Array<{ id?: string; text: string; order: number; source: string }>;
  } | null = null;

  const draftBtn = el('button', 'btn btn--secondary', 'Ask Ann to draft') as HTMLButtonElement;
  draftBtn.type = 'button';
  draftBtn.addEventListener('click', () => {
    void (async () => {
      draftBtn.disabled = true;
      status.textContent = 'Ann is drafting…';
      try {
        const result = (await draftFuture({
          title: titleInput.value,
          description: desc.value
        })) as { draft: typeof draft };
        draft = result.draft;
        if (draft?.title) titleInput.value = draft.title;
        criteriaHost.replaceChildren();
        criteriaHost.append(el('h3', 'career-future__subhead', 'Criteria (edit before saving)'));
        for (const c of draft?.criteria ?? []) {
          const row = el('label', 'career-sheet__field');
          const input = el('input') as HTMLInputElement;
          input.type = 'text';
          input.value = c.text;
          input.dataset.source = c.source;
          row.append(input);
          criteriaHost.append(row);
        }
        status.textContent = draft && 'fallback' in (draft as object) && (draft as { fallback?: boolean }).fallback
          ? 'Drafted offline (no model key). Edit freely.'
          : 'Draft ready — edit anything, then save.';
      } catch (error) {
        status.textContent =
          error instanceof Error ? error.message : 'Could not draft. Try again.';
      } finally {
        draftBtn.disabled = false;
      }
    })();
  });

  const save = el('button', 'btn btn--primary', 'Save future') as HTMLButtonElement;
  save.type = 'button';
  save.addEventListener('click', () => {
    void (async () => {
      save.disabled = true;
      try {
        const criteriaInputs = [...criteriaHost.querySelectorAll('input')];
        const criteria =
          criteriaInputs.length > 0
            ? criteriaInputs.map((input, index) => ({
                text: input.value.trim(),
                order: index,
                source: (input.dataset.source as 'ad' | 'ann' | 'adam') || 'adam'
              })).filter((c) => c.text)
            : draft?.criteria ?? [];
        const created = (await createFuture({
          title: titleInput.value.trim() || draft?.title,
          where: draft?.where ?? null,
          aliases: draft?.aliases ?? [],
          criteria,
          status: 'active',
          colour_slot: 1,
          lane_order: 0,
          target_date: null,
          suggested_reason: null,
          dismissed_until: null
        })) as { future: { id: string } };
        root.removeChild(sheet);
        location.hash = careerFutureRoute(created.future.id);
        onSaved();
      } catch (error) {
        status.textContent =
          error instanceof Error ? error.message : 'Could not save.';
        save.disabled = false;
      }
    })();
  });

  const cancel = el('button', 'btn btn--ghost', 'Cancel') as HTMLButtonElement;
  cancel.type = 'button';
  cancel.addEventListener('click', () => root.removeChild(sheet));

  const actions = el('div', 'career-sheet__actions');
  actions.append(draftBtn, save, cancel);
  inner.append(titleField, descField, actions, status, criteriaHost);
  sheet.append(inner);
  root.append(sheet);
}

function openEditFutureSheet(root: HTMLElement, future: FutureModel, onSaved: () => void): void {
  const sheet = el('div', 'career-sheet');
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-label', 'Edit future');
  const inner = el('div', 'career-sheet__inner');
  inner.append(el('h2', 'career-page__heading', 'Edit future'));

  const titleField = el('label', 'career-sheet__field', 'Title');
  const titleInput = el('input') as HTMLInputElement;
  titleInput.value = future.title;
  titleField.append(titleInput);

  const whereField = el('label', 'career-sheet__field', 'Where');
  const whereInput = el('input') as HTMLInputElement;
  whereInput.value = future.where ?? '';
  whereField.append(whereInput);

  const aliasesField = el('label', 'career-sheet__field', 'Aliases (comma-separated)');
  const aliasesInput = el('input') as HTMLInputElement;
  aliasesInput.value = (future.aliases ?? []).join(', ');
  aliasesField.append(aliasesInput);

  const colourField = el('label', 'career-sheet__field', 'Colour slot (1–6)');
  const colourInput = el('input') as HTMLInputElement;
  colourInput.type = 'number';
  colourInput.min = '1';
  colourInput.max = '6';
  colourInput.value = String(future.colour_slot);
  colourField.append(colourInput);

  const criteriaHost = el('div', 'career-sheet__criteria');
  criteriaHost.append(el('h3', 'career-future__subhead', 'Criteria'));
  for (const c of [...future.criteria].sort((a, b) => a.order - b.order)) {
    const row = el('label', 'career-sheet__field');
    const input = el('input') as HTMLInputElement;
    input.value = c.text;
    input.dataset.id = c.id;
    input.dataset.source = c.source;
    row.append(input);
    criteriaHost.append(row);
  }
  const addCrit = el('button', 'btn btn--ghost', 'Add criterion') as HTMLButtonElement;
  addCrit.type = 'button';
  addCrit.addEventListener('click', () => {
    const row = el('label', 'career-sheet__field');
    const input = el('input') as HTMLInputElement;
    input.dataset.source = 'adam';
    row.append(input);
    criteriaHost.append(row);
  });

  const status = el('p', 'career-page__meta');
  const save = el('button', 'btn btn--primary', 'Save') as HTMLButtonElement;
  save.type = 'button';
  save.addEventListener('click', () => {
    void (async () => {
      save.disabled = true;
      try {
        const criteria = [...criteriaHost.querySelectorAll('input')]
          .map((input, index) => ({
            id: input.dataset.id,
            text: input.value.trim(),
            order: index,
            source: (input.dataset.source as 'ad' | 'ann' | 'adam') || 'adam'
          }))
          .filter((c) => c.text);
        await updateFuture(future.id, {
          title: titleInput.value.trim(),
          where: whereInput.value.trim() || null,
          aliases: aliasesInput.value
            .split(',')
            .map((a) => a.trim())
            .filter(Boolean)
            .slice(0, 8),
          colour_slot: Math.min(6, Math.max(1, Number(colourInput.value) || 1)),
          criteria,
          status: future.status,
          target_date: future.target_date,
          suggested_reason: future.suggested_reason,
          dismissed_until: null,
          lane_order: future.lane_order
        });
        root.removeChild(sheet);
        onSaved();
      } catch (error) {
        status.textContent = error instanceof Error ? error.message : 'Could not save.';
        save.disabled = false;
      }
    })();
  });
  const cancel = el('button', 'btn btn--ghost', 'Cancel') as HTMLButtonElement;
  cancel.type = 'button';
  cancel.addEventListener('click', () => root.removeChild(sheet));

  const actions = el('div', 'career-sheet__actions');
  actions.append(save, cancel);
  inner.append(titleField, whereField, aliasesField, colourField, criteriaHost, addCrit, actions, status);
  sheet.append(inner);
  root.append(sheet);
}
