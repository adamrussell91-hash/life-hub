import { ApiClientError } from '@/api/client';
import { knowledgeHubPageUrl } from '@/alchemy/connections';
import { knowledgeHubOrigin } from '@/alchemy/client';
import type { AlchemyEntity } from './block-revision';
import { createProposalCards, el } from './agent-cards';
import { followAgentJob, latestAgentReview, readAgentSettings, saveRulesNote, searchRulesNotes, startAgentReview, type AgentJob, type AgentSettings } from './agent-client';

export type AgentPanelOptions = {
  kind?: 'lesson' | 'unit';
  id: string;
  getEntity: () => AlchemyEntity;
  /** Saves the editor first, so Ann reads what the teacher sees. */
  flush: () => Promise<void>;
  /** Puts a changed lesson on the page and saves it. */
  apply: (next: AlchemyEntity) => Promise<void>;
};
export type AgentPanelHandle = { refresh(): void; dispose(): void };

/** Ann's progress lines and her closing summary for one review. */
export function paintAgentStatus(host: HTMLElement, job: AgentJob | null) {
  host.replaceChildren();
  if (!job) return;
  if (job.status === 'working') {
    const list = el('ol', 'alchemy-agent__progress');
    for (const step of job.progress.slice(-8)) list.append(el('li', '', step.text));
    if (!job.progress.length) list.append(el('li', '', 'Starting'));
    host.append(el('p', 'alchemy-agent__working', 'Ann is working. You can keep editing; this takes a few minutes.'), list);
    return;
  }
  if (job.status === 'error') { host.append(el('p', 'alchemy-agent__muted', job.error?.message || 'Ann could not finish this review.')); return; }
  if (!job.result) return;
  const summary = el('div', 'alchemy-agent__summary');
  summary.append(el('p', 'alchemy-agent__eyebrow', 'Ann’s review'), el('p', '', job.result.summary));
  if (job.result.stoppedEarly) summary.append(el('p', 'alchemy-agent__muted', 'Ann reached her time or reading limit, so she stopped early.'));
  host.append(summary);
}

export function lostTouchMessage(e: unknown): string {
  return e instanceof ApiClientError && e.code === 'unauthorized' ? 'Your session expired. Sign in again to keep using Alchemy Lab.' : 'Lost touch with Ann’s review. It may still be running; reopen Alchemy Lab to check.';
}

/**
 * Alchemy Lab's whole-page review: one button starts Ann, the panel shows
 * what she is doing, then her suggestions as cards to accept or dismiss.
 */
export function mountAgentPanel(host: HTMLElement, options: AgentPanelOptions): AgentPanelHandle {
  const kind = options.kind ?? 'lesson';
  const noun = kind === 'unit' ? 'unit' : 'lesson';
  const lifecycle = new AbortController();
  let job: AgentJob | null = null;
  let settings: AgentSettings | null = null;

  const root = el('section', 'alchemy-agent');
  root.setAttribute('aria-label', `Improve this ${noun} with Ann`);
  const intro = el('div', 'alchemy-agent__intro');
  const rules = el('div', 'alchemy-agent__rules');
  const start = el('button', 'btn btn--primary alchemy-agent__start', 'Improve with Ann');
  start.type = 'button';
  intro.append(
    el('h2', 'alchemy-agent__title', `Improve this ${noun}`),
    el('p', 'alchemy-agent__blurb', `Ann reads the whole ${noun} and your rules, searches your Knowledge Hub, opens the notes that matter and suggests small changes, each quoting the note behind it.`),
    rules, start
  );
  const error = el('p', 'alchemy-agent__error');
  error.setAttribute('role', 'alert');
  error.hidden = true;
  const status = el('div', 'alchemy-agent__status');
  status.setAttribute('aria-live', 'polite');
  const showError = (message: string) => { error.textContent = message; error.hidden = !message; };
  const cards = createProposalCards({ getEntity: options.getEntity, apply: options.apply, onError: showError });
  root.append(intro, error, status, cards.element);
  host.append(root);

  function paintRules() {
    rules.replaceChildren();
    const line = el('p', 'alchemy-agent__rules-line');
    if (!settings) { line.textContent = 'Checking your rules note…'; rules.append(line); return; }
    if (settings.rulesNoteId) {
      const link = el('a', '', settings.rulesNoteTitle ?? 'your rules note');
      link.href = knowledgeHubPageUrl(knowledgeHubOrigin(), settings.rulesNoteId);
      link.target = '_blank'; link.rel = 'noopener noreferrer';
      line.append('Rules: ', link);
    } else line.textContent = 'No rules note chosen. Ann will use general teaching judgement.';
    const change = el('button', 'btn btn--ghost alchemy-agent__rules-change', settings.rulesNoteId ? 'Change' : 'Choose a rules note');
    change.type = 'button';
    change.addEventListener('click', openRulesPicker);
    rules.append(line, change);
  }

  function openRulesPicker() {
    rules.replaceChildren();
    const form = el('form', 'alchemy-agent__picker');
    const label = el('label', '', 'Find the Knowledge Hub note that holds your lesson rules');
    const input = el('input');
    input.type = 'search'; input.placeholder = 'Note title'; input.autocomplete = 'off';
    label.append(input);
    const list = el('ul', 'alchemy-agent__picker-list');
    const actions = el('div', 'alchemy-agent__picker-actions');
    const cancel = el('button', 'btn btn--ghost', 'Cancel'); cancel.type = 'button';
    cancel.addEventListener('click', paintRules);
    actions.append(cancel);
    if (settings?.rulesNoteId) {
      const clear = el('button', 'btn btn--ghost', 'Use no rules note'); clear.type = 'button';
      clear.addEventListener('click', () => void choose(null));
      actions.append(clear);
    }
    form.append(label, list, actions);
    form.addEventListener('submit', event => event.preventDefault());
    rules.append(form);
    input.focus();
    let timer = 0, seq = 0;
    input.addEventListener('input', () => {
      clearTimeout(timer);
      const text = input.value.trim();
      if (text.length < 2) { list.replaceChildren(); return; }
      timer = window.setTimeout(() => {
        const mine = ++seq;
        void searchRulesNotes(text).then(({ notes }) => {
          if (mine !== seq) return;
          list.replaceChildren(...(notes.length ? notes.map(note => {
            const pick = el('button', 'alchemy-agent__picker-option', note.title); pick.type = 'button';
            pick.addEventListener('click', () => void choose(note.id));
            const item = el('li'); item.append(pick); return item;
          }) : [el('li', 'alchemy-agent__muted', 'No notes with that title.')]));
        }).catch(() => { if (mine === seq) list.replaceChildren(el('li', 'alchemy-agent__muted', 'Search is unavailable. Try again.')); });
      }, 250);
    });
    async function choose(id: string | null) {
      try { settings = await saveRulesNote(id); showError(''); paintRules(); }
      catch (e) { showError(e instanceof Error ? e.message : 'That note could not be chosen.'); }
    }
  }

  function paint() {
    const working = job?.status === 'working';
    start.disabled = working;
    start.textContent = working ? 'Ann is reviewing' : job ? 'Review again' : 'Improve with Ann';
    paintAgentStatus(status, job);
    cards.show(job);
  }

  async function follow(first: AgentJob) {
    job = first; paint();
    try { await followAgentJob(first, next => { job = next; paint(); }, lifecycle.signal); }
    catch (e) { if (!lifecycle.signal.aborted) showError(lostTouchMessage(e)); }
  }

  start.addEventListener('click', () => {
    void (async () => {
      showError('');
      start.disabled = true;
      try {
        await options.flush();
        await follow(await startAgentReview({ kind, id: options.id }));
      } catch (e) {
        showError(e instanceof Error && e.message ? e.message : 'Ann could not start. Try again.');
        paint();
      }
    })();
  });

  function refresh() {
    void readAgentSettings().then(s => { settings = s; paintRules(); }).catch(() => { settings = { rulesNoteId: null, rulesNoteTitle: null }; paintRules(); });
    if (job?.status === 'working') return;
    void latestAgentReview(kind, options.id).then(latest => {
      if (!latest || lifecycle.signal.aborted) return;
      if (latest.status === 'working') void follow(latest);
      else { job = latest; paint(); }
    }).catch(() => {});
  }

  paintRules();
  paint();
  refresh();
  return { refresh, dispose() { lifecycle.abort(); root.remove(); } };
}
