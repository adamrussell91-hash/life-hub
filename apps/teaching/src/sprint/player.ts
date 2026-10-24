import type { PublishedLesson } from '@/schemas/published-lesson';
import type { Block } from '@/schemas/block';
import { renderBlock } from '@/blocks/render';
import { el } from '@/quiz/dom';
import { formatDueDay, formatDueTime } from '@/blocks/classroom-tools/logic';
import { phaseDue } from './rules';
import { phaseIntention, phaseMove, toolFrames } from './defaults';
import { sprintParts } from './model';
import { PHASE_LABELS, type PublicSprint, type SprintPhaseKey } from './schema';
import { valueCheckFor, type FormContext, type PhaseForm } from './form-kit';
import type { SprintClient, SprintStatus } from './api';
import './sprint.css';

export type SprintPlayerOptions = {
  lesson: PublishedLesson;
  classId?: string;
  client: SprintClient | null;
  renderHero: (host: HTMLElement) => void;
};

/** Each phase's form; Tasks 12–14 register theirs. */
export const PHASE_FORMS: Partial<Record<SprintPhaseKey, (ctx: FormContext) => PhaseForm>> = {};
/** A form is rebuilt only when this changes, so polling never wipes what a student is typing. */
export const FORM_SIGNATURES: Partial<Record<SprintPhaseKey, (s: SprintStatus) => string>> = {};
/** Set by forms.ts: the feedback card for a running round. */
export const CARDS: { feedback?: (ctx: FormContext, round: NonNullable<SprintStatus['round']>) => HTMLElement } = {};

const POLL_MS = 8000;

/** "2 days left · Tue 28 Oct, 3:00 pm", or hours and minutes on the day. */
export function dueText(due_date: string, due_time: string, now: number): string {
  const due = phaseDue({ due_date, due_time });
  if (due === null) return '';
  const when = `${formatDueDay(due_date)}, ${formatDueTime(due_time || '23:59')}`;
  const left = due - now;
  if (left <= 0) return `Closed · ${when}`;
  const days = Math.floor(left / 86_400_000);
  if (days >= 1) return `${days} ${days === 1 ? 'day' : 'days'} left · ${when}`;
  const mins = Math.ceil(left / 60_000);
  return `${Math.floor(mins / 60)} h ${mins % 60} min left · ${when}`;
}

export function mountSprintPlayer(host: HTMLElement, options: SprintPlayerOptions): { dispose(): void } {
  const { lesson, client } = options;
  const sprint = lesson.sprint as PublicSprint;
  const blocks = lesson.blocks as Block[];
  const parts = sprintParts(blocks);
  let status: SprintStatus | null = null;
  let chosen: SprintPhaseKey | null = null;
  let form: PhaseForm | null = null;
  let formKey = '';
  let poll = 0;
  let disposed = false;
  const opened = new Set<SprintPhaseKey>();

  const shell = el('div', 'sprint');
  const hero = el('div', 'sprint__hero');
  options.renderHero(hero);
  const spot = el('div', 'sprint-spotlight');
  const top = el('div', 'sprint__top');
  const body = el('div', 'sprint__body');
  shell.append(hero, spot, top, body);
  const cardHost = el('div', 'sprint__card');
  shell.append(cardHost);
  let cardKey = '';
  host.replaceChildren(shell);

  const current = (s: SprintStatus): SprintPhaseKey => {
    const open = (s.phases ?? []).filter((p) => p.open).map((p) => p.key);
    if (chosen && open.includes(chosen)) return chosen;
    return open.at(-1) ?? 'understand';
  };

  function claimForm(): HTMLElement {
    const f = el('form', 'sprint-claim');
    const input = el('input', 'qz-input');
    input.maxLength = 5;
    input.autocomplete = 'off';
    input.setAttribute('aria-label', 'Your initials');
    const go = el('button', 'btn btn--primary', 'That’s me');
    go.type = 'submit';
    const err = el('p', 'sprint-claim__err');
    err.setAttribute('role', 'alert');
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!client) return;
      try {
        const next = await client.claim(input.value.trim());
        if (next.identity.need === 'initials') err.textContent = 'Those initials aren’t on your class list. Check them and try again.';
        else apply(next);
      } catch (error) {
        err.textContent = error instanceof Error ? error.message : 'That didn’t work. Try again.';
      }
    });
    f.append(el('p', '', 'Type your initials to join your group.'), input, go, err);
    return f;
  }

  function paintTop(s: SprintStatus, key: SprintPhaseKey): void {
    top.replaceChildren();
    const row = s.phases?.find((p) => p.key === key);
    const test = s.phases?.find((p) => p.key === 'test');
    const cd = el('div', 'sprint-countdown');
    const left = el('div');
    left.append(el('div', 'sprint-countdown__title', `${PHASE_LABELS[key]} closes`), el('div', 'sprint-countdown__sub', test ? `Pitch day: ${formatDueDay(test.due_date)}` : ''));
    cd.append(left, el('div', 'sprint-countdown__fig', row ? dueText(row.due_date, row.due_time, Date.now()) : ''));
    const group = el('div', 'sprint-group', `Group ${s.group?.name ?? ''} · ${(s.group?.mates ?? []).join(' · ')} · ${row?.count_in ?? 0} of ${s.group?.size ?? 0} in`);
    const intent = el('p', 'sprint-intent', phaseIntention(phaseMove(blocks, key)));
    const steps = el('nav', 'sprint-steps');
    steps.setAttribute('aria-label', 'Sprint phases');
    for (const p of s.phases ?? []) {
      const b = el('button', `sprint-step${p.key === key ? ' sprint-step--now' : p.state === 'in' ? ' sprint-step--done' : !p.open ? ' sprint-step--later' : ''}`);
      b.type = 'button';
      b.disabled = !p.open;
      const where = sprint.phases.find((x) => x.key === p.key)?.where === 'class' ? 'Class' : 'Home';
      b.append(el('b', '', PHASE_LABELS[p.key]), el('span', '', `${where}${p.state === 'in' ? ' · in' : p.key === key ? ' · now' : ''}`));
      b.addEventListener('click', () => { chosen = p.key; paint(); });
      steps.append(b);
    }
    const brief = el('details', 'sprint-brief');
    brief.append(el('summary', '', 'The challenge'));
    for (const b of parts.brief) brief.append(renderBlock(b, 'student', { lessonId: lesson.lesson_id, pageBlocks: blocks }));
    top.append(cd, group, steps, intent, brief);
  }

  function guidesPanel(key: SprintPhaseKey): HTMLElement {
    const panel = el('details', 'sprint-guides');
    panel.open = typeof window.matchMedia !== 'function' || !window.matchMedia('(max-width: 900px)').matches;
    panel.append(el('summary', '', 'Guides'));
    const sec = parts.phases.get(key);
    for (const b of (sec?.content.blocks as Block[] | undefined) ?? []) panel.append(renderBlock(b, 'student', { lessonId: lesson.lesson_id, pageBlocks: blocks }));
    if (key === 'sketch' || key === 'decide') {
      const g = sprint.idea_guide;
      const check = el('div', 'sprint-guide');
      check.append(el('div', 'sprint-guide__kind', 'Good idea checklist'));
      const ul = el('ul');
      for (const line of g.checklist) ul.append(el('li', '', line));
      check.append(ul);
      const model = el('div', 'sprint-guide');
      model.append(el('div', 'sprint-guide__kind', `Model idea · ${g.model.topic}`), el('p', '', g.model.text));
      for (const n of g.model.notes) model.append(el('p', 'sprint-guide__note', n));
      if (g.pair) model.append(el('p', '', `Developing: ${g.pair.developing}`), el('p', '', `Strong: ${g.pair.strong}`), el('p', 'sprint-guide__note', g.pair.note));
      panel.append(check, model);
    }
    const reqs = sprint.requirements.filter((r) => r.phases.includes(key));
    if (reqs.length) {
      const box = el('div', 'sprint-guide');
      box.append(el('div', 'sprint-guide__kind', 'Requirements'));
      const ul = el('ul');
      for (const r of reqs) ul.append(el('li', '', r.text));
      box.append(ul);
      panel.append(box);
    }
    const stretch = sprint.phases.find((p) => p.key === key)?.stretch;
    if (stretch) {
      const box = el('div', 'sprint-guide');
      box.append(el('div', 'sprint-guide__kind', 'Stretch'), el('p', '', stretch));
      panel.append(box);
    }
    return panel;
  }

  function lockScreen(s: SprintStatus): HTMLElement {
    const box = el('section', 'sprint-lock');
    const until = new Date(s.lock!.until);
    box.append(el('div', 'sprint-lock__icon', '✓'), el('h2', '', 'Your class work is in'), el('p', '', `The sprint opens again at ${until.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })}.`));
    const clock = el('div', 'sprint-lock__clock');
    const tick = () => {
      const ms = Math.max(0, until.getTime() - Date.now());
      const h = Math.floor(ms / 3_600_000);
      const m = Math.floor((ms % 3_600_000) / 60_000);
      const sec = Math.floor((ms % 60_000) / 1000);
      clock.textContent = `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
    };
    tick();
    box.append(clock);
    return box;
  }

  function paint(): void {
    if (disposed || !status) return;
    const s = status;
    spot.replaceChildren();
    spot.hidden = !s.spotlight;
    if (s.spotlight) spot.append(el('strong', '', s.spotlight.label), el('p', '', s.spotlight.text));
    if (s.identity.need === 'initials') { top.replaceChildren(); body.replaceChildren(claimForm()); return; }
    if (s.anonymous || !s.group) {
      top.replaceChildren();
      body.replaceChildren(el('p', 'sprint-note', s.not_for_you ? 'This sprint is set for other groups. Ask your teacher which group you’re in.' : 'Your teacher hasn’t added a class list yet.'));
      return;
    }
    const key = current(s);
    paintTop(s, key);
    const r = s.round;
    const roundKey = r && !s.lock ? `${r.group_id}:${r.sent ? 1 : 0}` : '';
    if (roundKey !== cardKey) {
      cardKey = roundKey;
      cardHost.replaceChildren();
      if (r && !s.lock && CARDS.feedback) {
        const row = s.phases!.find((p) => p.key === 'test')!;
        cardHost.append(CARDS.feedback({ status: s, sprint, blocks, row, editable: true, client: client!, frames: [], valueCheck: null, support: sprint.support, onStatus: (next) => apply(next) }, r));
      }
    }
    if (s.lock) {
      form?.dispose();
      form = null;
      formKey = '';
      body.replaceChildren(lockScreen(s));
      return;
    }
    if (!opened.has(key) && client) {
      opened.add(key);
      void client.open(key).catch(() => {});
    }
    const sig = `${key}|${FORM_SIGNATURES[key]?.(s) ?? ''}`;
    if (sig === formKey && form) return;
    form?.dispose();
    formKey = sig;
    const row = s.phases!.find((p) => p.key === key)!;
    const move = phaseMove(blocks, key);
    const ctx: FormContext = {
      status: s, sprint, blocks, row,
      editable: !row.frozen && !(row.state === 'in' && row.closed),
      client: client!,
      frames: toolFrames(move),
      valueCheck: valueCheckFor(move?.value),
      support: sprint.support,
      onStatus: (next) => apply(next)
    };
    const make = PHASE_FORMS[key];
    form = make ? make(ctx) : { el: el('p', 'sprint-note', 'This phase opens soon.'), dispose() {} };
    const layout = el('div', 'sprint-layout');
    const work = el('section', 'sprint-form');
    work.append(form.el);
    layout.append(work, guidesPanel(key));
    body.replaceChildren(layout);
  }

  function apply(next: SprintStatus): void {
    status = next;
    paint();
  }

  async function refresh(): Promise<void> {
    if (!client || disposed) return;
    try {
      apply(await client.status());
    } catch {
      /* The next poll tries again. */
    }
  }

  if (!client) body.replaceChildren(el('p', 'sprint-note', 'Open this sprint from your class page.'));
  else {
    void refresh();
    poll = window.setInterval(() => { if (document.visibilityState !== 'hidden') void refresh(); }, POLL_MS);
  }

  return {
    dispose() {
      disposed = true;
      window.clearInterval(poll);
      form?.dispose();
    }
  };
}
