import { ApiClientError } from '@/api/client';
import { knowledgeHubPageUrl } from '@/alchemy/connections';
import { knowledgeHubOrigin } from '@/alchemy/client';
import { el } from './dom';
import { followAgentJob, latestAgentReview, readAgentSettings, saveRulesNote, searchRulesNotes, startAgentReview, type AgentJob, type AgentSettings } from './agent-client';
import type { ReviewStore } from './review-state';

export type AnnBarOptions = {
  store: ReviewStore;
  kind: 'lesson' | 'unit';
  id: string;
  flush: () => Promise<void>;
  acceptAll: () => Promise<void>;
  start?: typeof startAgentReview;
  follow?: typeof followAgentJob;
  latest?: typeof latestAgentReview;
};
export type AnnBarHandle = { focus(): void; dispose(): void };

/** Ann's research steps from her progress lines: searches and notes read. */
export type TrailStep = { kind: 'search' | 'note' | 'lesson'; text: string };
export function researchTrail(job: AgentJob | null) {
  const steps = (job?.progress ?? []).map(p => p.text).flatMap((text): TrailStep[] => {
    if (text.startsWith('Searching: ')) return [{ kind: 'search', text: text.slice(11) }];
    if (text.startsWith('Reading lesson: ')) return [{ kind: 'lesson', text: text.slice(16) }];
    if (text.startsWith('Reading: ')) return [{ kind: 'note', text: text.slice(9) }];
    return [];
  });
  return { steps, searches: steps.filter(s => s.kind === 'search').length, notes: new Set(steps.filter(s => s.kind === 'note').map(s => s.text)).size };
}

export function lostTouch(e: unknown): string {
  return e instanceof ApiClientError && e.code === 'unauthorized' ? 'Your session expired. Sign in again to keep using Alchemy Lab.' : 'Lost touch with Ann’s review. It may still be running; reopen the lesson to check.';
}

/**
 * Ann's bar at the top of the lesson: start a review, watch what she reads,
 * then step through her suggestions. The suggestions themselves sit in the
 * lesson, under the blocks they change.
 */
export function mountAnnBar(host: HTMLElement, options: AnnBarOptions): AnnBarHandle {
  const { store, kind } = options;
  const start = options.start ?? startAgentReview;
  const follow = options.follow ?? followAgentJob;
  const latest = options.latest ?? latestAgentReview;
  const lifecycle = new AbortController();
  let settings: AgentSettings | null = null;
  let trailOpen = false, moreOpen = false, picking = false, summaryOpen = false, starting = false;

  const bar = el('section', 'ann-bar');
  bar.setAttribute('aria-label', 'Ann’s review of this ' + kind);
  bar.tabIndex = -1;
  host.append(bar);

  const button = (label: string, cls: string, onClick: () => void, primary = false) => {
    const b = el('button', 'btn ' + (primary ? 'btn--primary ' : 'btn--ghost ') + cls, label);
    b.type = 'button';
    b.addEventListener('click', onClick);
    return b;
  };

  async function startReview() {
    if (starting) return;
    starting = true; store.setError(''); paint();
    try {
      await options.flush();
      void watch(await start({ kind, id: options.id }));
    } catch (e) { store.setError(e instanceof Error && e.message ? e.message : 'Ann could not start. Try again.'); }
    finally { starting = false; paint(); }
  }

  async function watch(first: AgentJob) {
    store.setReview(first);
    try { await follow(first, job => store.setReview(job), lifecycle.signal); }
    catch (e) { if (!lifecycle.signal.aborted) store.setError(lostTouch(e)); }
  }

  function rulesLine(): HTMLElement {
    const wrap = el('div', 'ann-bar__rules');
    if (picking) { wrap.append(rulesPicker()); return wrap; }
    const line = el('span', 'ann-bar__muted');
    if (!settings) line.textContent = 'Checking your rules note…';
    else if (settings.rulesNoteId) {
      const link = el('a', '', settings.rulesNoteTitle ?? 'your rules note');
      link.href = knowledgeHubPageUrl(knowledgeHubOrigin(), settings.rulesNoteId);
      link.target = '_blank'; link.rel = 'noopener noreferrer';
      line.append('Rules: ', link);
    } else line.textContent = 'No rules note chosen';
    wrap.append(line, button(settings?.rulesNoteId ? 'Change' : 'Choose', 'ann-bar__link', () => { picking = true; paint(); bar.querySelector('input')?.focus(); }));
    return wrap;
  }

  function rulesPicker(): HTMLElement {
    const form = el('form', 'ann-bar__picker');
    const input = el('input');
    input.type = 'search'; input.placeholder = 'Find your rules note by title'; input.autocomplete = 'off';
    input.setAttribute('aria-label', 'Find the Knowledge Hub note that holds your lesson rules');
    const list = el('ul', 'ann-bar__picker-list');
    form.append(input, list, button('Cancel', '', () => { picking = false; paint(); }));
    if (settings?.rulesNoteId) form.append(button('Use no rules note', '', () => void choose(null)));
    form.addEventListener('submit', e => e.preventDefault());
    let timer = 0, seq = 0;
    input.addEventListener('input', () => {
      clearTimeout(timer);
      const text = input.value.trim();
      if (text.length < 2) { list.replaceChildren(); return; }
      timer = window.setTimeout(() => {
        const mine = ++seq;
        void searchRulesNotes(text).then(({ notes }) => {
          if (mine !== seq) return;
          list.replaceChildren(...(notes.length ? notes.map(n => { const li = el('li'); li.append(button(n.title, 'ann-bar__option', () => void choose(n.id))); return li; }) : [el('li', 'ann-bar__muted', 'No notes with that title.')]));
        }).catch(() => { if (mine === seq) list.replaceChildren(el('li', 'ann-bar__muted', 'Search is unavailable. Try again.')); });
      }, 250);
    });
    async function choose(id: string | null) {
      try { settings = await saveRulesNote(id); picking = false; paint(); }
      catch (e) { store.setError(e instanceof Error ? e.message : 'That note could not be chosen.'); }
    }
    return form;
  }

  function trail(job: AgentJob | null): HTMLElement {
    const { steps } = researchTrail(job);
    const list = el('ol', 'ann-bar__trail');
    list.id = 'ann-bar-trail-' + options.id;
    const sources = new Map((job?.result?.proposals ?? []).flatMap(p => (p.source ? [[p.source.title, p.source.noteId] as const] : [])));
    for (const step of steps) {
      const li = el('li', 'ann-bar__trail-' + step.kind);
      const icon = step.kind === 'search' ? 'Searched' : step.kind === 'note' ? 'Read' : 'Read lesson';
      li.append(el('span', 'ann-bar__muted', icon + ' '));
      const noteId = step.kind === 'note' ? sources.get(step.text) : undefined;
      if (noteId) { const a = el('a', '', step.text); a.href = knowledgeHubPageUrl(knowledgeHubOrigin(), noteId); a.target = '_blank'; a.rel = 'noopener noreferrer'; li.append(a); }
      else li.append(step.kind === 'search' ? `“${step.text}”` : step.text);
      list.append(li);
    }
    if (!steps.length) list.append(el('li', 'ann-bar__muted', 'Nothing read yet.'));
    return list;
  }

  function counter(job: AgentJob | null): HTMLButtonElement {
    const { searches, notes } = researchTrail(job);
    const b = button(`${searches} ${searches === 1 ? 'search' : 'searches'} · ${notes} ${notes === 1 ? 'note' : 'notes'} read`, 'ann-bar__counter', () => { trailOpen = !trailOpen; paint(); });
    b.setAttribute('aria-expanded', String(trailOpen));
    b.setAttribute('aria-controls', 'ann-bar-trail-' + options.id);
    return b;
  }

  function paint() {
    const { review, closed, error } = store.state;
    const row = el('div', 'ann-bar__row');
    const below: HTMLElement[] = [];
    bar.dataset.state = review?.status === 'working' ? 'working' : review?.status === 'done' && !closed ? 'done' : review?.status === 'error' && !closed ? 'error' : 'idle';
    bar.classList.toggle('ann-bar--more', moreOpen);
    row.append(el('span', 'ann-bar__name', 'Ann'));

    if (bar.dataset.state === 'working') {
      const lastStep = review!.progress.at(-1)?.text ?? 'Starting';
      row.append(el('span', 'ann-bar__live', lastStep), counter(review));
    } else if (bar.dataset.state === 'done') {
      const pending = store.pending().length;
      row.append(el('span', 'ann-bar__count', pending ? `${pending} ${pending === 1 ? 'suggestion' : 'suggestions'}` : 'All suggestions handled'));
      // Stepping is about the lesson, so the trail folds away to give it the room.
      if (pending) row.append(button('Previous', 'ann-bar__prev', () => { trailOpen = false; store.step(-1); }), button('Next', 'ann-bar__next', () => { trailOpen = false; store.step(1); }));
      const extra = el('span', 'ann-bar__extra');
      if (pending > 1) extra.append(button(`Accept all ${pending}`, 'ann-bar__accept-all', () => void options.acceptAll()));
      extra.append(counter(review), button('Close review', 'ann-bar__close', () => { trailOpen = false; store.closeReview(); }));
      row.append(extra, button(moreOpen ? 'Less' : 'More', 'ann-bar__more-toggle', () => { moreOpen = !moreOpen; paint(); }));
      const summary = el('p', 'ann-bar__summary' + (summaryOpen ? ' ann-bar__summary--open' : ''), review!.result?.summary ?? '');
      summary.tabIndex = 0;
      summary.title = summaryOpen ? '' : 'Show all';
      summary.addEventListener('click', () => { summaryOpen = !summaryOpen; paint(); });
      below.push(summary);
      if (review!.result?.stoppedEarly) below.push(el('p', 'ann-bar__muted', 'Ann reached her time or reading limit, so she stopped early.'));
    } else {
      if (bar.dataset.state === 'error') row.append(el('span', 'ann-bar__error', review!.error?.message || 'Ann could not finish this review.'));
      const go = button(bar.dataset.state === 'error' ? 'Try again' : review ? 'Review again' : 'Improve with Ann', 'ann-bar__start', () => void startReview(), true);
      go.disabled = starting;
      row.append(go, rulesLine());
    }
    if (error) below.push(el('p', 'ann-bar__error', error));
    if (trailOpen && review && bar.dataset.state !== 'idle') below.push(trail(review));
    bar.replaceChildren(row, ...below);
  }

  const unsubscribe = store.subscribe(paint);
  paint();
  void readAgentSettings().then(s => { settings = s; paint(); }).catch(() => { settings = { rulesNoteId: null, rulesNoteTitle: null }; paint(); });
  void latest(kind, options.id).then(job => {
    if (!job || lifecycle.signal.aborted || store.state.review) return;
    if (job.status === 'working') void watch(job); else store.setReview(job);
  }).catch(() => {});

  return {
    focus() { bar.scrollIntoView({ block: 'nearest' }); (bar.querySelector<HTMLElement>('.ann-bar__start, .ann-bar__next') ?? bar).focus(); },
    dispose() { lifecycle.abort(); unsubscribe(); bar.remove(); }
  };
}
