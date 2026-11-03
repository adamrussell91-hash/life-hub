import './organiser.css';
import { ApiClientError } from '@/api/client';
import { getCurriculum } from '@/app/curriculum-state';
import { navigate } from '@/app/router';
import { costText } from '@/blocks/next-step-run';
import { lineColour } from '@/network/colour';
import { unitNetworkContext } from '@/teacher/network-context';
import { lessonsByDate } from '@/teacher/unit-lesson-order';
import { organiserApi } from './api';
import { conceptColourAt, createSerialQueue, isIdeas, lessonCodes, lineWords, makesCard } from './editor-model';
import type { OrganiserLine, OrganiserSection, SuggestProposal, TeacherOrganiser } from './types';
import { renderWeekRow } from './week-row';

/**
 * Organiser card on the lesson page: the unit's whole sheet as ticks. A ticked line reaches students
 * when this lesson is published and its class date arrives, and joins practice the day after. A line
 * another lesson ticked is shown greyed. Ann runs as a job (never the chat) and only suggests; the
 * teacher presses the button.
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
  const moreBox = h('div', 'ko-add');
  body.append(mainBox, annBox, moreBox);
  root.append(head, body);
  host.append(root);

  let disposed = false;
  let isOpen = false;
  let data: TeacherOrganiser | null = null;
  let loadFailed = false;
  let message = '';
  let messageBad = false;
  let codes = new Map<string, string>();
  let titles = new Map<string, string>();
  let colourOfKey = new Map<string, string>();
  const queue = createSerialQueue();

  type Estimate = { state: 'idle' | 'loading' | 'ready' | 'error'; cost_aud?: number };
  let estimate: Estimate = { state: 'idle' };
  type Run = { state: 'idle' | 'running' | 'done' | 'error'; text?: string; proposals?: SuggestProposal[] };
  let run: Run = { state: 'idle' };
  let pollGeneration = 0;

  const sections = (): OrganiserSection[] => (data?.organiser.sections ?? []).filter((s) => !s.off);
  const allLines = (): Array<{ section: OrganiserSection; line: OrganiserLine }> => sections().flatMap((section) => section.lines.map((line) => ({ section, line })));
  const mine = (): OrganiserLine[] => allLines().map((x) => x.line).filter((line) => line.lesson_id === lesson.id);
  const claimedElsewhere = (line: OrganiserLine): boolean => !!line.lesson_id && line.lesson_id !== lesson.id && data?.status[line.id] !== 'lesson_gone';

  function paintHead(): void {
    root.classList.toggle('ko-card--open', isOpen);
    head.setAttribute('aria-expanded', String(isOpen));
    body.hidden = !isOpen;
    toggle.textContent = isOpen ? 'Hide' : 'Show';
    if (loadFailed) summary.textContent = 'Could not load';
    else if (!data) summary.textContent = 'Loading…';
    else {
      const n = mine().length;
      summary.textContent = n ? `${plural(n, 'line')} from this lesson` : 'No lines from this lesson yet';
    }
  }

  function lineTag(line: OrganiserLine): HTMLElement | null {
    if (line.lesson_id && line.lesson_id !== lesson.id) {
      if (!claimedElsewhere(line)) return h('span', 'ko-tag', 'Lesson removed');
      const tag = h('span', 'ko-tag', codes.get(line.lesson_id) ?? 'Another lesson');
      const name = titles.get(line.lesson_id);
      if (name) tag.title = name;
      return tag;
    }
    return line.open ? h('span', 'ko-tag', 'Already out') : null;
  }

  function pickRow(section: OrganiserSection, line: OrganiserLine): HTMLElement {
    const row = h('label', `ko-pick${claimedElsewhere(line) ? ' is-elsewhere' : ''}`);
    const check = h('input');
    check.type = 'checkbox';
    check.checked = !!line.lesson_id && (line.lesson_id === lesson.id || claimedElsewhere(line));
    check.disabled = claimedElsewhere(line);
    check.dataset.line = line.id;
    check.addEventListener('change', () => void tick(line.id, check.checked));
    const words = h('span');
    const { head: name, body: text } = lineWords(section, line);
    if (name) words.append(h('b', undefined, name), ' ');
    words.append(text);
    if (!makesCard(section, line) && section.kind === 'table' && !claimedElsewhere(line)) {
      words.append(h('small', 'ko-pick__warn', section.columns?.find((c) => !c.hide)?.label === 'Prompt' ? 'No prompt yet, so no practice card' : 'Needs both sides to make a practice card'));
    }
    row.append(check, words);
    const tag = lineTag(line);
    row.append(tag ?? h('span'));
    return row;
  }

  function group(name: HTMLElement, section: OrganiserSection): HTMLElement {
    const box = h('div', 'ko-pickgroup');
    box.append(name);
    for (const line of section.lines) box.append(pickRow(section, line));
    return box;
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
    const openUnit = (): void => navigate(`/units/${encodeURIComponent(lesson.unit_id)}`);
    if (!allLines().length) {
      const row = h('div', 'ko-row');
      row.append(h('span', 'ko-label', 'This unit’s sheet is empty. Write it on the unit page first.'), button('Open the unit', 'btn btn--ghost ko-btn', openUnit));
      mainBox.append(row);
      return;
    }
    mainBox.append(h('p', 'ko-status', 'Tick what this lesson teaches. Students see it when the lesson’s class date arrives.'));

    const cols = h('div', 'ko-pickcols');
    const left = h('div');
    const right = h('div');
    let at = 0;
    for (const section of sections()) {
      if (!section.lines.length) {
        if (section.role === 'concept') at += 1;
        continue;
      }
      if (isIdeas(section)) {
        const capsule = h('span', 'ko-capsule', section.name);
        const colour = section.concept_key && colourOfKey.get(section.concept_key);
        capsule.style.setProperty('--c', colour || conceptColourAt(at));
        const name = h('div', 'ko-pickgroup__name');
        name.append(capsule);
        left.append(group(name, section));
        at += 1;
      } else {
        right.append(group(h('div', 'ko-pickgroup__name', section.name), section));
      }
    }
    cols.append(left, right);
    mainBox.append(cols);
  }

  function paintMore(): void {
    moreBox.replaceChildren();
    if (!data || !allLines().length) return;
    moreBox.append(renderWeekRow(data.organiser, (op) => void change(op)));
    const actions = h('div', 'ko-actions');
    actions.append(
      button('Run with the class', 'btn btn--ghost ko-btn', () => navigate(`/units/${encodeURIComponent(lesson.unit_id)}/organiser/run`)),
      button('Edit the whole organiser', 'btn btn--quiet ko-btn', () => navigate(`/units/${encodeURIComponent(lesson.unit_id)}`))
    );
    moreBox.append(actions);
  }

  function change(op: Parameters<typeof organiserApi.change>[1]): Promise<TeacherOrganiser | null> {
    return queue
      .add(() => organiserApi.change(lesson.unit_id, op))
      .then((next) => {
        data = next;
        message = '';
        messageBad = false;
        paintAll();
        return next;
      })
      .catch((error: unknown) => {
        message = say(error, 'That did not save. Try again.');
        messageBad = true;
        paintAll();
        return null;
      });
  }

  function tick(lineId: string, on: boolean): Promise<TeacherOrganiser | null> {
    return change({ op: 'update_line', line_id: lineId, lesson_id: on ? lesson.id : null });
  }

  // ---- Ann ---------------------------------------------------------------------------------

  function annLabel(): string {
    return estimate.state === 'ready' && typeof estimate.cost_aud === 'number'
      ? `Ann, suggest ticks (${costText({ cost_aud: estimate.cost_aud })})`
      : 'Ann, suggest ticks';
  }

  function paintAnn(): void {
    annBox.replaceChildren();
    if (!data || !allLines().length) return;
    const row = h('div', 'ko-actions');
    const ann = button(annLabel(), 'btn btn--ghost ko-btn', startRun);
    ann.disabled = estimate.state !== 'ready' || run.state === 'running';
    row.append(ann);
    if (estimate.state === 'loading') row.append(h('span', 'ko-label', 'Checking what she would cost…'));
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
      fail.append(h('span', 'ko-status ko-status--bad', run.text ?? 'Ann could not suggest ticks.'), button('Try again', 'btn btn--ghost ko-btn', startRun));
      annBox.append(fail);
    }
    if (run.state === 'done') {
      const found = (run.proposals ?? []).flatMap((p) => allLines().filter((x) => x.line.id === p.line_id && !x.line.lesson_id));
      const box = h('div', 'ko-ann');
      if (!found.length) {
        box.append(h('p', 'ko-ann__head', 'Ann found no more lines this lesson teaches.'));
        box.append(button('Close', 'btn btn--ghost ko-btn', () => { run = { state: 'idle' }; paintAnn(); }));
      } else {
        box.append(h('p', 'ko-ann__head', `Ann thinks this lesson teaches ${plural(found.length, 'more line')}:`));
        const list = h('ul');
        for (const { section, line } of found) {
          const { head: name, body: text } = lineWords(section, line);
          list.append(h('li', undefined, name ? `${name}: ${text}` : text));
        }
        box.append(list);
        const actions = h('div', 'ko-actions');
        const add = button('Tick these', 'btn btn--primary ko-btn', () => {
          add.disabled = true;
          run = { state: 'idle' };
          for (const { line } of found) void tick(line.id, true);
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
            run = { state: 'done', proposals: job.proposals ?? [] };
            paintAnn();
            return;
          }
          if (job.status === 'error') {
            run = { state: 'error', text: job.error || 'Ann could not suggest ticks. Try again.' };
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

  function paintAll(): void {
    if (disposed) return;
    paintHead();
    paintMain();
    paintAnn();
    paintMore();
  }

  function load(): void {
    loadFailed = false;
    paintAll();
    void Promise.all([organiserApi.get(lesson.unit_id), getCurriculum().catch(() => null)])
      .then(([next, curriculum]) => {
        if (disposed) return;
        data = next;
        const unit = curriculum?.units.find((u) => u.id === lesson.unit_id);
        if (curriculum && unit) {
          const lessons = curriculum.lessons.filter((l) => l.unit_id === unit.id);
          codes = lessonCodes(lessonsByDate(lessons, curriculum.scheduled_lessons.filter((row) => row.unit_id === unit.id)).map((l) => l.id));
          titles = new Map(lessons.map((l) => [l.id, l.title]));
          colourOfKey = new Map(unitNetworkContext(curriculum, unit).lines.flatMap((l) => (l.alignment?.kind === 'concept' ? [[l.alignment.key, lineColour(l.colour)] as const] : [])));
        }
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
