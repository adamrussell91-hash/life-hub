import { createEntityPicker } from '../../design-kit/js/entity-picker.js';
import { createFuture, createStone, updateFuture } from '@/api/career';
import { clearAnnJob, draftFuture, startFutureCheck, waitForAnnJob } from '@/api/career-ann-job';
import { searchEntities } from '@/api/entities';
import { createTask, createUniversalLink } from '@/api/universal-links';
import { careerCardRoute } from '@/app/router';
import type { CareerFutureModel } from '@/domain/career-model';
import {
  reconcileCriteria,
  readsAsAd,
  splitCriteriaLines,
  type SavedCriterion
} from '@/domain/career-criteria-paste';
import { branchColour } from '@/domain/career-river-geometry';

type FutureModel = CareerFutureModel;

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string | null,
  text?: string | null
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function coverageDot(coverage: number, status: string | undefined): string {
  if (status === 'not_yet' && coverage < 0.5) return 'career-future__dot career-future__dot--gap';
  if (coverage >= 1) return 'career-future__dot career-future__dot--green';
  if (coverage >= 0.5) return 'career-future__dot career-future__dot--amber';
  return 'career-future__dot career-future__dot--none';
}

function formatFadingSince(iso: string | null | undefined): string {
  if (!iso) return 'a while';
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso);
  if (!Number.isFinite(d.getTime())) return 'a while';
  return d.toLocaleString('en-AU', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

type AnnDraft = {
  title?: string;
  where?: string | null;
  aliases?: string[];
  criteria?: Array<{ text: string; source?: string }>;
  fallback?: boolean;
};

async function askAnn(title: string, description: string): Promise<AnnDraft> {
  const result = await draftFuture<{ draft?: AnnDraft }>({ title, description });
  return result.draft ?? {};
}

const BOX_HINT = 'Paste the job ad or the criteria, or type them. One per line.';

/** The one box a role's criteria live in. Says how the paste reads as you go. */
function criteriaBox(initial: string): {
  root: HTMLElement;
  input: HTMLTextAreaElement;
  setText: (text: string) => void;
  isDirty: () => boolean;
} {
  const root = el('div', 'career-criteria-box');
  const input = el('textarea', 'career-criteria-box__input') as HTMLTextAreaElement;
  input.rows = 9;
  input.value = initial;
  input.setAttribute('aria-label', 'What this role asks for');
  const note = el('p', 'career-page__meta career-criteria-box__note');
  const refresh = () => {
    const text = input.value;
    const count = splitCriteriaLines(text).length;
    if (!count) note.textContent = '';
    else if (readsAsAd(text)) note.textContent = 'Reads like a full ad. Ann picks out the criteria when you save.';
    else note.textContent = count === 1 ? '1 criterion' : `${count} criteria`;
  };
  input.addEventListener('input', refresh);
  refresh();
  root.append(input, note);
  return {
    root,
    input,
    setText: (text) => {
      input.value = text;
      refresh();
    },
    isDirty: () => input.value.trim() !== initial.trim()
  };
}

/** What the box will save. An ad goes through Ann first; a list stays word for word. */
async function criteriaFromBox(
  text: string,
  title: string,
  existing: FutureModel['criteria'],
  onAnn: () => void
): Promise<{ criteria: SavedCriterion[]; draft: AnnDraft | null }> {
  if (!readsAsAd(text)) {
    const lines = splitCriteriaLines(text).map((line) => ({ text: line }));
    return { criteria: reconcileCriteria(lines, existing), draft: null };
  }
  onAnn();
  const draft = await askAnn(title, text);
  if (!draft.criteria?.length) throw new Error('Ann could not find any criteria. Your paste is still here.');
  return { criteria: reconcileCriteria(draft.criteria, existing), draft };
}

/** Ann reads the box (or just the title, if it is empty) and fills it back in. */
function annDraftButton(
  box: ReturnType<typeof criteriaBox>,
  status: HTMLElement,
  title: () => string,
  onDraft: (draft: AnnDraft) => void = () => {}
): HTMLButtonElement {
  const button = el('button', 'btn btn--ghost', 'Ask Ann to draft') as HTMLButtonElement;
  button.type = 'button';
  button.addEventListener('click', () => {
    void (async () => {
      button.disabled = true;
      status.textContent = 'Ann is drafting…';
      try {
        const draft = await askAnn(title(), box.input.value);
        const lines = (draft.criteria ?? []).map((c) => c.text);
        if (lines.length) box.setText(lines.join('\n'));
        onDraft(draft);
        status.textContent = lines.length
          ? `Ann drafted ${lines.length} criteria${draft.fallback ? ' offline' : ''}. Edit anything, then save.`
          : 'Ann had nothing to add.';
      } catch (error) {
        status.textContent = error instanceof Error ? error.message : 'Could not draft. Try again.';
      } finally {
        button.disabled = false;
      }
    })();
  });
  return button;
}

/** The empty panel's one job: take the paste, right here, with no sheet to open. */
function inlineCriteriaForm(future: FutureModel, onChanged: () => void): HTMLElement {
  const form = el('div', 'career-future__criteria-empty');
  form.append(
    el(
      'p',
      'career-page__meta',
      `${BOX_HINT} Skill cards linked to a line count towards your readiness.`
    )
  );
  const box = criteriaBox('');
  const status = el('p', 'career-page__meta');
  status.setAttribute('role', 'status');
  const save = el('button', 'btn btn--primary', 'Save criteria') as HTMLButtonElement;
  save.type = 'button';
  save.addEventListener('click', () => {
    void (async () => {
      if (!box.input.value.trim()) {
        status.textContent = 'Paste or type what the role asks for first.';
        box.input.focus();
        return;
      }
      save.disabled = true;
      status.textContent = 'Saving…';
      try {
        const { criteria } = await criteriaFromBox(box.input.value, future.title, future.criteria, () => {
          status.textContent = 'Ann is picking out the criteria…';
        });
        await updateFuture(future.id, { criteria });
        onChanged();
      } catch (error) {
        status.textContent = error instanceof Error ? error.message : 'Could not save. Your paste is still here.';
        save.disabled = false;
      }
    })();
  });
  const actions = el('div', 'career-sheet__actions');
  actions.append(save, annDraftButton(box, status, () => future.title));
  form.append(box.root, status, actions);
  return form;
}

/**
 * Detailed Future panel for the selected branch.
 */
export function renderFutureDetail(
  host: HTMLElement,
  future: FutureModel,
  options: { onChanged: () => void; onClose?: () => void }
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

  // No score until a skill card is linked: 0% would read as a verdict on Adam.
  if (future.checked) {
    const ring = el('div', 'career-future__ring');
    ring.style.setProperty('--ring-color', branchColour(future.colour_slot));
    ring.style.setProperty('--ring-pct', String(future.readiness));
    ring.append(el('span', 'career-future__ring-label', future.readiness_label));
    head.append(ring);
  }
  if (options.onClose) {
    const close = el('button', 'btn btn--ghost career-future__close', 'Close') as HTMLButtonElement;
    close.type = 'button';
    close.setAttribute('aria-label', `Close ${future.title}`);
    close.addEventListener('click', options.onClose);
    head.append(close);
  }
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
  if (future.criteria.length) {
    panel.append(
      el(
        'p',
        'career-page__meta',
        future.checked
          ? 'Green: you have it. Amber: partly. Rose: not yet. Empty: no answer yet.'
          : 'Not checked yet. Ann reads your Work history, skill cards and Central Node and suggests an answer for each line, for about 10c. Nothing counts until you confirm it.'
      )
    );
  }
  const criteriaList = el('ul', 'career-future__criteria');
  for (const criterion of [...future.criteria].sort((a, b) => a.order - b.order)) {
    const li = document.createElement('li');
    li.className = 'career-future__criterion';
    const row = el('div', 'career-future__criterion-row');
    row.append(el('span', coverageDot(criterion.coverage, criterion.met?.status)));
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
    if (criterion.met?.evidence) li.append(el('p', 'career-page__meta career-future__evidence', criterion.met.evidence));
    // Only an answered gap: an unanswered line says nothing about Adam.
    if (criterion.coverage < 1 && (criterion.met?.status === 'not_yet' || criterion.met?.status === 'partly')) {
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
      row.append(make);
    }
    criteriaList.append(li);
  }
  if (future.criteria.length) {
    panel.append(criteriaList);
    panel.append(checkActions(future, options.onChanged));
  } else {
    panel.append(inlineCriteriaForm(future, options.onChanged));
  }

  const stones = future.stones ?? [];
  const stonesList = el('ul', 'career-future__stones');
  if (stones.length || future.criteria.length) {
    panel.append(el('h3', 'career-future__subhead', 'Stepping stones'));
  }
  if (!stones.length && future.criteria.length) {
    stonesList.append(el('li', 'empty-state', 'No stepping stones yet. Lines you mark Partly or Not yet can become one.'));
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
          const task = await createTask({ title: stone.label, status: 'todo' });
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
    input.placeholder = 'Link existing task…';
    input.setAttribute('aria-label', 'Link existing task');
    linkExisting.append(input);
    createEntityPicker({
      mode: 'field',
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
  if (stones.length || future.criteria.length) panel.append(stonesList);

  const edit = el('button', 'btn btn--ghost career-future__edit', 'Edit future') as HTMLButtonElement;
  edit.type = 'button';
  edit.addEventListener('click', () => {
    openEditFutureSheet(document.body, future, options.onChanged);
  });
  panel.append(edit);

  host.append(panel);
}

/**
 * Escape and clicking outside close a sheet, unless that would throw away what
 * has been pasted. Cancel always closes.
 */
function sheetCloser(
  sheet: HTMLElement,
  isDirty: () => boolean,
  warn: (message: string) => void
): () => void {
  const close = () => {
    document.removeEventListener('keydown', onKey);
    sheet.remove();
  };
  const closeIfClean = () => {
    if (isDirty()) warn('Press Cancel to discard this, or Save to keep it.');
    else close();
  };
  const onKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape') closeIfClean();
  };
  document.addEventListener('keydown', onKey);
  sheet.addEventListener('click', (event) => {
    if (event.target === sheet) closeIfClean();
  });
  return close;
}

type MetStatus = 'have' | 'partly' | 'not_yet';
type CheckSuggestion = { criterion_id: string; status: MetStatus | 'unknown'; evidence: string };
type CheckResult = { suggestions?: CheckSuggestion[]; read_central_node?: boolean };

const MET_CHOICES: Array<[MetStatus, string]> = [
  ['have', 'Have it'],
  ['partly', 'Partly'],
  ['not_yet', 'Not yet']
];

/**
 * One line per criterion, one tap each. Ann's answers arrive already chosen, so
 * confirming her is one press of Save; nothing counts until then.
 */
function openCheckSheet(
  future: FutureModel,
  result: CheckResult | null,
  onSaved: () => void,
  onDone: () => void = () => {}
): void {
  const sheet = el('div', 'career-sheet');
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.setAttribute('aria-label', `Check ${future.title}`);
  const inner = el('div', 'career-sheet__inner career-check');
  inner.append(el('h2', 'career-page__heading', result ? 'Does this sound right?' : future.title));
  inner.append(
    el(
      'p',
      'career-page__meta career-sheet__hint',
      result
        ? `Ann read your Work history, skill cards${result.read_central_node ? ' and Central Node' : ''}. Change anything she got wrong, then save.`
        : 'Tap the answer for each line. Tap it again to clear it.'
    )
  );
  if (result && !result.read_central_node) {
    inner.append(el('p', 'career-page__meta career-sheet__hint', 'Your Central Node did not load, so she may have missed things.'));
  }

  const suggested = new Map((result?.suggestions ?? []).map((s) => [s.criterion_id, s]));
  const answers = new Map<string, { status: MetStatus; evidence: string } | null>();
  const list = el('div', 'career-check__list');
  let changed = Boolean(result);

  for (const criterion of [...future.criteria].sort((a, b) => a.order - b.order)) {
    const suggestion = suggested.get(criterion.id);
    const fromAnn = suggestion && suggestion.status !== 'unknown' ? { status: suggestion.status, evidence: suggestion.evidence } : null;
    const saved = criterion.met ? { status: criterion.met.status, evidence: criterion.met.evidence ?? '' } : null;
    const initial = fromAnn ?? saved;
    answers.set(criterion.id, initial);

    const row = el('div', 'career-check__row');
    row.append(el('p', 'career-check__text', criterion.text));
    const reason = el('p', 'career-page__meta career-check__reason');
    const showReason = () => {
      const answer = answers.get(criterion.id);
      if (answer?.evidence) reason.textContent = answer.evidence;
      else if (!answer && result) reason.textContent = 'Ann found nothing on this. You will know.';
      else reason.textContent = '';
      reason.hidden = !reason.textContent;
    };
    const choices = el('div', 'career-check__choices');
    const paint = () => {
      for (const button of choices.querySelectorAll('button')) {
        button.setAttribute('aria-pressed', String(button.dataset.status === answers.get(criterion.id)?.status));
      }
    };
    for (const [status, label] of MET_CHOICES) {
      const choice = el('button', 'career-check__choice', label) as HTMLButtonElement;
      choice.type = 'button';
      choice.dataset.status = status;
      choice.addEventListener('click', () => {
        // Ann's reason explains her answer, so it goes when the answer changes.
        const same = answers.get(criterion.id)?.status === status;
        answers.set(criterion.id, same ? null : { status, evidence: initial?.status === status ? initial.evidence : '' });
        changed = true;
        paint();
        showReason();
      });
      choices.append(choice);
    }
    paint();
    showReason();
    row.append(reason, choices);
    list.append(row);
  }

  const status = el('p', 'career-page__meta');
  status.setAttribute('role', 'status');
  const closeSheet = sheetCloser(sheet, () => changed, (message) => {
    status.textContent = message;
  });
  const close = () => {
    closeSheet();
    onDone();
  };

  const save = el('button', 'btn btn--primary', 'Save answers') as HTMLButtonElement;
  save.type = 'button';
  save.addEventListener('click', () => {
    void (async () => {
      save.disabled = true;
      status.textContent = 'Saving…';
      try {
        await updateFuture(future.id, {
          criteria: future.criteria.map((c) => ({
            id: c.id,
            text: c.text,
            order: c.order,
            source: c.source,
            met: answers.get(c.id) ?? null
          }))
        });
        close();
        onSaved();
      } catch (error) {
        status.textContent = error instanceof Error ? error.message : 'Could not save. Your answers are still here.';
        save.disabled = false;
      }
    })();
  });
  const cancel = el('button', 'btn btn--ghost', 'Cancel') as HTMLButtonElement;
  cancel.type = 'button';
  cancel.addEventListener('click', close);
  const actions = el('div', 'career-sheet__actions');
  actions.append(save, cancel);

  inner.append(list, status, actions);
  sheet.append(inner);
  document.body.append(sheet);
}

/** Survives a page reload, so Adam can leave while Ann works and find her answers after. */
function checkJobKey(futureId: string): string {
  return `career-ann-check:${futureId}`;
}

function savedCheckJob(futureId: string): string | null {
  try {
    return sessionStorage.getItem(checkJobKey(futureId));
  } catch {
    return null;
  }
}

function rememberCheckJob(futureId: string, jobId: string | null): void {
  try {
    if (jobId) sessionStorage.setItem(checkJobKey(futureId), jobId);
    else sessionStorage.removeItem(checkJobKey(futureId));
  } catch {
    /* Private mode: the wait still works until the page reloads. */
  }
}

/** Ask Ann, or answer the lines without her. */
function checkActions(future: FutureModel, onChanged: () => void): HTMLElement {
  const wrap = el('div', 'career-check__start');
  const status = el('p', 'career-page__meta career-sheet__hint');
  status.setAttribute('role', 'status');
  const ask = el(
    'button',
    future.checked ? 'btn btn--secondary' : 'btn btn--primary',
    future.checked ? 'Check again with Ann' : 'Ask Ann to check'
  ) as HTMLButtonElement;
  ask.type = 'button';

  const waitForAnswers = (jobId: string) => {
    ask.disabled = true;
    status.textContent = 'Ann is reading your record. You can leave this page; her answers will be here when you come back.';
    void waitForAnnJob<CheckResult>(jobId).then(
      (result) => {
        // Away from this panel: the job stays put, and coming back picks it up.
        if (!ask.isConnected) return;
        status.textContent = '';
        ask.disabled = false;
        if (document.querySelector('.career-check')) return;
        openCheckSheet(future, result, onChanged, () => {
          rememberCheckJob(future.id, null);
          clearAnnJob(jobId);
        });
      },
      (error) => {
        rememberCheckJob(future.id, null);
        if (!ask.isConnected) return;
        status.textContent = error instanceof Error ? error.message : 'Ann could not finish. Try again.';
        ask.disabled = false;
      }
    );
  };

  ask.addEventListener('click', () => {
    void (async () => {
      ask.disabled = true;
      status.textContent = 'Starting Ann…';
      try {
        const jobId = await startFutureCheck(future.id);
        rememberCheckJob(future.id, jobId);
        waitForAnswers(jobId);
      } catch (error) {
        status.textContent = error instanceof Error ? error.message : 'Ann could not start. Try again.';
        ask.disabled = false;
      }
    })();
  });
  const pendingJob = savedCheckJob(future.id);
  if (pendingJob) waitForAnswers(pendingJob);
  const self = el('button', 'btn btn--ghost', future.checked ? 'Change answers' : 'Answer them myself') as HTMLButtonElement;
  self.type = 'button';
  self.addEventListener('click', () => openCheckSheet(future, null, onChanged));
  const edit = el('button', 'btn btn--ghost', 'Edit criteria') as HTMLButtonElement;
  edit.type = 'button';
  edit.addEventListener('click', () => {
    openEditFutureSheet(document.body, future, onChanged, { focusCriteria: true });
  });
  const buttons = el('div', 'career-sheet__actions');
  buttons.append(ask, self, edit);
  wrap.append(buttons, status);
  return wrap;
}

/**
 * `existingCount` = futures already on file (active + parked), so each new
 * branch gets its own colour and lane instead of all sharing slot 1 / lane 0.
 */
export function openAddFutureSheet(
  root: HTMLElement,
  onSaved: (futureId: string) => void,
  existingCount = 0
): void {
  const sheet = el('div', 'career-sheet');
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.setAttribute('aria-label', 'Add a future');
  const inner = el('div', 'career-sheet__inner');
  inner.append(el('h2', 'career-page__heading', 'Add a future'));

  const titleField = el('label', 'career-sheet__field', 'Role title');
  const titleInput = el('input') as HTMLInputElement;
  titleInput.type = 'text';
  titleInput.required = true;
  titleField.append(titleInput);

  const asks = el('div', 'career-sheet__field');
  asks.append(el('span', null, 'What this role asks for'));
  asks.append(el('p', 'career-page__meta career-sheet__hint', BOX_HINT));
  const box = criteriaBox('');
  asks.append(box.root);

  const status = el('p', 'career-page__meta');
  status.setAttribute('role', 'status');

  // Filled when Ann reads the paste; saved alongside the criteria.
  let annDraft: AnnDraft | null = null;
  const close = sheetCloser(
    sheet,
    () => box.isDirty() || Boolean(titleInput.value.trim()),
    (message) => {
      status.textContent = message;
    }
  );

  const save = el('button', 'btn btn--primary', 'Save future') as HTMLButtonElement;
  save.type = 'button';
  save.addEventListener('click', () => {
    void (async () => {
      save.disabled = true;
      try {
        const { criteria, draft } = await criteriaFromBox(box.input.value, titleInput.value.trim(), [], () => {
          status.textContent = 'Ann is picking out the criteria…';
        });
        annDraft = draft ?? annDraft;
        const title = titleInput.value.trim() || annDraft?.title?.trim();
        if (!title) {
          status.textContent = 'Give the role a title first.';
          save.disabled = false;
          titleInput.focus();
          return;
        }
        const created = (await createFuture({
          title,
          where: annDraft?.where ?? null,
          aliases: annDraft?.aliases ?? [],
          criteria,
          status: 'active',
          colour_slot: (existingCount % 6) + 1,
          lane_order: existingCount,
          target_date: null,
          suggested_reason: null,
          dismissed_until: null
        })) as { future: { id: string } };
        close();
        onSaved(created.future.id);
      } catch (error) {
        status.textContent = error instanceof Error ? error.message : 'Could not save. Your paste is still here.';
        save.disabled = false;
      }
    })();
  });

  const cancel = el('button', 'btn btn--ghost', 'Cancel') as HTMLButtonElement;
  cancel.type = 'button';
  cancel.addEventListener('click', close);

  const draftBtn = annDraftButton(box, status, () => titleInput.value.trim(), (draft) => {
    annDraft = draft;
    if (draft.title && !titleInput.value.trim()) titleInput.value = draft.title;
  });

  const actions = el('div', 'career-sheet__actions');
  actions.append(save, draftBtn, cancel);
  inner.append(titleField, asks, status, actions);
  sheet.append(inner);
  root.append(sheet);
  titleInput.focus();
}

/** `focusCriteria`: opened from "Edit criteria", so start in the criteria box. */
export function openEditFutureSheet(
  root: HTMLElement,
  future: FutureModel,
  onSaved: () => void,
  options: { focusCriteria?: boolean } = {}
): void {
  const sheet = el('div', 'career-sheet');
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.setAttribute('aria-label', options.focusCriteria ? `Criteria for ${future.title}` : 'Edit future');
  const inner = el('div', 'career-sheet__inner');
  inner.append(el('h2', 'career-page__heading', options.focusCriteria ? future.title : 'Edit future'));

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

  const criteriaSection = el('div', 'career-sheet__field');
  criteriaSection.append(el('span', null, 'What this role asks for'));
  criteriaSection.append(el('p', 'career-page__meta career-sheet__hint', BOX_HINT));
  const box = criteriaBox(
    [...future.criteria]
      .sort((a, b) => a.order - b.order)
      .map((c) => c.text)
      .join('\n')
  );
  criteriaSection.append(box.root);

  const status = el('p', 'career-page__meta');
  status.setAttribute('role', 'status');

  const close = sheetCloser(sheet, box.isDirty, (message) => {
    status.textContent = message;
  });

  const save = el('button', 'btn btn--primary', 'Save') as HTMLButtonElement;
  save.type = 'button';
  save.addEventListener('click', () => {
    void (async () => {
      save.disabled = true;
      try {
        const title = titleInput.value.trim();
        const { criteria } = await criteriaFromBox(box.input.value, title, future.criteria, () => {
          status.textContent = 'Ann is picking out the criteria…';
        });
        await updateFuture(future.id, {
          title,
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
        close();
        onSaved();
      } catch (error) {
        status.textContent = error instanceof Error ? error.message : 'Could not save. Your paste is still here.';
        save.disabled = false;
      }
    })();
  });
  const cancel = el('button', 'btn btn--ghost', 'Cancel') as HTMLButtonElement;
  cancel.type = 'button';
  cancel.addEventListener('click', close);

  const actions = el('div', 'career-sheet__actions');
  actions.append(save, annDraftButton(box, status, () => titleInput.value.trim() || future.title), cancel);
  if (options.focusCriteria) {
    // Criteria first; the rest of the future stays one tap away below.
    const more = el('details', 'career-sheet__more');
    more.append(el('summary', null, 'Title, where, aliases, colour'));
    more.append(titleField, whereField, aliasesField, colourField);
    inner.append(criteriaSection, status, actions, more);
  } else {
    inner.append(titleField, whereField, aliasesField, colourField, criteriaSection, status, actions);
  }
  sheet.append(inner);
  root.append(sheet);

  if (options.focusCriteria) box.input.focus();
}
