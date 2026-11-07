/**
 * The Criteria Mirror as the application workspace. Top to bottom: the ad and
 * Split into criteria; Check against my record; one row per criterion; the
 * cover letter; the CV; Draft everything.
 *
 * Coverage numbers come only from the Career model (V4). Every Ann job is
 * waited on once (`waitForAnnJob`), and all state lives here at module level,
 * keyed by application, so a page redraw while Ann works loses nothing.
 */
import { confirmApplicationCheck, getApplication, updateApplication } from '@/api/applications';
import {
  clearAnnJob,
  draftFuture,
  startApplicationCheck,
  startApplicationDraft,
  waitForAnnJob,
  type ApplicationCheckResult,
  type ApplicationCheckStatus,
  type ApplicationCheckSuggestion,
  type ApplicationDraftResult,
  type ApplicationDraftTarget
} from '@/api/career-ann-job';
import { createStone } from '@/api/career';
import { createTask } from '@/api/universal-links';
import { careerCardRoute } from '@/app/router';
import {
  APPLICATION_COSTS,
  addBracketsLabel,
  costLine,
  countAddBrackets,
  criterionForSave,
  mergeSplitCriteria,
  overLimit,
  wordCountLabel,
  WORD_LIMIT_MAX,
  WORD_LIMIT_MIN,
  type CriterionSave
} from '@/domain/career-application';
import { readsAsAd, splitCriteriaLines } from '@/domain/career-criteria-paste';
import type { CareerModel } from '@/domain/career-model';
import type { ApplicationDraftDocument, ApplicationRecord, SelectionCriterion } from '@/domain/types';

type Ctx = { model: CareerModel; onChanged: () => void };
type DocKind = 'cover_letter' | 'cv';
type SkipReason = 'not_checked' | 'no_evidence';

const STATUS_LABEL: Record<ApplicationCheckStatus, string> = {
  have: 'Have it',
  partly: 'Partly',
  not_yet: 'Not yet',
  unknown: 'Not sure'
};

const DOC_LABEL: Record<DocKind, string> = { cover_letter: 'Cover letter', cv: 'CV' };
const DOC_COST: Record<DocKind, number> = { cover_letter: APPLICATION_COSTS.cover_letter, cv: APPLICATION_COSTS.cv };

// ---------- state that outlives a redraw ----------

const apps = new Map<string, ApplicationRecord>();
const draws = new Map<string, () => void>();
const busy = new Map<string, Set<string>>();
const suggestions = new Map<string, { jobId: string; result: ApplicationCheckResult; picks: Map<string, ApplicationCheckStatus> }>();
const skipped = new Map<string, Map<string, SkipReason>>();
const messages = new Map<string, string>();
const localText = new Map<string, string>();
const everything = new Map<string, { step: number; label: string }>();

function busySet(appId: string): Set<string> {
  let set = busy.get(appId);
  if (!set) {
    set = new Set();
    busy.set(appId, set);
  }
  return set;
}

function redraw(appId: string): void {
  draws.get(appId)?.();
}

function say(appId: string, section: string, text: string): void {
  if (text) messages.set(`${appId}:${section}`, text);
  else messages.delete(`${appId}:${section}`);
  redraw(appId);
}

function jobKey(appId: string, kind: string): string {
  return `career-app-job:${appId}:${kind}`;
}

function savedJob(appId: string, kind: string): string | null {
  try {
    return sessionStorage.getItem(jobKey(appId, kind));
  } catch {
    return null;
  }
}

function rememberJob(appId: string, kind: string, jobId: string | null): void {
  try {
    if (jobId) sessionStorage.setItem(jobKey(appId, kind), jobId);
    else sessionStorage.removeItem(jobKey(appId, kind));
  } catch {
    /* Private mode: the wait still works until the page reloads. */
  }
}

function draftKind(target: ApplicationDraftTarget, criterionId?: string): string {
  return criterionId ? `responses:${criterionId}` : target;
}

// ---------- small DOM helpers ----------

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

function button(label: string, variant: 'primary' | 'secondary' | 'ghost', onClick: () => void): HTMLButtonElement {
  const node = el('button', `btn btn--${variant}`, label) as HTMLButtonElement;
  node.type = 'button';
  node.addEventListener('click', onClick);
  return node;
}

function statusLine(appId: string, section: string): HTMLParagraphElement {
  const line = el('p', 'career-page__meta career-mirror__status');
  line.setAttribute('role', 'status');
  line.textContent = messages.get(`${appId}:${section}`) ?? '';
  line.hidden = !line.textContent;
  return line;
}

function errorText(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function copyButton(text: () => string): HTMLButtonElement {
  const node = button('Copy', 'ghost', () => {
    void (async () => {
      try {
        await navigator.clipboard.writeText(text());
        node.textContent = 'Copied';
      } catch {
        node.textContent = 'Select the text to copy';
      }
      setTimeout(() => {
        if (node.isConnected) node.textContent = 'Copy';
      }, 2000);
    })();
  });
  return node;
}

/** Three lines at rest (L2); the box opens to its text while Adam writes. */
function collapsible(area: HTMLTextAreaElement): void {
  const grow = () => {
    area.style.height = 'auto';
    area.style.height = `${Math.max(area.scrollHeight + 2, 160)}px`;
  };
  area.addEventListener('focus', grow);
  area.addEventListener('input', () => {
    if (document.activeElement === area) grow();
  });
  area.addEventListener('blur', () => {
    area.style.height = '';
  });
}

function cardTitle(model: CareerModel, id: string): string {
  const card = model.trunk_items.find((item) => item.id === id || item.merged_ids.includes(id));
  return card?.title ?? 'Skill card';
}

function cardChips(model: CareerModel, ids: string[]): HTMLElement | null {
  if (!ids.length) return null;
  const chips = el('div', 'career-mirror__chips');
  for (const id of ids) {
    const chip = el('a', 'career-future__chip career-mirror__chip', cardTitle(model, id));
    chip.href = careerCardRoute(id);
    chip.title = cardTitle(model, id);
    chips.append(chip);
  }
  return chips;
}

// ---------- saving ----------

async function saveCriteria(appId: string, next: CriterionSave[]): Promise<void> {
  const { application } = await updateApplication(appId, { selection_criteria: next });
  apps.set(appId, application);
}

async function patchCriterion(appId: string, criterionId: string, changes: Partial<SelectionCriterion>): Promise<void> {
  const app = apps.get(appId);
  if (!app) return;
  const next = [...(app.selection_criteria ?? [])]
    .sort((a, b) => a.order - b.order)
    .map((c) => criterionForSave(c.id === criterionId ? { ...c, ...changes } : c));
  await saveCriteria(appId, next);
}

async function patchDoc(appId: string, kind: DocKind, value: ApplicationDraftDocument | null): Promise<void> {
  const { application } = await updateApplication(appId, kind === 'cv' ? { cv: value } : { cover_letter: value });
  apps.set(appId, application);
}

// ---------- Ann jobs ----------

function waitForCheck(appId: string, jobId: string): void {
  const set = busySet(appId);
  if (set.has('check')) return;
  set.add('check');
  say(appId, 'check', 'Ann is reading your record. You can leave this page; her answers will be here when you come back.');
  void waitForAnnJob<ApplicationCheckResult>(jobId).then(
    (result) => {
      set.delete('check');
      const picks = new Map<string, ApplicationCheckStatus>();
      for (const s of result.suggestions ?? []) picks.set(s.criterion_id, s.status);
      suggestions.set(appId, { jobId, result, picks });
      say(
        appId,
        'check',
        result.read_central_node === false
          ? 'Your Central Node did not load, so Ann may have missed things. Confirm, change or skip each answer.'
          : 'Ann read your skill cards, Work history and Central Node. Confirm, change or skip each answer.'
      );
    },
    (error) => {
      set.delete('check');
      rememberJob(appId, 'check', null);
      say(appId, 'check', errorText(error, 'Ann could not finish. Try again.'));
    }
  );
}

async function startCheck(appId: string): Promise<void> {
  say(appId, 'check', 'Starting Ann…');
  try {
    const jobId = await startApplicationCheck(appId);
    rememberJob(appId, 'check', jobId);
    waitForCheck(appId, jobId);
  } catch (error) {
    say(appId, 'check', errorText(error, 'Ann could not start. Try again.'));
  }
}

function finishSuggestion(appId: string, criterionIds: string[]): void {
  const held = suggestions.get(appId);
  if (!held) return;
  const left = (held.result.suggestions ?? []).filter((s) => !criterionIds.includes(s.criterion_id));
  if (left.length) {
    held.result = { ...held.result, suggestions: left };
    return;
  }
  suggestions.delete(appId);
  rememberJob(appId, 'check', null);
  clearAnnJob(held.jobId);
}

async function confirmSuggestions(appId: string, list: ApplicationCheckSuggestion[], ctx: Ctx): Promise<void> {
  const held = suggestions.get(appId);
  if (!held || !list.length) return;
  const answers = list.map((s) => ({
    criterion_id: s.criterion_id,
    status: held.picks.get(s.criterion_id) ?? s.status,
    // Ann's reason explains her answer, so it goes when Adam changes the answer.
    evidence: (held.picks.get(s.criterion_id) ?? s.status) === s.status ? s.evidence : '',
    card_ids: (held.picks.get(s.criterion_id) ?? s.status) === s.status ? s.card_ids : []
  }));
  busySet(appId).add('confirm');
  say(appId, 'check', 'Saving…');
  try {
    const { application } = await confirmApplicationCheck(appId, answers);
    apps.set(appId, application);
    finishSuggestion(appId, answers.map((a) => a.criterion_id));
    busySet(appId).delete('confirm');
    say(appId, 'check', answers.length === 1 ? 'Saved.' : `Saved ${answers.length} answers.`);
    // Coverage is the model's to say, so the page rebuilds it from the saved links.
    ctx.onChanged();
  } catch (error) {
    busySet(appId).delete('confirm');
    say(appId, 'check', errorText(error, 'Could not save. The answers are still here.'));
  }
}

function waitForDraft(appId: string, kind: string, jobId: string): Promise<void> {
  const set = busySet(appId);
  set.add(kind);
  redraw(appId);
  return waitForAnnJob<ApplicationDraftResult>(jobId).then(
    (result) => {
      set.delete(kind);
      rememberJob(appId, kind, null);
      clearAnnJob(jobId);
      if (result.application) apps.set(appId, result.application);
      const reasons = skipped.get(appId) ?? new Map<string, SkipReason>();
      for (const id of result.drafted ?? []) reasons.delete(id);
      for (const skip of result.skipped ?? []) reasons.set(skip.criterion_id, skip.reason);
      skipped.set(appId, reasons);
      const section = kind.startsWith('responses') ? 'responses' : kind;
      const count = (result.drafted ?? []).length;
      const brackets = addBracketsLabel(result.brackets ?? 0);
      say(
        appId,
        section,
        kind === 'responses'
          ? `Ann drafted ${count === 1 ? '1 response' : `${count} responses`}.${brackets ? ` ${brackets}.` : ''}`
          : count
            ? `Ann drafted it.${brackets ? ` ${brackets}.` : ''}`
            : 'Ann had nothing to draft.'
      );
    },
    (error) => {
      set.delete(kind);
      rememberJob(appId, kind, null);
      const section = kind.startsWith('responses') ? 'responses' : kind;
      say(appId, section, errorText(error, 'Ann could not finish. Try again.'));
      throw error;
    }
  );
}

async function runDraft(appId: string, target: ApplicationDraftTarget, criterionId?: string): Promise<void> {
  const kind = draftKind(target, criterionId);
  if (busySet(appId).has(kind)) return;
  const section = target === 'responses' ? 'responses' : target;
  say(appId, section, 'Ann is drafting. You can leave this page; the draft lands on the application.');
  let jobId = savedJob(appId, kind);
  if (!jobId) {
    jobId = await startApplicationDraft(appId, target, criterionId);
    rememberJob(appId, kind, jobId);
  }
  await waitForDraft(appId, kind, jobId);
}

function draftNow(appId: string, target: ApplicationDraftTarget, criterionId?: string): void {
  void runDraft(appId, target, criterionId).catch((error) => {
    const section = target === 'responses' ? 'responses' : target;
    if (!busySet(appId).has(draftKind(target, criterionId))) {
      say(appId, section, errorText(error, 'Ann could not start. Try again.'));
    }
  });
}

const EVERYTHING_STEPS: Array<[ApplicationDraftTarget, string]> = [
  ['responses', 'responses'],
  ['cover_letter', 'the cover letter'],
  ['cv', 'the CV']
];

async function draftEverything(appId: string): Promise<void> {
  if (everything.has(appId)) return;
  try {
    for (const [index, [target, label]] of EVERYTHING_STEPS.entries()) {
      everything.set(appId, { step: index + 1, label });
      say(appId, 'everything', `Drafting ${label} (${index + 1} of ${EVERYTHING_STEPS.length})…`);
      await runDraft(appId, target);
    }
    everything.delete(appId);
    say(appId, 'everything', 'Responses, cover letter and CV drafted. Read each one before you send it.');
  } catch (error) {
    const at = everything.get(appId);
    everything.delete(appId);
    say(appId, 'everything', `${errorText(error, 'Ann stopped.')} Stopped at ${at?.label ?? 'the start'}; what she finished is saved.`);
  }
}

/** Jobs started before a page reload are picked up again. */
function resumeJobs(appId: string): void {
  const checkJob = savedJob(appId, 'check');
  if (checkJob && !suggestions.has(appId)) waitForCheck(appId, checkJob);
  const app = apps.get(appId);
  const kinds = ['responses', 'cover_letter', 'cv', ...(app?.selection_criteria ?? []).map((c) => `responses:${c.id}`)];
  for (const kind of kinds) {
    const jobId = savedJob(appId, kind);
    if (jobId && !busySet(appId).has(kind)) void waitForDraft(appId, kind, jobId).catch(() => {});
  }
}

// ---------- sections ----------

/** A split waiting for Adam's yes; held here so a status redraw keeps it. */
const pendingSplits = new Map<string, { criteria: CriterionSave[]; added: number; limits: number; text: string }>();
const askingEverything = new Set<string>();

function splitConfirmRow(app: ApplicationRecord, ctx: Ctx): HTMLElement | null {
  const held = pendingSplits.get(app.id);
  if (!held) return null;
  const { criteria, added, limits, text } = held;
  const row = el('div', 'career-mirror__confirm');
  const noun = added === 1 ? '1 criterion' : `${added} criteria`;
  row.append(
    el(
      'p',
      'career-page__meta',
      `Add ${noun} from the ad${limits ? `, ${limits} with a word limit` : ''}? Existing criteria are kept.`
    )
  );
  const actions = el('div', 'career-mirror__actions');
  actions.append(
    button(added === 1 ? 'Add it' : `Add ${added}`, 'primary', () => {
      pendingSplits.delete(app.id);
      void (async () => {
        say(app.id, 'split', 'Saving…');
        try {
          await saveCriteria(app.id, criteria);
          const current = apps.get(app.id);
          if (current && (current.advertisement?.summary ?? '') !== text) {
            const { application } = await updateApplication(app.id, {
              advertisement: { ...current.advertisement, summary: text }
            });
            apps.set(app.id, application);
          }
          localText.delete(`${app.id}:ad`);
          say(app.id, 'split', `Added ${noun}.`);
          ctx.onChanged();
        } catch (error) {
          say(app.id, 'split', errorText(error, 'Could not save. Your paste is still here.'));
        }
      })();
    }),
    button('Cancel', 'ghost', () => {
      pendingSplits.delete(app.id);
      redraw(app.id);
    })
  );
  row.append(actions);
  return row;
}

async function splitAd(app: ApplicationRecord, text: string): Promise<void> {
  if (!text) {
    say(app.id, 'split', 'Paste the ad first.');
    return;
  }
  busySet(app.id).add('split');
  try {
    let lines: string[];
    if (readsAsAd(text)) {
      say(app.id, 'split', 'Reads like a full ad. Ann is picking out the criteria…');
      const result = await draftFuture<{ draft?: { criteria?: Array<{ text: string }> } }>({
        title: app.position_title,
        description: text
      });
      lines = (result.draft?.criteria ?? []).map((c) => c.text);
      if (!lines.length) throw new Error('Ann could not find any criteria. Your paste is still here.');
    } else {
      lines = splitCriteriaLines(text);
    }
    const { criteria, added } = mergeSplitCriteria(apps.get(app.id)?.selection_criteria ?? [], lines);
    busySet(app.id).delete('split');
    if (!added) {
      say(app.id, 'split', 'Those criteria are already here.');
      return;
    }
    const limits = criteria.slice(-added).filter((c) => c.word_limit).length;
    pendingSplits.set(app.id, { criteria, added, limits, text });
    say(app.id, 'split', '');
  } catch (error) {
    busySet(app.id).delete('split');
    say(app.id, 'split', errorText(error, 'Could not split the ad. Try again.'));
  }
}

function adSection(app: ApplicationRecord, ctx: Ctx): HTMLElement {
  const section = el('div', 'career-mirror__section career-mirror__ad');
  section.append(el('h4', 'career-future__subhead', 'The ad'));
  const ad = el('textarea', 'career-mirror__ad-text') as HTMLTextAreaElement;
  ad.rows = 6;
  ad.dataset.key = 'ad';
  ad.setAttribute('aria-label', 'The job ad or its criteria');
  ad.placeholder = 'Paste the ad or the selection criteria. One criterion per line.';
  ad.value = localText.get(`${app.id}:ad`) ?? (app.advertisement?.summary || '');
  ad.addEventListener('input', () => localText.set(`${app.id}:ad`, ad.value));
  section.append(ad);

  const split = button('Split into criteria', 'secondary', () => {
    split.disabled = true;
    void splitAd(app, ad.value.trim());
  });
  split.disabled = busySet(app.id).has('split') || pendingSplits.has(app.id);
  const actions = el('div', 'career-mirror__actions');
  actions.append(split);
  section.append(actions);
  const confirmRow = splitConfirmRow(app, ctx);
  if (confirmRow) section.append(confirmRow);
  section.append(statusLine(app.id, 'split'));
  return section;
}

function checkSection(app: ApplicationRecord, ctx: Ctx): HTMLElement {
  const section = el('div', 'career-mirror__section career-mirror__check');
  const modelApp = ctx.model.applications.find((a) => a.id === app.id);
  const head = el('div', 'career-mirror__section-head');
  head.append(el('h4', 'career-future__subhead', 'Check against my record'));
  head.append(
    el(
      'span',
      'career-page__meta',
      modelApp?.checked && modelApp.match_label ? `Match ${modelApp.match_label}` : 'Not checked'
    )
  );
  section.append(head);
  const criteria = app.selection_criteria ?? [];
  const running = busySet(app.id).has('check');
  const held = suggestions.get(app.id);
  const actions = el('div', 'career-mirror__actions');
  const ask = button(modelApp?.checked ? 'Check again' : 'Check against my record', modelApp?.checked ? 'secondary' : 'primary', () => {
    ask.disabled = true;
    void startCheck(app.id);
  });
  ask.disabled = running || !criteria.length;
  actions.append(ask, el('span', 'career-page__meta', costLine(APPLICATION_COSTS.check)));
  if (held?.result.suggestions?.length) {
    const all = button('Confirm all', 'primary', () => {
      all.disabled = true;
      void confirmSuggestions(app.id, held.result.suggestions ?? [], ctx);
    });
    all.disabled = busySet(app.id).has('confirm');
    actions.append(all);
  }
  section.append(actions);
  if (!criteria.length) {
    section.append(el('p', 'career-page__meta', 'Split the ad into criteria first, then Ann can check them.'));
  } else {
    section.append(
      el('p', 'career-page__meta', 'Ann reads your skill cards, Work history and Central Node. Nothing counts until you confirm it.')
    );
  }
  section.append(statusLine(app.id, 'check'));
  return section;
}

function suggestionBox(app: ApplicationRecord, s: ApplicationCheckSuggestion, ctx: Ctx): HTMLElement {
  const held = suggestions.get(app.id)!;
  const box = el('div', 'career-mirror__suggest');
  const top = el('div', 'career-mirror__suggest-head');
  top.append(el('span', 'career-page__meta', 'Ann says'));
  const pill = el('span', `career-mirror__pill career-mirror__pill--${s.status}`, STATUS_LABEL[s.status]);
  top.append(pill);
  box.append(top);
  if (s.evidence) box.append(el('p', 'career-mirror__evidence', s.evidence));
  else box.append(el('p', 'career-page__meta', 'Ann found nothing on this. You will know.'));
  const chips = cardChips(ctx.model, s.card_ids ?? []);
  if (chips) box.append(chips);

  const actions = el('div', 'career-mirror__actions');
  const confirm = button('Confirm', 'primary', () => {
    confirm.disabled = true;
    void confirmSuggestions(app.id, [s], ctx);
  });
  confirm.disabled = busySet(app.id).has('confirm');
  const pick = el('select', 'career-mirror__pick') as HTMLSelectElement;
  pick.setAttribute('aria-label', 'Change the answer');
  for (const status of Object.keys(STATUS_LABEL) as ApplicationCheckStatus[]) {
    const option = el('option', null, STATUS_LABEL[status]) as HTMLOptionElement;
    option.value = status;
    pick.append(option);
  }
  pick.value = held.picks.get(s.criterion_id) ?? s.status;
  pick.addEventListener('change', () => {
    held.picks.set(s.criterion_id, pick.value as ApplicationCheckStatus);
    pill.textContent = STATUS_LABEL[pick.value as ApplicationCheckStatus];
    pill.className = `career-mirror__pill career-mirror__pill--${pick.value}`;
  });
  const skip = button('Skip', 'ghost', () => {
    finishSuggestion(app.id, [s.criterion_id]);
    redraw(app.id);
  });
  actions.append(confirm, pick, skip);
  box.append(actions);
  return box;
}

function skipReasonText(reason: SkipReason): string {
  return reason === 'not_checked' ? 'Check this one first' : 'Nothing in your record yet';
}

function criterionRow(app: ApplicationRecord, criterion: SelectionCriterion, index: number, ctx: Ctx): HTMLElement {
  const modelCriterion = ctx.model.applications
    .find((a) => a.id === app.id)
    ?.criteria.find((c) => c.id === criterion.id);
  const coverage = modelCriterion?.coverage ?? null;
  const label = modelCriterion?.label ?? 'Not checked';
  const status = modelCriterion?.status ?? criterion.check?.status ?? null;

  const row = el('div', 'career-mirror__row');
  row.dataset.criterionId = criterion.id;
  const head = el('div', 'career-mirror__row-head');
  head.append(el('span', 'career-mirror__num', String(index + 1)));
  head.append(el('span', 'career-mirror__text', criterion.criterion));
  row.append(head);

  const meter = el('div', 'career-mirror__meter');
  const bar = el('div', 'career-mirror__bar');
  const fill = el('div', 'career-mirror__bar-fill');
  fill.style.width = `${Math.round((coverage ?? 0) * 100)}%`;
  bar.append(fill);
  bar.setAttribute('role', 'img');
  bar.setAttribute('aria-label', `Coverage: ${label}`);
  const pct = el('span', 'career-mirror__pct', label);
  pct.title = label;
  meter.append(bar, pct);
  row.append(meter);

  const confirmedChips = cardChips(ctx.model, criterion.check?.card_ids ?? []);
  if (confirmedChips) row.append(confirmedChips);

  const held = suggestions.get(app.id);
  const suggestion = held?.result.suggestions?.find((s) => s.criterion_id === criterion.id);
  if (suggestion) row.append(suggestionBox(app, suggestion, ctx));

  if (status === 'not_yet') {
    const gap = button('Make it a stepping stone', 'ghost', () => {
      void (async () => {
        gap.disabled = true;
        try {
          await createStone({
            label: criterion.criterion.slice(0, 200),
            origin: 'gap',
            target_term_start: null,
            status_override: null
          });
          await createTask({ title: criterion.criterion.slice(0, 200), status: 'todo' });
          gap.textContent = 'Stepping stone added · in Tasks';
          ctx.onChanged();
        } catch {
          gap.disabled = false;
        }
      })();
    });
    gap.classList.add('career-mirror__gap');
    const gapRow = el('div', 'career-mirror__actions');
    gapRow.append(gap);
    row.append(gapRow);
  }

  // The response: limit, box, live count, then actions on their own line (I4).
  const limitRow = el('label', 'career-mirror__limit');
  limitRow.append(el('span', 'career-page__meta', 'Word limit'));
  const limit = el('input', 'career-mirror__limit-input') as HTMLInputElement;
  limit.type = 'number';
  limit.min = String(WORD_LIMIT_MIN);
  limit.max = String(WORD_LIMIT_MAX);
  limit.step = '25';
  limit.placeholder = 'None';
  limit.value = criterion.word_limit ? String(criterion.word_limit) : '';
  limit.addEventListener('change', () => {
    const raw = Number.parseInt(limit.value, 10);
    const next = Number.isFinite(raw) ? Math.min(WORD_LIMIT_MAX, Math.max(WORD_LIMIT_MIN, raw)) : null;
    void patchCriterion(app.id, criterion.id, { word_limit: next })
      .then(() => redraw(app.id))
      .catch((error) => say(app.id, 'responses', errorText(error, 'Could not save the limit.')));
  });
  limitRow.append(limit);
  row.append(limitRow);

  const key = `${app.id}:response:${criterion.id}`;
  const area = el('textarea', 'career-mirror__response') as HTMLTextAreaElement;
  area.rows = 3;
  area.dataset.key = key;
  area.setAttribute('aria-label', `Response to criterion ${index + 1}`);
  area.placeholder = 'Your response. Ann drafts it once this criterion is checked.';
  area.value = localText.get(key) ?? criterion.response ?? '';
  collapsible(area);
  const count = el('p', 'career-page__meta career-mirror__count');
  const paintCount = () => {
    count.textContent = wordCountLabel(area.value, criterion.word_limit);
    count.classList.toggle('career-mirror__count--over', overLimit(area.value, criterion.word_limit));
  };
  area.addEventListener('input', () => {
    localText.set(key, area.value);
    paintCount();
  });
  area.addEventListener('change', () => {
    const text = area.value.trim() ? area.value : null;
    void patchCriterion(app.id, criterion.id, { response: text, response_source: 'adam' })
      .then(() => {
        localText.delete(key);
        say(app.id, 'responses', 'Saved.');
      })
      .catch((error) => say(app.id, 'responses', errorText(error, 'Could not save. Your text is still here.')));
  });
  paintCount();
  row.append(area, count);

  if (criterion.response_pending) {
    row.append(
      pendingBox(criterion.response_pending, criterion.word_limit, {
        onUse: () =>
          patchCriterion(app.id, criterion.id, {
            response: criterion.response_pending,
            response_pending: null,
            response_source: 'ann'
          }).then(() => {
            localText.delete(key);
          }),
        onKeep: () => patchCriterion(app.id, criterion.id, { response_pending: null }),
        appId: app.id
      })
    );
  }

  const actions = el('div', 'career-mirror__actions');
  const draftable = status === 'have' || status === 'partly';
  const reason = skipped.get(app.id)?.get(criterion.id) ?? (status == null ? 'not_checked' : draftable ? null : 'no_evidence');
  const drafting = busySet(app.id).has(`responses:${criterion.id}`) || busySet(app.id).has('responses');
  if (reason && !draftable) {
    actions.append(el('span', 'career-page__meta career-mirror__reason', skipReasonText(reason)));
  } else {
    const draft = button(criterion.response ? 'Redraft' : 'Draft', 'secondary', () => {
      draft.disabled = true;
      draftNow(app.id, 'responses', criterion.id);
    });
    draft.disabled = drafting;
    if (drafting) draft.textContent = 'Drafting…';
    actions.append(draft, el('span', 'career-page__meta', costLine(APPLICATION_COSTS.criterion)));
  }
  if (area.value.trim()) actions.append(copyButton(() => area.value));
  row.append(actions);
  return row;
}

function pendingBox(
  text: string,
  limit: number | null | undefined,
  handlers: { onUse: () => Promise<void>; onKeep: () => Promise<void>; appId: string }
): HTMLElement {
  const box = el('div', 'career-mirror__pending');
  const head = el('div', 'career-mirror__section-head');
  head.append(el('strong', null, "Ann's new draft"));
  head.append(el('span', 'career-page__meta', wordCountLabel(text, limit)));
  box.append(head);
  box.append(el('p', 'career-page__meta', 'You have edited yours, so hers waits here. Nothing is overwritten until you choose.'));
  box.append(el('div', 'career-mirror__pending-text', text));
  const brackets = addBracketsLabel(countAddBrackets(text));
  if (brackets) box.append(el('p', 'career-page__meta career-mirror__count--over', brackets));
  const actions = el('div', 'career-mirror__actions');
  const run = (fn: () => Promise<void>) => () => {
    for (const b of actions.querySelectorAll('button')) b.disabled = true;
    void fn()
      .then(() => redraw(handlers.appId))
      .catch((error) => {
        for (const b of actions.querySelectorAll('button')) b.disabled = false;
        say(handlers.appId, 'responses', errorText(error, 'Could not save. Try again.'));
      });
  };
  actions.append(button('Use this', 'primary', run(handlers.onUse)), button('Keep mine', 'ghost', run(handlers.onKeep)));
  box.append(actions);
  return box;
}

function hasDraftableCriterion(app: ApplicationRecord): boolean {
  return (app.selection_criteria ?? []).some((c) => c.check?.status === 'have' || c.check?.status === 'partly');
}

function responsesHead(): HTMLElement {
  const section = el('div', 'career-mirror__section-head');
  section.append(el('h4', 'career-future__subhead', 'Criteria'));
  return section;
}

function docSection(app: ApplicationRecord, kind: DocKind): HTMLElement {
  const doc = app[kind] ?? null;
  const section = el('div', 'career-mirror__section career-mirror__doc');
  section.dataset.doc = kind;
  section.append(el('h4', 'career-future__subhead', DOC_LABEL[kind]));
  const key = `${app.id}:${kind}`;
  const area = el('textarea', 'career-mirror__response career-mirror__doc-text') as HTMLTextAreaElement;
  area.rows = 3;
  area.dataset.key = key;
  area.setAttribute('aria-label', DOC_LABEL[kind]);
  area.placeholder =
    kind === 'cv'
      ? 'Ann lays out a CV for this role from your record. Anything missing shows as [add: …].'
      : 'Ann drafts a cover letter for this role from your strongest evidence.';
  area.value = localText.get(key) ?? doc?.text ?? '';
  collapsible(area);
  const count = el('p', 'career-page__meta career-mirror__count');
  const paint = () => {
    const brackets = addBracketsLabel(countAddBrackets(area.value));
    count.replaceChildren(document.createTextNode(wordCountLabel(area.value, null)));
    if (brackets) {
      count.append(document.createTextNode(' · '));
      count.append(el('span', 'career-mirror__count--over', brackets));
    }
  };
  area.addEventListener('input', () => {
    localText.set(key, area.value);
    paint();
  });
  area.addEventListener('change', () => {
    const now = new Date().toISOString();
    const text = area.value;
    const current = apps.get(app.id)?.[kind] ?? null;
    const next: ApplicationDraftDocument | null =
      text.trim() || current?.pending
        ? { text, source: 'adam', drafted_at: current?.drafted_at ?? null, updated_at: now, pending: current?.pending ?? null }
        : null;
    void patchDoc(app.id, kind, next)
      .then(() => {
        localText.delete(key);
        say(app.id, kind, 'Saved.');
      })
      .catch((error) => say(app.id, kind, errorText(error, 'Could not save. Your text is still here.')));
  });
  paint();
  section.append(area, count);

  if (doc?.pending) {
    const pending = doc.pending;
    section.append(
      pendingBox(pending, null, {
        appId: app.id,
        onUse: () =>
          patchDoc(app.id, kind, {
            text: pending,
            source: 'ann',
            drafted_at: doc.drafted_at,
            updated_at: new Date().toISOString(),
            pending: null
          }).then(() => {
            localText.delete(key);
          }),
        onKeep: () => patchDoc(app.id, kind, { ...doc, pending: null })
      })
    );
  }

  const actions = el('div', 'career-mirror__actions');
  const drafting = busySet(app.id).has(kind);
  const draft = button(drafting ? 'Drafting…' : doc?.text ? 'Redraft' : 'Draft', 'secondary', () => {
    draft.disabled = true;
    draftNow(app.id, kind);
  });
  draft.disabled = drafting;
  actions.append(draft, el('span', 'career-page__meta', costLine(DOC_COST[kind])));
  if (area.value.trim()) actions.append(copyButton(() => area.value));
  section.append(actions, statusLine(app.id, kind));
  return section;
}

function everythingSection(app: ApplicationRecord): HTMLElement {
  const section = el('div', 'career-mirror__section career-mirror__everything');
  section.append(el('h4', 'career-future__subhead', 'Draft everything'));
  section.append(
    el(
      'p',
      'career-page__meta',
      `${costLine(APPLICATION_COSTS.everything)} for all three: the responses, then the cover letter, then the CV. Anything you have edited stays yours; Ann's version waits beside it.`
    )
  );
  const run = everything.get(app.id);
  const asking = askingEverything.has(app.id) && !run;
  const go = button(run ? `Drafting ${run.label} (${run.step} of 3)…` : 'Draft everything', 'primary', () => {
    askingEverything.add(app.id);
    redraw(app.id);
  });
  go.disabled = Boolean(run) || asking || !hasDraftableCriterion(app);
  const actions = el('div', 'career-mirror__actions');
  actions.append(go);
  section.append(actions);
  if (asking) {
    const confirmRow = el('div', 'career-mirror__confirm');
    const confirmActions = el('div', 'career-mirror__actions');
    confirmActions.append(
      button('Go', 'primary', () => {
        askingEverything.delete(app.id);
        void draftEverything(app.id);
      }),
      button('Cancel', 'ghost', () => {
        askingEverything.delete(app.id);
        redraw(app.id);
      })
    );
    confirmRow.append(
      el('p', 'career-page__meta', `Ann runs three drafts in a row, ${costLine(APPLICATION_COSTS.everything).toLowerCase()} in all. Go?`),
      confirmActions
    );
    section.append(confirmRow);
  }
  if (!hasDraftableCriterion(app) && !run) {
    section.append(el('p', 'career-page__meta', 'Check and confirm at least one criterion first.'));
  }
  section.append(statusLine(app.id, 'everything'));
  return section;
}

/**
 * Draws the workspace for one application into `host`. Called again on every
 * page refresh; the state above carries over.
 */
export async function renderApplicationWorkspace(
  host: HTMLElement,
  seed: ApplicationRecord,
  ctx: Ctx & { onClose: () => void }
): Promise<void> {
  const panel = el('section', 'career-mirror');
  panel.style.background = 'var(--glass)';
  panel.style.border = '1px solid var(--line)';
  panel.style.borderRadius = 'var(--radius-md)';
  panel.style.boxShadow = 'var(--elev-1)';
  host.replaceChildren(panel);

  const cached = apps.has(seed.id);
  if (!cached) {
    apps.set(seed.id, seed);
    try {
      const fresh = await getApplication(seed.id);
      apps.set(seed.id, fresh.application);
    } catch {
      /* use the list's copy */
    }
  }

  const draw = () => {
    const app = apps.get(seed.id) ?? seed;
    // Keep Adam's place: the focused box and its caret survive a redraw.
    const active = document.activeElement as HTMLTextAreaElement | null;
    const focusKey = active && panel.contains(active) ? active.dataset.key : undefined;
    const caret = focusKey ? [active!.selectionStart, active!.selectionEnd] : null;

    const head = el('div', 'career-page__section-head');
    head.append(el('h3', 'career-page__heading', 'Criteria Mirror'));
    head.append(
      button('Close', 'ghost', () => {
        draws.delete(seed.id);
        ctx.onClose();
      })
    );
    const title = el('p', 'career-page__meta', [app.position_title, app.organisation?.display_label].filter(Boolean).join(' · '));

    const rows = el('div', 'career-mirror__criteria');
    rows.append(responsesHead());
    const sorted = [...(app.selection_criteria ?? [])].sort((a, b) => a.order - b.order);
    if (!sorted.length) {
      rows.append(el('p', 'empty-state', 'No criteria yet. Paste the ad above and press Split into criteria.'));
    }
    sorted.forEach((criterion, index) => rows.append(criterionRow(app, criterion, index, ctx)));
    rows.append(statusLine(app.id, 'responses'));

    panel.replaceChildren(
      head,
      title,
      adSection(app, ctx),
      checkSection(app, ctx),
      rows,
      docSection(app, 'cover_letter'),
      docSection(app, 'cv'),
      everythingSection(app)
    );

    if (focusKey) {
      const again = panel.querySelector<HTMLTextAreaElement>(`[data-key="${CSS.escape(focusKey)}"]`);
      if (again) {
        again.focus();
        if (caret) again.setSelectionRange(caret[0], caret[1]);
      }
    }
  };
  draws.set(seed.id, () => {
    if (panel.isConnected) draw();
  });
  draw();
  resumeJobs(seed.id);
  if (cached) {
    // A held copy draws at once; the saved one replaces it (an edit made elsewhere, a draft that landed).
    void getApplication(seed.id).then(
      ({ application }) => {
        apps.set(seed.id, application);
        redraw(seed.id);
      },
      () => {}
    );
  }
}

/** For tests: forget everything held between redraws. */
export function resetApplicationWorkspace(): void {
  apps.clear();
  draws.clear();
  busy.clear();
  suggestions.clear();
  skipped.clear();
  messages.clear();
  localText.clear();
  everything.clear();
  pendingSplits.clear();
  askingEverything.clear();
}
