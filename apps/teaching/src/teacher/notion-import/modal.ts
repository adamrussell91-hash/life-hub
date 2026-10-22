import type { CurriculumResponse } from '@/teacher/nav';
import type { EntityOverride, ImportPlanPreview, PlannedEntityPreview } from '@/notion-import/types';
import {
  JobTimeoutError,
  parseNotionPageId,
  searchNotion,
  startApply,
  startPlan,
  waitForJob,
  type NotionImportJob,
  type NotionImportReport
} from './api';
import { reconcileCurriculum } from '@/app/curriculum-state';
import { buildRows, choicesFrom, groupWarningList, groupWarnings, toggleExcluded } from './preview-model';

export interface NotionImportOptions {
  curriculum: CurriculumResponse;
  onDone: (report: NotionImportReport) => void;
}

const FOCUSABLE = 'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, [tabindex]:not([tabindex="-1"])';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(label: string, className: string, hook?: string): HTMLButtonElement {
  const btn = el('button', className, label);
  btn.type = 'button';
  if (hook) btn.setAttribute(hook, '');
  return btn;
}

function pluralise(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

function progressText(job: NotionImportJob): string | undefined {
  const p = job.progress;
  if (!p) return undefined;
  if (p.phase === 'reading') return `Reading from Notion (${pluralise(p.done, 'page')})…`;
  if (p.phase === 'media') return `Copying files ${p.done} of ${p.total}…`;
  return `Saving ${p.done} of ${p.total}…`;
}

const isAbort = (e: unknown): boolean => e instanceof DOMException && e.name === 'AbortError';

export function openNotionImportModal(options: NotionImportOptions): { close: () => void } {
  const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  let closed = false;

  const backdrop = el('div', 'create-modal-backdrop notion-import');
  backdrop.dataset.notionImportModal = '';
  const dialog = el('div', 'create-modal glass-panel glass-tile notion-import__dialog');
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', 'notion-import-title');
  const title = el('h2', 'create-modal__title', 'Import from Notion');
  title.id = 'notion-import-title';
  title.tabIndex = -1;
  const body = el('div', 'notion-import__body');
  const step = el('div', 'notion-import__step');
  const footer = el('div', 'create-modal__footer notion-import__footer');
  dialog.append(title, body, footer);
  backdrop.append(dialog);
  document.body.append(backdrop);

  const status = el('p', 'notion-import__status');
  status.setAttribute('role', 'status');
  const setStatus = (text: string): void => { status.textContent = text; };

  const error = el('p', 'create-modal__error notion-import__error');
  error.hidden = true;
  error.dataset.notionError = '';
  error.setAttribute('role', 'alert');
  const showError = (message: string): void => {
    error.textContent = message;
    error.hidden = !message;
  };
  // Step content swaps inside `step`; the status and error nodes stay put so screen readers keep their live regions.
  body.append(step, status, error);

  const abort = new AbortController();
  let applying = false;
  const close = (): void => {
    if (closed) return;
    closed = true;
    abort.abort();
    // The apply job carries on server side, so what the app holds may already be stale.
    if (applying) void reconcileCurriculum().catch(() => {});
    document.removeEventListener('keydown', onKeyDown);
    backdrop.remove();
    returnFocus?.focus?.();
  };

  const isTextField = (t: EventTarget | null): boolean =>
    t instanceof HTMLTextAreaElement
    || (t instanceof HTMLInputElement && !['checkbox', 'radio', 'button', 'submit'].includes(t.type));

  // One document-level handler while open: Escape closes (never while typing in a text field), Tab stays inside.
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      if (isTextField(event.target)) return;
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== 'Tab') return;
    const items = [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)];
    if (!items.length) { event.preventDefault(); title.focus(); return; }
    const first = items[0]!;
    const last = items[items.length - 1]!;
    const active = document.activeElement;
    if (!active || !dialog.contains(active)) { event.preventDefault(); first.focus(); }
    else if (event.shiftKey && active === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && active === last) { event.preventDefault(); first.focus(); }
  };
  document.addEventListener('keydown', onKeyDown);
  backdrop.addEventListener('click', (event) => { if (event.target === backdrop) close(); });

  function focusFirst(): void {
    const target = body.querySelector<HTMLElement>(FOCUSABLE) ?? footer.querySelector<HTMLElement>(FOCUSABLE) ?? title;
    target.focus();
  }

  function setStep(content: Node[], actions: HTMLElement[], statusText = '', keepFocus = false): void {
    setStatus(statusText);
    step.replaceChildren(...content);
    footer.replaceChildren(...actions);
    if (!keepFocus) focusFirst();
  }

  const cancelBtn = (label = 'Cancel'): HTMLButtonElement => {
    const btn = button(label, 'btn btn--ghost');
    btn.addEventListener('click', close);
    return btn;
  };

  let pageId = '';
  let plan: ImportPlanPreview | null = null;
  let excluded = new Set<string>();
  let overrides: Record<string, EntityOverride> = {};
  const htmlAsCode = new Set<string>();
  const openRules = new Set<string>();
  let searchTimer: number | undefined;
  let searchSeq = 0;
  let lastJob: { id: string; kind: 'plan' | 'apply' } | null = null;

  // ---- Step 1: pick a page ----
  function renderPick(): void {
    const label = el('label', 'create-modal__field');
    label.append(el('span', 'create-modal__label', 'Notion link or search'));
    const input = el('input', 'create-modal__input');
    input.type = 'text';
    input.dataset.notionLink = '';
    input.placeholder = 'Paste a Notion page link, or type to search';
    input.autocomplete = 'off';
    label.append(input);
    const results = el('ul', 'notion-import__results');
    results.hidden = true;

    const previewBtn = button('Preview', 'btn btn--decisive', 'data-notion-preview');
    previewBtn.addEventListener('click', () => void preview(input.value));
    input.addEventListener('keydown', (event) => { if (event.key === 'Enter') void preview(input.value); });

    input.addEventListener('input', () => {
      window.clearTimeout(searchTimer);
      const text = input.value.trim();
      const mine = ++searchSeq;
      if (parseNotionPageId(text) || text.length < 2) { results.hidden = true; results.replaceChildren(); return; }
      searchTimer = window.setTimeout(async () => {
        let items: Awaited<ReturnType<typeof searchNotion>>['items'];
        try { ({ items } = await searchNotion(text)); }
        catch (e) { if (mine === searchSeq && !closed) showError(e instanceof Error ? e.message : 'Search failed.'); return; }
        if (mine !== searchSeq || closed) return;
        showError('');
        results.hidden = false;
        if (!items.length) { results.replaceChildren(el('li', 'notion-import__muted', 'No pages found.')); return; }
        results.replaceChildren(...items.map((item) => {
          const li = el('li');
          const pick = button(item.category ? `${item.title} · ${item.category}` : item.title, 'notion-import__result');
          pick.addEventListener('click', () => void preview(item.page_id));
          li.append(pick);
          return li;
        }));
      }, 300);
    });

    setStep([label, results], [cancelBtn(), previewBtn]);
    input.focus();
  }

  async function preview(raw: string): Promise<void> {
    const id = parseNotionPageId(raw);
    if (!id) {
      showError('That isn’t a Notion link. Paste the page link from Notion (Share, then Copy link).');
      return;
    }
    // A pending search must not land on a later step.
    window.clearTimeout(searchTimer);
    searchSeq++;
    pageId = id;
    showError('');
    setStep([], [cancelBtn()], 'Reading from Notion…');
    let jobId: string;
    try {
      jobId = await startPlan(id);
    } catch (e) {
      if (closed) return;
      renderPick();
      showError(e instanceof Error ? e.message : 'Could not read that page.');
      return;
    }
    await follow('plan', jobId);
  }

  /** Polls one job to its end and shows the result. Used for first runs and for Check again. */
  async function follow(kind: 'plan' | 'apply', jobId: string): Promise<void> {
    lastJob = { id: jobId, kind };
    if (kind === 'apply') applying = true;
    const waiting = kind === 'plan' ? 'Reading from Notion…' : 'Importing…';
    if (kind === 'apply') setStep([], [cancelBtn('Close')], waiting);
    else setStatus(waiting);
    try {
      const job = await waitForJob(jobId, (j) => { if (!closed) setStatus(progressText(j) ?? waiting); }, { signal: abort.signal });
      if (kind === 'apply') applying = false;
      if (closed) return;
      if (kind === 'plan') {
        if (job.status === 'failed' || !job.plan) { renderPick(); showError(job.error ?? 'Could not read that page.'); return; }
        plan = job.plan;
        excluded = new Set();
        overrides = {};
        htmlAsCode.clear();
        openRules.clear();
        renderPreview();
        return;
      }
      if (job.status === 'failed' || !job.report) { failImport(job.error ?? 'The import failed.'); return; }
      options.onDone(job.report);
      if (!closed) renderDone(job.report);
    } catch (e) {
      if (kind === 'apply' && !(e instanceof JobTimeoutError) && !isAbort(e)) applying = false;
      if (closed || isAbort(e)) return;
      const message = e instanceof Error ? e.message : kind === 'plan' ? 'Could not read that page.' : 'The import failed.';
      if (e instanceof JobTimeoutError) { renderTimeout(message); return; }
      if (kind === 'plan') { renderPick(); showError(message); } else failImport(message);
    }
  }

  function renderTimeout(message: string): void {
    const again = button('Check again', 'btn btn--decisive', 'data-notion-check-again');
    again.addEventListener('click', () => { again.disabled = true; showError(''); if (lastJob) void follow(lastJob.kind, lastJob.id); });
    setStep([], [cancelBtn('Close'), again]);
    showError(message);
  }

  // ---- Step 2: preview ----
  const planById = (): Map<string, PlannedEntityPreview> => new Map((plan?.entities ?? []).map((e) => [e.page_id, e]));

  function ancestorExcluded(entity: PlannedEntityPreview): boolean {
    const byId = planById();
    for (let p = entity.parent_page_id; p; p = byId.get(p)?.parent_page_id ?? null) {
      if (excluded.has(p)) return true;
    }
    return false;
  }

  /**
   * Mirrors map-entities: override, then the page's own suggestion, then the parent's record value.
   * A unit or class parent passes year and subject, a document passes only its subject, a lesson neither.
   */
  function effective(entity: PlannedEntityPreview, field: 'year' | 'subject'): string | undefined {
    const o = overrides[entity.page_id] ?? {};
    const own = field === 'year'
      ? o.year_id ?? entity.suggested.year_id
      : o.subject_id ?? o.create_subject_title ?? entity.suggested.subject_id;
    if (own) return own;
    const parent = entity.parent_page_id ? planById().get(entity.parent_page_id) : undefined;
    if (!parent || parent.kind === 'lesson') return undefined;
    if (parent.kind === 'document' && field === 'year') return undefined;
    return effective(parent, field);
  }

  function unmet(entity: PlannedEntityPreview): boolean {
    const o = overrides[entity.page_id] ?? {};
    return entity.needs.some((need) =>
      need === 'year' ? !effective(entity, 'year')
        : need === 'subject' ? !effective(entity, 'subject')
          : !o.unit_id);
  }

  function fieldWrap(text: string, control: HTMLElement): HTMLLabelElement {
    const wrap = el('label', 'notion-import__picker');
    wrap.append(el('span', 'notion-import__picker-label', text), control);
    return wrap;
  }

  function optionSelect(hook: string, aria: string, placeholder: string, items: Array<{ id: string; title: string }>, current: string | undefined): HTMLSelectElement {
    const select = el('select', 'create-modal__select');
    select.dataset.notionPicker = hook;
    select.setAttribute('aria-label', aria);
    const empty = el('option', '', placeholder);
    empty.value = '';
    select.append(empty);
    for (const item of items) {
      const opt = el('option', '', item.title);
      opt.value = item.id;
      select.append(opt);
    }
    select.value = current ?? '';
    return select;
  }

  const isActive = (x: unknown): boolean => {
    const status = (x as { status?: string }).status;
    return status === undefined || status === 'active';
  };

  function pickersFor(entity: PlannedEntityPreview, isRoot: boolean, refresh: () => void): HTMLElement[] {
    const o = (): EntityOverride => (overrides[entity.page_id] ??= {});
    const out: HTMLElement[] = [];
    const wantsHierarchy = entity.kind === 'unit' || entity.kind === 'class';
    if (entity.needs.includes('year') || (isRoot && wantsHierarchy)) {
      const years = options.curriculum.years.slice().sort((a, b) => a.year_level - b.year_level)
        .map((y) => ({ id: y.id, title: y.title }));
      const select = optionSelect(`year:${entity.page_id}`, `Year for ${entity.title}`, 'Choose a year', years, overrides[entity.page_id]?.year_id ?? entity.suggested.year_id);
      select.addEventListener('change', () => { o().year_id = select.value || undefined; refresh(); });
      out.push(fieldWrap('Year', select));
    }
    if (entity.needs.includes('subject') || (isRoot && wantsHierarchy)) {
      const subjects = options.curriculum.subjects.filter(isActive).sort((a, b) => a.title.localeCompare(b.title))
        .map((s) => ({ id: s.id, title: s.display_title || s.title }));
      const current = overrides[entity.page_id];
      // An entry for either field, even a cleared one, means the user has already decided.
      const touched = Boolean(current) && ('subject_id' in current! || 'create_subject_title' in current!);
      if (!touched && !entity.suggested.subject_id && entity.suggested.subject_title) {
        // The default is a real choice, so record it; otherwise Import would wait on a picker already showing it.
        o().create_subject_title = entity.suggested.subject_title;
      }
      const chosen = overrides[entity.page_id];
      const offer = chosen?.create_subject_title ?? entity.suggested.subject_title;
      const select = optionSelect(`subject:${entity.page_id}`, `Subject for ${entity.title}`, 'Choose a subject', subjects, chosen?.subject_id ?? entity.suggested.subject_id);
      if (offer) {
        const opt = el('option', '', `Create “${offer}”`);
        opt.value = `create:${offer}`;
        select.append(opt);
        if (chosen?.create_subject_title) select.value = opt.value;
      }
      select.addEventListener('change', () => {
        if (select.value.startsWith('create:')) { o().create_subject_title = select.value.slice(7); delete o().subject_id; }
        else { o().subject_id = select.value || undefined; delete o().create_subject_title; }
        refresh();
      });
      out.push(fieldWrap('Subject', select));
    }
    if (entity.needs.includes('unit')) {
      const units = options.curriculum.units.filter((u) => u.status === 'active').sort((a, b) => a.title.localeCompare(b.title))
        .map((u) => ({ id: u.id, title: u.title }));
      const select = optionSelect(`unit:${entity.page_id}`, `Unit for ${entity.title}`, 'Choose a unit', units, overrides[entity.page_id]?.unit_id);
      select.addEventListener('change', () => { o().unit_id = select.value || undefined; refresh(); });
      out.push(fieldWrap('Unit', select));
    }
    return out;
  }

  function renderPreview(): void {
    if (!plan) return;
    const current = plan;
    const scroll = body.scrollTop;
    const focusedInclude = document.activeElement instanceof HTMLElement ? document.activeElement.dataset.notionInclude : undefined;

    const importBtn = button('Import', 'btn btn--decisive', 'data-notion-import');
    const hint = el('p', 'notion-import__muted notion-import__hint');
    const refresh = (): void => {
      const included = current.entities.filter((e) => !excluded.has(e.page_id) && !ancestorExcluded(e));
      const blocked = included.filter(unmet).length;
      importBtn.disabled = included.length === 0 || blocked > 0;
      hint.textContent = included.length === 0 ? 'Nothing is ticked.'
        : blocked ? `${pluralise(blocked, 'item')} still ${blocked === 1 ? 'needs' : 'need'} a choice.` : '';
      hint.hidden = !hint.textContent;
    };

    const tree = el('ul', 'notion-import__tree');
    for (const row of buildRows(current, excluded)) {
      const entity = current.entities.find((e) => e.page_id === row.page_id);
      const parentOff = entity ? ancestorExcluded(entity) : false;
      const li = el('li', `notion-import__row${row.included && !parentOff ? '' : ' is-excluded'}`);
      li.dataset.notionRow = row.page_id;
      li.style.setProperty('--depth', String(row.depth));
      const line = el('div', 'notion-import__line');
      if (entity) {
        const box = el('input');
        box.type = 'checkbox';
        box.checked = row.included && !parentOff;
        box.disabled = parentOff;
        if (parentOff) box.title = 'Its parent is excluded. Tick the parent to include this.';
        box.dataset.notionInclude = row.page_id;
        box.setAttribute('aria-label', `Include ${row.title}`);
        box.addEventListener('click', () => { excluded = toggleExcluded(current, excluded, row.page_id); renderPreview(); });
        line.append(box);
      }
      line.append(el('span', 'notion-import__title', row.title));
      const chip = (text: string, tone = ''): HTMLElement => {
        const c = el('span', `notion-import__chip${tone}`, text);
        c.title = text;
        return c;
      };
      line.append(chip(row.label));
      if (row.badge) line.append(chip(row.badge, ' notion-import__chip--accent'));
      if (row.warning_count) line.append(chip(pluralise(row.warning_count, 'note'), ' notion-import__chip--warn'));
      li.append(line);
      if (row.skipped_reason) li.append(el('p', 'notion-import__muted', row.skipped_reason));
      if (entity && row.included && !parentOff) {
        const pickers = pickersFor(entity, row.depth === 0, refresh);
        if (pickers.length) {
          const wrap = el('div', 'notion-import__pickers');
          wrap.append(...pickers);
          li.append(wrap);
        }
      }
      tree.append(li);
    }

    const warnings = el('section', 'notion-import__warnings');
    warnings.dataset.notionWarnings = '';
    for (const group of groupWarnings(current, excluded)) {
      const details = el('details');
      details.open = openRules.has(group.rule);
      details.addEventListener('toggle', () => { if (details.open) openRules.add(group.rule); else openRules.delete(group.rule); });
      details.append(el('summary', '', `${group.title} (${group.items.length})`));
      const list = el('ul');
      for (const w of group.items) list.append(el('li', '', w.message));
      details.append(list);
      warnings.append(details);
    }
    for (const app of current.html_apps.filter((a) => !excluded.has(a.page_id))) {
      const label = el('label', 'notion-import__toggle');
      const box = el('input');
      box.type = 'checkbox';
      box.checked = !htmlAsCode.has(app.notion_block_id);
      box.addEventListener('change', () => { if (box.checked) htmlAsCode.delete(app.notion_block_id); else htmlAsCode.add(app.notion_block_id); });
      label.append(box, el('span', '', `Run as interactive: ${app.preview}`));
      warnings.append(label);
    }

    importBtn.addEventListener('click', () => void runImport());
    const back = button('Back', 'btn btn--ghost');
    back.addEventListener('click', () => { showError(''); renderPick(); });
    setStep([tree, warnings, hint], [back, importBtn], '', true);
    refresh();
    body.scrollTop = scroll;
    const restore = focusedInclude
      ? body.querySelector<HTMLElement>(`[data-notion-include="${CSS.escape(focusedInclude)}"]:not(:disabled)`)
      : null;
    if (restore) restore.focus(); else focusFirst();
  }

  // ---- Step 3: import ----
  async function runImport(): Promise<void> {
    showError('');
    setStep([], [cancelBtn('Close')], 'Importing…');
    let jobId: string;
    try {
      jobId = await startApply(pageId, choicesFrom(excluded, overrides, htmlAsCode));
    } catch (e) {
      failImport(e instanceof Error ? e.message : 'The import failed.');
      return;
    }
    await follow('apply', jobId);
  }

  function failImport(message: string): void {
    if (closed) return;
    renderPreview();
    showError(message);
  }

  function renderDone(report: NotionImportReport): void {
    const titleOf = (pageId: string): string => {
      const hit = plan?.entities.find((e) => e.page_id === pageId) ?? plan?.skipped.find((x) => x.page_id === pageId);
      return hit?.title ?? 'A page';
    };
    const done = el('div', 'notion-import__done');
    done.dataset.notionDone = '';
    done.append(el('p', '', `Imported ${pluralise(report.written.length, 'item')}.`));
    if (report.skipped.length) {
      const details = el('details');
      details.append(el('summary', '', `${report.skipped.length} skipped`));
      const list = el('ul');
      for (const item of report.skipped) list.append(el('li', '', `${titleOf(item.page_id)}: ${item.reason}`));
      details.append(list);
      done.append(details);
    }
    for (const group of groupWarningList(report.warnings)) {
      const details = el('details');
      details.append(el('summary', '', `${group.title} (${group.items.length})`));
      const list = el('ul');
      for (const w of group.items) list.append(el('li', '', w.message));
      details.append(list);
      done.append(details);
    }
    const finish = button('Done', 'btn btn--decisive');
    finish.addEventListener('click', close);
    setStep([done], [finish]);
    finish.focus();
  }

  renderPick();
  return { close };
}
