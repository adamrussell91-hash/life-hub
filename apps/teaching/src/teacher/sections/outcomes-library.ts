import type { CurriculumOutcome } from '@/schemas/outcome';
import type { Subject } from '@/schemas/subject';
import type { CurriculumResponse } from '@/teacher/nav';
import { catalogForSubject, filterOutcomeCatalog, groupOutcomeCatalog } from '@/curriculum/outcome-catalog';
import { navigate } from '@/app/router';
import { askConfirmCard, askSelectCard, askTextCard } from '@/teacher/confirm-dialog';
import { mountPageOptionsMenu } from '@/teacher/page-options-menu';
import {
  createCustomOutcome,
  deleteOutcome,
  mergeOutcome,
  patchOutcome,
  saveOutcomeOrder,
  type OutcomePatch
} from '@/outcomes/api';
import {
  duplicateSets,
  groupNames,
  moveGroup,
  moveOutcome,
  orderAfterRegroup,
  outcomeUsageMap,
  usageLabel,
  type OutcomeUsageRow
} from '@/outcomes/manage';

export interface OutcomesLibraryOptions {
  /** Runs a write, then reloads the curriculum and remounts the page. */
  run: (task: () => Promise<void>) => void;
}

const NEW_GROUP = '__new_group';

/** Survive the remount after each save, so the teacher stays on the same subject and search. */
let currentSubjectId: string | null = null;
let currentQuery = '';

export function resetOutcomesLibraryForTests(): void {
  currentSubjectId = null;
  currentQuery = '';
}

export function libraryOutcomeCount(curriculum: CurriculumResponse): number {
  return (curriculum.outcomes ?? []).filter((outcome) => outcome.status !== 'trashed').length;
}

function subjectsWithOutcomes(curriculum: CurriculumResponse): Subject[] {
  const outcomes = curriculum.outcomes ?? [];
  return curriculum.subjects
    .filter((subject) => subject.status !== 'trashed' && subject.status !== 'archived')
    .sort((a, b) => {
      const count = (id: string) => outcomes.filter((row) => row.subject_id === id).length;
      return Number(count(b.id) > 0) - Number(count(a.id) > 0) || a.title.localeCompare(b.title);
    });
}

export function renderOutcomesLibrary(
  host: HTMLElement,
  curriculum: CurriculumResponse,
  options: OutcomesLibraryOptions
): void {
  const subjects = subjectsWithOutcomes(curriculum);
  const title = document.createElement('h2');
  title.className = 'resources-main__title';
  title.textContent = 'Outcomes';
  host.append(title);

  if (!subjects.length) {
    host.append(note('Add a subject first, then its outcomes live here.'));
    return;
  }
  if (!subjects.some((subject) => subject.id === currentSubjectId)) currentSubjectId = subjects[0]!.id;
  const subject = subjects.find((row) => row.id === currentSubjectId)!;
  const catalog = catalogForSubject(subject, curriculum.outcomes ?? []);
  const usage = outcomeUsageMap(curriculum);
  const { run } = options;

  const saveOrder = (ids: string[] | null): void => {
    if (!ids) return;
    run(async () => {
      await saveOutcomeOrder(subject.id, ids);
    });
  };

  // Subject switcher.
  if (subjects.length > 1) {
    const pills = document.createElement('div');
    pills.className = 'hub-pills hub-pills--loose outcomes-lib__subjects';
    pills.setAttribute('role', 'group');
    pills.setAttribute('aria-label', 'Subject');
    for (const row of subjects) {
      const pill = document.createElement('button');
      pill.type = 'button';
      pill.className = 'hub-pills__btn';
      pill.textContent = row.title;
      pill.dataset.outcomesSubject = row.id;
      pill.setAttribute('aria-pressed', row.id === subject.id ? 'true' : 'false');
      pill.addEventListener('click', () => {
        if (row.id === subject.id) return;
        currentSubjectId = row.id;
        host.replaceChildren();
        renderOutcomesLibrary(host, curriculum, options);
      });
      pills.append(pill);
    }
    host.append(pills);
  }

  // Toolbar: search and New outcome.
  const bar = document.createElement('div');
  bar.className = 'outcomes-lib__bar';
  const search = document.createElement('input');
  search.type = 'search';
  search.className = 'outcomes-lib__search';
  search.placeholder = 'Search codes or wording…';
  search.setAttribute('aria-label', 'Search outcomes');
  search.value = currentQuery;
  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'btn btn--secondary';
  addBtn.dataset.outcomesNew = '';
  addBtn.textContent = 'New outcome';
  bar.append(search, addBtn);
  host.append(bar);

  const formSlot = document.createElement('div');
  const body = document.createElement('div');
  body.className = 'outcomes-lib__body';
  host.append(formSlot, body);

  addBtn.addEventListener('click', () => {
    formSlot.replaceChildren(
      outcomeForm({
        heading: 'New outcome',
        groups: groupNames(catalog),
        saveLabel: 'Add outcome',
        onCancel: () => formSlot.replaceChildren(),
        onSave: (values) =>
          run(async () => {
            await createCustomOutcome({ subject_id: subject.id, ...values });
          })
      })
    );
    formSlot.querySelector<HTMLInputElement>('input')?.focus();
  });

  const paint = (): void => {
    body.replaceChildren();
    const searching = currentQuery.trim().length > 0;
    const dupes = duplicateSets(catalog);
    if (dupes.length && !searching) body.append(duplicatePanel(dupes, usage, run));

    const visible = filterOutcomeCatalog(catalog, currentQuery);
    if (!catalog.length) {
      body.append(note(`${subject.title} has no outcomes yet. Use New outcome to add one.`));
      return;
    }
    if (!visible.length) {
      body.append(note('No outcomes match that search.'));
      return;
    }
    const groups = groupOutcomeCatalog(visible);
    groups.forEach((group, groupIndex) => {
      const section = document.createElement('section');
      section.className = 'outcomes-lib__group';
      section.dataset.outcomesGroup = group.group;

      const head = document.createElement('div');
      head.className = 'outcomes-lib__group-head';
      const heading = document.createElement('h3');
      heading.className = 'outcomes-lib__group-title';
      heading.textContent = group.group;
      const count = document.createElement('span');
      count.className = 'outcomes-lib__count';
      count.textContent = String(group.outcomes.length);
      heading.append(' ', count);
      head.append(heading);
      if (!searching) {
        const tools = document.createElement('div');
        tools.className = 'outcomes-lib__tools';
        tools.append(
          stepButton('Move group up', '↑', groupIndex === 0, () => saveOrder(moveGroup(catalog, group.group, -1))),
          stepButton('Move group down', '↓', groupIndex === groups.length - 1, () =>
            saveOrder(moveGroup(catalog, group.group, 1))
          )
        );
        const rename = document.createElement('button');
        rename.type = 'button';
        rename.className = 'btn btn--ghost outcomes-lib__rename';
        rename.textContent = 'Rename';
        rename.setAttribute('aria-label', `Rename group ${group.group}`);
        rename.addEventListener('click', () => {
          void askTextCard({
            eyebrow: 'Outcomes',
            title: 'Rename group',
            value: group.group,
            confirmLabel: 'Rename'
          }).then((name) => {
            if (!name || name === group.group) return;
            run(async () => {
              for (const outcome of group.outcomes) await patchOutcome(outcome.id, { group: name });
            });
          });
        });
        tools.append(rename);
        head.append(tools);
      }
      section.append(head);

      const list = document.createElement('ol');
      list.className = 'outcomes-lib__list';
      group.outcomes.forEach((outcome, index) => {
        list.append(
          outcomeRow(outcome, {
            usage: usage.get(outcome.id) ?? [],
            catalog,
            searching,
            first: index === 0,
            last: index === group.outcomes.length - 1,
            run,
            saveOrder
          })
        );
      });
      section.append(list);
      body.append(section);
    });
  };

  search.addEventListener('input', () => {
    currentQuery = search.value;
    paint();
  });
  paint();
}

function duplicatePanel(
  sets: CurriculumOutcome[][],
  usage: Map<string, OutcomeUsageRow[]>,
  run: OutcomesLibraryOptions['run']
): HTMLElement {
  const panel = document.createElement('section');
  panel.className = 'outcomes-lib__dupes';
  panel.dataset.outcomesDuplicates = '';
  const heading = document.createElement('h3');
  heading.className = 'outcomes-lib__dupes-title';
  heading.textContent = sets.length === 1 ? 'One code is saved more than once' : `${sets.length} codes are saved more than once`;
  const lead = document.createElement('p');
  lead.className = 'outcomes-lib__dupes-lead';
  lead.textContent = 'Pick the copy to keep. Lessons and units tagged with the other copies move onto it, then the copies are deleted.';
  panel.append(heading, lead);

  for (const set of sets) {
    const card = document.createElement('div');
    card.className = 'outcomes-lib__dupe';
    const code = document.createElement('p');
    code.className = 'outcomes-lib__dupe-code';
    code.textContent = `${set[0]!.code} · ${set.length} copies`;
    card.append(code);
    for (const outcome of set) {
      const row = document.createElement('div');
      row.className = 'outcomes-lib__dupe-row';
      const copy = document.createElement('div');
      copy.className = 'outcomes-lib__dupe-copy';
      const titleEl = document.createElement('strong');
      titleEl.textContent = outcome.title;
      const wording = document.createElement('p');
      wording.textContent = outcome.description;
      const meta = document.createElement('p');
      meta.className = 'outcomes-lib__meta';
      meta.textContent = `${outcome.group} · ${usageLabel(usage.get(outcome.id) ?? [])}`;
      copy.append(titleEl, wording, meta);
      const keep = document.createElement('button');
      keep.type = 'button';
      keep.className = 'btn btn--secondary';
      keep.textContent = 'Keep this one';
      keep.dataset.outcomesKeep = outcome.id;
      keep.addEventListener('click', () => {
        const others = set.filter((row) => row.id !== outcome.id);
        const moved = others.reduce((sum, row) => sum + (usage.get(row.id)?.length ?? 0), 0);
        void askConfirmCard({
          eyebrow: 'Outcomes',
          title: `Keep this copy of ${outcome.code}?`,
          supporting: moved
            ? `${moved} tag${moved === 1 ? '' : 's'} on lessons and units move onto it. The other ${others.length === 1 ? 'copy is' : 'copies are'} deleted.`
            : `The other ${others.length === 1 ? 'copy is' : 'copies are'} deleted.`,
          confirmLabel: 'Keep and merge'
        }).then((ok) => {
          if (!ok) return;
          run(async () => {
            for (const row of others) await mergeOutcome(row.id, outcome.id);
          });
        });
      });
      row.append(copy, keep);
      card.append(row);
    }
    panel.append(card);
  }
  return panel;
}

function outcomeRow(
  outcome: CurriculumOutcome,
  ctx: {
    usage: OutcomeUsageRow[];
    catalog: CurriculumOutcome[];
    searching: boolean;
    first: boolean;
    last: boolean;
    run: OutcomesLibraryOptions['run'];
    saveOrder: (ids: string[] | null) => void;
  }
): HTMLLIElement {
  const { catalog, run, saveOrder } = ctx;
  const item = document.createElement('li');
  item.className = 'outcomes-lib__row';
  item.dataset.outcomeId = outcome.id;

  const view = document.createElement('div');
  view.className = 'outcomes-lib__view';
  const copy = document.createElement('div');
  copy.className = 'outcomes-lib__copy';
  const head = document.createElement('p');
  head.className = 'outcomes-lib__head';
  const code = document.createElement('strong');
  code.className = 'outcomes-lib__code';
  code.textContent = outcome.code;
  head.append(code, document.createTextNode(` ${outcome.title}`));
  if (outcome.source === 'nesa') {
    const tag = document.createElement('span');
    tag.className = 'outcomes-lib__tag';
    tag.textContent = 'NESA';
    head.append(' ', tag);
  }
  const wording = document.createElement('p');
  wording.className = 'outcomes-lib__wording';
  wording.textContent = outcome.description;
  copy.append(head, wording, usageLine(ctx.usage));

  const actions = document.createElement('div');
  actions.className = 'outcomes-lib__actions';
  if (!ctx.searching) {
    actions.append(
      stepButton(`Move ${outcome.code} up`, '↑', ctx.first, () => saveOrder(moveOutcome(catalog, outcome.id, -1))),
      stepButton(`Move ${outcome.code} down`, '↓', ctx.last, () => saveOrder(moveOutcome(catalog, outcome.id, 1)))
    );
  }
  const edit = document.createElement('button');
  edit.type = 'button';
  edit.className = 'btn btn--ghost';
  edit.textContent = 'Edit';
  edit.dataset.outcomesEdit = outcome.id;
  edit.setAttribute('aria-label', `Edit ${outcome.code}`);
  actions.append(edit);

  const others = catalog.filter((row) => row.id !== outcome.id);
  const menu = mountPageOptionsMenu(
    [
      {
        label: 'Move to group',
        onSelect: () => {
          void askSelectCard({
            eyebrow: 'Outcomes',
            title: `Move ${outcome.code} to a group`,
            choices: [
              ...groupNames(catalog).map((name) => ({ value: name, label: name })),
              { value: NEW_GROUP, label: 'New group…' }
            ],
            value: outcome.group,
            confirmLabel: 'Move'
          }).then(async (choice) => {
            if (choice === null) return;
            const group =
              choice === NEW_GROUP
                ? await askTextCard({ eyebrow: 'Outcomes', title: 'New group', placeholder: 'Group name', confirmLabel: 'Move' })
                : choice;
            if (!group || group === outcome.group) return;
            run(async () => {
              await patchOutcome(outcome.id, { group });
              await saveOutcomeOrder(outcome.subject_id, orderAfterRegroup(catalog, outcome.id, group));
            });
          });
        }
      },
      ...(others.length
        ? [
            {
              label: 'Merge into…',
              onSelect: () => {
                void askSelectCard({
                  eyebrow: 'Outcomes',
                  title: `Merge ${outcome.code} into another outcome`,
                  choices: others.map((row) => ({ value: row.id, label: `${row.code} ${row.title}` })),
                  confirmLabel: 'Merge'
                }).then((into) => {
                  if (!into) return;
                  run(async () => {
                    await mergeOutcome(outcome.id, into);
                  });
                });
              }
            }
          ]
        : []),
      {
        label: 'Delete',
        danger: true,
        onSelect: () => {
          if (ctx.usage.length) {
            void askConfirmCard({
              eyebrow: 'Outcomes',
              title: `${outcome.code} is in use`,
              supporting: `${usageLabel(ctx.usage)}. Use Merge into… to move those tags onto another outcome first.`,
              confirmLabel: 'OK',
              discardLabel: 'Close'
            });
            return;
          }
          void askConfirmCard({
            eyebrow: 'Outcomes',
            title: `Delete ${outcome.code}?`,
            supporting: 'No lesson or unit uses it. This cannot be undone.',
            confirmLabel: 'Delete'
          }).then((ok) => {
            if (!ok) return;
            run(async () => {
              await deleteOutcome(outcome.id);
            });
          });
        }
      }
    ],
    { label: `Options for ${outcome.code}` }
  );
  actions.append(menu.el);
  view.append(copy, actions);
  item.append(view);

  edit.addEventListener('click', () => {
    const form = outcomeForm({
      heading: `Edit ${outcome.code}`,
      groups: groupNames(catalog),
      values: outcome,
      saveLabel: 'Save',
      onCancel: () => {
        form.remove();
        view.hidden = false;
      },
      onSave: (values) => {
        const patch: OutcomePatch = {};
        for (const key of ['code', 'title', 'description', 'group'] as const) {
          if (values[key] !== outcome[key]) patch[key] = values[key];
        }
        if ((values.short ?? '') !== (outcome.short ?? '')) patch.short = values.short ?? '';
        if (!Object.keys(patch).length) {
          form.remove();
          view.hidden = false;
          return;
        }
        run(async () => {
          await patchOutcome(outcome.id, patch);
          if (patch.group) await saveOutcomeOrder(outcome.subject_id, orderAfterRegroup(catalog, outcome.id, patch.group));
        });
      }
    });
    view.hidden = true;
    item.append(form);
    form.querySelector<HTMLInputElement>('input')?.focus();
  });

  return item;
}

function usageLine(rows: OutcomeUsageRow[]): HTMLElement {
  if (!rows.length) {
    const meta = document.createElement('p');
    meta.className = 'outcomes-lib__meta';
    meta.textContent = usageLabel(rows);
    return meta;
  }
  const details = document.createElement('details');
  details.className = 'outcomes-lib__usage';
  const summary = document.createElement('summary');
  summary.textContent = usageLabel(rows);
  const list = document.createElement('ul');
  for (const row of rows) {
    const li = document.createElement('li');
    const link = document.createElement('a');
    link.href = row.href;
    link.textContent = `${row.kind === 'unit' ? 'Unit' : 'Lesson'}: ${row.title}`;
    link.addEventListener('click', (event) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      navigate(row.href);
    });
    li.append(link);
    list.append(li);
  }
  details.append(summary, list);
  return details;
}

interface OutcomeFormValues {
  code: string;
  title: string;
  description: string;
  group: string;
  short?: string;
}

function outcomeForm(config: {
  heading: string;
  groups: string[];
  values?: OutcomeFormValues;
  saveLabel: string;
  onSave: (values: OutcomeFormValues) => void;
  onCancel: () => void;
}): HTMLFormElement {
  const form = document.createElement('form');
  form.className = 'outcomes-lib__form';
  form.dataset.outcomesForm = '';
  const heading = document.createElement('p');
  heading.className = 'outcomes-lib__form-title';
  heading.textContent = config.heading;

  const listId = `outcome-groups-${Math.random().toString(36).slice(2, 8)}`;
  const datalist = document.createElement('datalist');
  datalist.id = listId;
  for (const name of config.groups) {
    const option = document.createElement('option');
    option.value = name;
    datalist.append(option);
  }

  const code = field('Code', 'input', config.values?.code ?? '', 'EAV-12-01');
  const title = field('Short title', 'input', config.values?.title ?? '', 'What the chip shows');
  const group = field('Group', 'input', config.values?.group ?? config.groups[0] ?? 'Custom', 'Module A');
  group.control.setAttribute('list', listId);
  const short = field('Short name for students', 'input', config.values?.short ?? '', 'Analysis');
  short.control.maxLength = 40;
  const description = field('Full wording', 'textarea', config.values?.description ?? '', 'The outcome as the syllabus words it');

  const error = document.createElement('p');
  error.className = 'outcomes-lib__form-error';
  error.hidden = true;

  const actions = document.createElement('div');
  actions.className = 'outcomes-lib__form-actions';
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'btn btn--ghost';
  cancel.textContent = 'Cancel';
  cancel.addEventListener('click', config.onCancel);
  const save = document.createElement('button');
  save.type = 'submit';
  save.className = 'btn btn--primary';
  save.textContent = config.saveLabel;
  actions.append(cancel, save);

  const pair = document.createElement('div');
  pair.className = 'outcomes-lib__form-pair';
  pair.append(code.wrap, group.wrap);
  form.append(heading, pair, title.wrap, short.wrap, description.wrap, datalist, error, actions);

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const values = {
      code: code.control.value.trim(),
      title: title.control.value.trim(),
      description: description.control.value.trim(),
      group: group.control.value.trim() || 'Custom',
      short: short.control.value.trim()
    };
    if (!values.code || !values.title || !values.description) {
      error.hidden = false;
      error.textContent = 'Code, short title and full wording are all needed.';
      return;
    }
    config.onSave(values);
  });
  return form;
}

function field(
  label: string,
  kind: 'input' | 'textarea',
  value: string,
  placeholder: string
): { wrap: HTMLLabelElement; control: HTMLInputElement | HTMLTextAreaElement } {
  const wrap = document.createElement('label');
  wrap.className = 'outcomes-lib__field';
  const text = document.createElement('span');
  text.textContent = label;
  const control = document.createElement(kind);
  if (control instanceof HTMLInputElement) control.type = 'text';
  else control.rows = 4;
  control.value = value;
  control.placeholder = placeholder;
  wrap.append(text, control);
  return { wrap, control };
}

function stepButton(label: string, glyph: string, disabled: boolean, onClick: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'hub-icon-btn outcomes-lib__step';
  button.textContent = glyph;
  button.setAttribute('aria-label', label);
  button.title = label;
  button.disabled = disabled;
  button.addEventListener('click', onClick);
  return button;
}

function note(text: string): HTMLParagraphElement {
  const p = document.createElement('p');
  p.className = 'resources-main__empty';
  p.textContent = text;
  return p;
}
