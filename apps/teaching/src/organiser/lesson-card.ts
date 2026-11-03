import './organiser.css';
import { ApiClientError } from '@/api/client';
import { navigate } from '@/app/router';
import { costText } from '@/blocks/next-step-run';
import { organiserApi } from './api';
import { fitCells } from './editor-model';
import type { OrganiserSection, SuggestProposal, TeacherOrganiser } from './types';

/**
 * Organiser card on the lesson page: how many lines this lesson has given the unit's organiser,
 * Add a line, and Ann, suggest lines. Lines added here link to this lesson. Ann runs as a job
 * (never the chat); her proposals are ticked here and only added when the teacher presses the button.
 */

export interface OrganiserCardOptions {
  lesson: { id: string; unit_id: string };
}

const POLL_MS = 2500;
/** A little over the server's deadline for a suggestion run. */
const MAX_POLLS = 220;

function h<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(label: string, className = 'btn btn--ghost ko-btn', onClick?: () => void): HTMLButtonElement {
  const node = h('button', className, label);
  node.type = 'button';
  if (onClick) node.addEventListener('click', onClick);
  return node;
}

const padded = <T extends HTMLElement>(node: T): T => {
  node.style.padding = '6px 8px';
  return node;
};
const say = (error: unknown, fallback: string): string => (error instanceof Error && error.message ? error.message : fallback);
const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`;

export function mountOrganiserCard(host: HTMLElement, options: OrganiserCardOptions): { element: HTMLElement; dispose(): void } {
  const { lesson } = options;
  const root = h('section', 'ko-card');
  root.setAttribute('aria-label', 'Organiser lines from this lesson');
  const head = button('', 'ko-card__head');
  const title = h('span', 'ko-card__title', 'Organiser');
  const summary = h('span', 'ko-card__summary', 'Loading…');
  const toggle = h('span', 'ko-card__toggle');
  head.append(title, summary, toggle);
  const body = h('div', 'ko-card__body');
  body.id = `ko-card-${Math.random().toString(36).slice(2, 8)}`;
  head.setAttribute('aria-controls', body.id);
  const mainBox = h('div', 'ko-add');
  const annBox = h('div', 'ko-add');
  body.append(mainBox, annBox);
  root.append(head, body);
  host.append(root);

  let disposed = false;
  let isOpen = false;
  let data: TeacherOrganiser | null = null;
  let loadFailed = false;
  let message = '';
  let messageBad = false;
  let sectionId = '';
  let draft: string[] = [];

  type Estimate = { state: 'idle' | 'loading' | 'ready' | 'error'; cost_aud?: number };
  let estimate: Estimate = { state: 'idle' };
  type Run = { state: 'idle' | 'running' | 'done' | 'error'; text?: string; proposals?: SuggestProposal[] };
  let run: Run = { state: 'idle' };
  const picked = new Set<number>();
  let pollGeneration = 0;

  const sections = (): OrganiserSection[] => data?.organiser.sections ?? [];
  const mine = (): Array<{ section: OrganiserSection; line: OrganiserSection['lines'][number] }> =>
    sections().flatMap((section) => section.lines.filter((line) => line.lesson_id === lesson.id).map((line) => ({ section, line })));

  const waitingLines = (): boolean => mine().some(({ line }) => data?.status[line.id] !== 'released');

  function paintHead(): void {
    root.classList.toggle('ko-card--open', isOpen);
    head.setAttribute('aria-expanded', String(isOpen));
    body.hidden = !isOpen;
    toggle.textContent = isOpen ? 'Hide' : 'Show';
    if (loadFailed) summary.textContent = 'Could not load';
    else if (!data) summary.textContent = 'Loading…';
    else {
      const n = mine().length;
      summary.textContent = n ? `${plural(n, 'line')} from this lesson${waitingLines() ? ' · students see them once it is published and its date arrives' : ''}` : 'No lines from this lesson yet';
    }
  }

  function currentSection(): OrganiserSection | undefined {
    return sections().find((s) => s.id === sectionId) ?? sections()[0];
  }

  function widthOf(section: OrganiserSection): number {
    return section.kind === 'table' ? (section.columns ?? []).length : 1;
  }

  function paintMain(): void {
    mainBox.replaceChildren();
    if (message) {
      const line = h('p', `ko-status${messageBad ? ' ko-status--bad' : ''}`, message);
      line.setAttribute('role', 'status');
      mainBox.append(line);
    }
    if (loadFailed) {
      mainBox.append(h('p', 'ko-status ko-status--bad', 'The organiser could not be loaded.'), button('Try again', 'btn btn--ghost ko-btn', load));
      return;
    }
    if (!data) return;

    const lines = mine();
    if (lines.length) {
      const scroll = h('div', 'ko-scroll');
      const table = h('table', 'ko-t');
      table.style.minWidth = '0';
      const thead = h('thead');
      const hr = h('tr');
      for (const label of ['Section', 'Line', 'What to know', '']) hr.append(padded(h('th', undefined, label)));
      thead.append(hr);
      const tbody = h('tbody');
      for (const { section, line } of lines) {
        const tr = h('tr');
        const cells = [section.name, line.cells[0] ?? '', line.cells.slice(1).find((c) => c) ?? ''];
        for (const text of cells) tr.append(padded(h('td', undefined, text)));
        const last = h('td');
        last.style.padding = '4px 8px';
        if (line.piece_id) last.append(h('span', 'ko-chip', 'Piece'), ' ');
        const remove = button('✕', 'ko-mini ko-mini--danger', () => {
          remove.disabled = true;
          void change({ op: 'delete_line', line_id: line.id });
        });
        remove.setAttribute('aria-label', 'Remove this line');
        last.append(remove);
        tr.append(last);
        tbody.append(tr);
      }
      table.append(thead, tbody);
      scroll.append(table);
      mainBox.append(scroll);
    }

    const secs = sections();
    if (!secs.length) {
      const row = h('div', 'ko-row');
      row.append(h('span', 'ko-label', 'This unit has no sections yet. Start its organiser first.'));
      row.append(button('Open the unit', 'btn btn--ghost ko-btn', () => navigate(`/units/${encodeURIComponent(lesson.unit_id)}`)));
      mainBox.append(row);
      return;
    }

    const target = currentSection() as OrganiserSection;
    const pills = h('div', 'ko-pills');
    pills.append(h('span', 'ko-label', 'Add a line to:'));
    for (const section of secs) {
      const pill = button(section.name || 'Untitled', 'ko-pill', () => {
        sectionId = section.id;
        draft = [];
        paintMain();
      });
      pill.setAttribute('aria-pressed', String(section.id === target.id));
      pills.append(pill);
    }
    const fields = h('div', 'ko-add__fields');
    const labels = target.kind === 'table' ? (target.columns ?? []).map((c) => c.label) : [target.kind === 'sequence' ? 'Step' : 'Item'];
    while (draft.length < labels.length) draft.push('');
    draft = draft.slice(0, labels.length);
    const submit = (): void => {
      if (!draft.some((c) => c.trim())) return;
      const cells = draft.slice();
      draft = [];
      void change({ op: 'add_lines', section_id: target.id, lines: [{ cells, lesson_id: lesson.id }] });
    };
    labels.forEach((label, i) => {
      const wrap = h('label', undefined, label);
      const input = h('input');
      input.type = 'text';
      input.maxLength = 400;
      input.value = draft[i] ?? '';
      input.addEventListener('input', () => { draft[i] = input.value; });
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          draft[i] = input.value;
          submit();
        }
      });
      wrap.append(input);
      fields.append(wrap);
    });
    const actions = h('div', 'ko-actions');
    actions.append(
      button('Add line', 'btn btn--primary ko-btn', submit),
      button('Edit the whole organiser', 'btn btn--quiet ko-btn', () => navigate(`/units/${encodeURIComponent(lesson.unit_id)}`))
    );
    mainBox.append(pills, fields, actions);
  }

  async function change(op: Parameters<typeof organiserApi.change>[1]): Promise<TeacherOrganiser | null> {
    try {
      data = await organiserApi.change(lesson.unit_id, op);
      message = '';
      messageBad = false;
      paintAll();
      return data;
    } catch (error) {
      message = say(error, 'That did not save. Try again.');
      messageBad = true;
      paintAll();
      return null;
    }
  }

  // ---- Ann ---------------------------------------------------------------------------------

  function annLabel(): string {
    return estimate.state === 'ready' && typeof estimate.cost_aud === 'number'
      ? `Ann, suggest lines (${costText({ cost_aud: estimate.cost_aud })})`
      : 'Ann, suggest lines';
  }

  function sectionName(p: SuggestProposal): string {
    const own = p.section_id ? sections().find((s) => s.id === p.section_id)?.name : p.new_section?.name;
    return own ?? 'a section';
  }

  function paintAnn(): void {
    annBox.replaceChildren();
    const row = h('div', 'ko-actions');
    const ann = button(annLabel(), 'btn btn--primary ko-btn', startRun);
    ann.disabled = estimate.state !== 'ready' || run.state === 'running' || !data;
    row.append(ann);
    if (estimate.state === 'loading') row.append(h('span', 'ko-label', 'Checking what she would cost…'));
    if (estimate.state === 'idle' || estimate.state === 'ready') row.append(h('span', 'ko-label', 'The cost shows before she runs.'));
    annBox.append(row);

    if (estimate.state === 'error') {
      const fail = h('div', 'ko-actions');
      fail.append(h('span', 'ko-status ko-status--bad', 'Could not check the cost.'), button('Try again', 'btn btn--ghost ko-btn', loadEstimate));
      annBox.append(fail);
    }
    if (run.state === 'running') {
      const line = h('p', 'ko-status', run.text ?? 'Ann is reading this lesson…');
      line.setAttribute('role', 'status');
      annBox.append(line);
    }
    if (run.state === 'error') {
      const fail = h('div', 'ko-actions');
      fail.append(h('span', 'ko-status ko-status--bad', run.text ?? 'Ann could not suggest lines.'), button('Try again', 'btn btn--ghost ko-btn', startRun));
      annBox.append(fail);
    }
    if (run.state === 'done') {
      const proposals = run.proposals ?? [];
      const box = h('div', 'ko-ann');
      if (!proposals.length) {
        box.append(h('p', 'ko-ann__head', run.text ?? 'Ann found nothing new to add from this lesson.'));
        box.append(button('Close', 'btn btn--ghost ko-btn', () => { run = { state: 'idle' }; paintAnn(); }));
      } else {
        box.append(h('p', 'ko-ann__head', 'Ann read this lesson and its knowledge pieces. Keep what you want and edit it after.'));
        proposals.forEach((p, i) => {
          const label = h('label');
          const check = h('input');
          check.type = 'checkbox';
          check.checked = picked.has(i);
          check.addEventListener('change', () => {
            if (check.checked) picked.add(i);
            else picked.delete(i);
          });
          const text = h('span', 'ko-ann__line');
          const first = h('span', undefined, p.cells[0] ?? '');
          if (p.tag) first.append(' ', h('span', 'ko-chip', p.tag));
          const more = p.cells.slice(1).filter(Boolean).join(' · ');
          text.append(first, h('small', undefined, `${more ? `${more} · ` : ''}goes in ${sectionName(p)}${p.new_section ? ' (new section)' : ''}`));
          label.append(check, text);
          box.append(label);
        });
        const actions = h('div', 'ko-actions');
        const add = button('Add these lines', 'btn btn--primary ko-btn', () => {
          add.disabled = true;
          void addProposals(proposals);
        });
        actions.append(add, button('Close', 'btn btn--quiet ko-btn', () => { run = { state: 'idle' }; paintAnn(); }));
        box.append(actions);
      }
      annBox.append(box);
    }
  }

  function loadEstimate(): void {
    estimate = { state: 'loading' };
    paintAnn();
    void organiserApi
      .estimateSuggest(lesson.id)
      .then((res) => {
        if (disposed) return;
        estimate = { state: 'ready', cost_aud: res.estimate.cost_aud };
        paintAnn();
      })
      .catch(() => {
        if (disposed) return;
        estimate = { state: 'error' };
        paintAnn();
      });
  }

  function startRun(): void {
    const generation = ++pollGeneration;
    run = { state: 'running', text: 'Ann is reading this lesson…' };
    paintAnn();
    void (async () => {
      let id: string;
      try {
        id = (await organiserApi.startSuggest(lesson.id)).id;
      } catch (error) {
        const joined = error instanceof ApiClientError ? (error.details as { id?: string } | undefined)?.id : undefined;
        if (!joined) {
          if (disposed || generation !== pollGeneration) return;
          run = { state: 'error', text: say(error, 'Ann could not start. Try again.') };
          paintAnn();
          return;
        }
        id = joined;
      }
      for (let polls = 0; polls < MAX_POLLS; polls += 1) {
        await new Promise<void>((resolve) => window.setTimeout(resolve, POLL_MS));
        if (disposed || generation !== pollGeneration) return;
        try {
          const job = await organiserApi.suggestJob(id);
          if (job.status === 'done') {
            const proposals = job.proposals ?? [];
            picked.clear();
            proposals.forEach((_p, i) => picked.add(i));
            run = { state: 'done', proposals, text: proposals.length ? undefined : 'Ann found nothing new to add from this lesson.' };
            paintAnn();
            return;
          }
          if (job.status === 'error') {
            run = { state: 'error', text: job.error || 'Ann could not suggest lines. Try again.' };
            paintAnn();
            return;
          }
        } catch {
          // A missed check is fine; the next one will catch up.
        }
      }
      if (disposed || generation !== pollGeneration) return;
      run = { state: 'error', text: 'This is taking longer than it should. Try again in a minute.' };
      paintAnn();
    })();
  }

  async function addProposals(all: SuggestProposal[]): Promise<void> {
    const chosen = all.filter((_p, i) => picked.has(i));
    if (!chosen.length) return;
    const bySection = new Map<string, Array<{ cells: string[]; lesson_id: string; piece_id?: string }>>();
    const created = new Map<string, string>();
    let skipped = 0;
    for (const p of chosen) {
      let target = p.section_id;
      if (target && !sections().some((s) => s.id === target)) target = undefined;
      if (!target && p.new_section) {
        const key = `${p.new_section.kind}|${p.new_section.name.toLowerCase()}`;
        target = created.get(key);
        if (!target) {
          const prior = new Set(sections().map((s) => s.id));
          const next = await change({
            op: 'add_section',
            name: p.new_section.name,
            kind: p.new_section.kind,
            ...(p.new_section.kind === 'table' && p.new_section.columns ? { columns: p.new_section.columns } : {})
          });
          target = next?.organiser.sections.find((s) => !prior.has(s.id))?.id;
          if (!target) {
            skipped += 1;
            continue;
          }
          created.set(key, target);
        }
      }
      const section = sections().find((s) => s.id === target);
      if (!target || !section) {
        skipped += 1;
        continue;
      }
      const list = bySection.get(target) ?? [];
      list.push({ cells: fitCells(p.cells, section), lesson_id: lesson.id, ...(p.piece_id ? { piece_id: p.piece_id } : {}) });
      bySection.set(target, list);
    }
    let added = 0;
    for (const [sid, lines] of bySection) {
      const next = await change({ op: 'add_lines', section_id: sid, lines });
      if (next) added += lines.length;
      else skipped += lines.length;
    }
    run = { state: 'idle' };
    message = added
      ? `Added ${plural(added, 'line')}${skipped ? `, ${skipped} could not be added` : ''}. Edit them on the unit page.`
      : 'None of those lines could be added.';
    messageBad = !added;
    paintAll();
  }

  function paintAll(): void {
    if (disposed) return;
    paintHead();
    paintMain();
    paintAnn();
  }

  function load(): void {
    loadFailed = false;
    paintAll();
    void organiserApi
      .get(lesson.unit_id)
      .then((next) => {
        if (disposed) return;
        data = next;
        paintAll();
      })
      .catch(() => {
        if (disposed) return;
        loadFailed = true;
        paintAll();
      });
  }

  head.addEventListener('click', () => {
    isOpen = !isOpen;
    paintHead();
    if (isOpen && estimate.state === 'idle') loadEstimate();
  });

  paintAll();
  load();

  return {
    element: root,
    dispose() {
      disposed = true;
      pollGeneration += 1;
      root.remove();
    }
  };
}
