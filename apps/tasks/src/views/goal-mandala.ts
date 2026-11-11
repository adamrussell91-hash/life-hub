// apps/tasks/src/views/goal-mandala.ts
// Mandala structure: the goal in the centre, eight pillars around it, eight actions per pillar.
// A thinking tool, not a tracker: cells are never ticked. A few actions get promoted to the
// lead measure or to a hosted task; pillars can link to a hosted project so empty ones show.
import type { Goal, GoalMandalaAction, GoalMandalaPillar } from '@/schemas/goal';
import { el } from '@/views/hub-kit';

export const MANDALA_SIZE = 8;

export type MandalaPatch = Partial<Pick<Goal, 'frame' | 'lead_measure'>>;

/** Live page data. Absent in previews and tests: promotion to a task is then hidden. */
export type MandalaContext = {
  projects?: Array<{ id: string; title: string }>;
  tasks?: Array<{ id: string; status: string }>;
  /** Create a task titled `label` on this goal, then save `patchFor(taskId)`. */
  onPromoteTask?: (label: string, patchFor: (taskId: string) => MandalaPatch) => void;
  /** Fill the if-then's action with `label` and ask for the cue. */
  onPromoteIfThen?: (label: string) => void;
  confirm?: (message: string) => boolean;
};

/** Which pillar is open, per goal. Kept outside the render so a save never snaps back (V7). */
const openPillar = new Map<string, number>();

export function resetMandalaView(goalId?: string): void {
  if (goalId) openPillar.delete(goalId);
  else openPillar.clear();
}

/** One tone per pillar slot; no two neighbours share one. Actions inherit their pillar's tone. */
const PILLAR_TONES = ['tone-sage', 'tone-lilac', 'tone-gold', 'tone-blue', 'tone-peach', 'tone-gold', 'tone-sage', 'tone-lilac'];

/** Grid order: cells 0-3, then the centre, then cells 4-7. */
function gridSlots(): Array<number | 'centre'> {
  return [0, 1, 2, 3, 'centre', 4, 5, 6, 7];
}

export function padPillars(goal: Goal): GoalMandalaPillar[] {
  const stored = goal.frame.mandala?.pillars ?? [];
  return Array.from({ length: MANDALA_SIZE }, (_, i) => {
    const p = stored[i];
    const id = p?.id || `p${i + 1}`;
    const actions = Array.from({ length: MANDALA_SIZE }, (_, j): GoalMandalaAction => {
      const a = p?.actions?.[j];
      return { id: a?.id || `${id}a${j + 1}`, label: a?.label ?? '', promoted: a?.promoted ?? null };
    });
    return { id, label: p?.label ?? '', project_id: p?.project_id ?? null, actions };
  });
}

export function mandalaHasContent(goal: Goal): boolean {
  return (goal.frame.mandala?.pillars ?? []).some(
    (p) => p.label.trim() || p.actions.some((a) => a.label.trim())
  );
}

function framePatch(goal: Goal, pillars: GoalMandalaPillar[]): MandalaPatch {
  return { frame: { ...goal.frame, mandala: { pillars } } };
}

function withPillar(pillars: GoalMandalaPillar[], index: number, next: GoalMandalaPillar): GoalMandalaPillar[] {
  return pillars.map((p, i) => (i === index ? next : p));
}

function withAction(pillar: GoalMandalaPillar, index: number, next: GoalMandalaAction): GoalMandalaPillar {
  return { ...pillar, actions: pillar.actions.map((a, j) => (j === index ? next : a)) };
}

/** Whether a stored promotion still holds, judged from live data where we have it. */
export function promotionState(
  goal: Goal,
  action: GoalMandalaAction,
  ctx: MandalaContext
): 'lead' | 'task' | 'task-done' | 'if_then' | null {
  const p = action.promoted;
  const label = action.label.trim();
  // The if-then is never stored on the cell: it holds while the trigger's action is this text.
  const trigger = label && goal.if_then?.action.trim() === label ? 'if_then' : null;
  if (!p) return trigger;
  if (p.kind === 'lead') return goal.lead_measure?.label === action.label ? 'lead' : trigger;
  if (!ctx.tasks) return 'task';
  const task = ctx.tasks.find((t) => t.id === p.task_id);
  if (!task) return trigger;
  return task.status === 'done' ? 'task-done' : 'task';
}

function cellInput(path: string, value: string, label: string, placeholder: string, onCommit: (v: string) => void) {
  const node = el('textarea', 'mandala__input');
  node.value = value;
  node.rows = 2;
  node.placeholder = placeholder;
  node.dataset.field = path;
  node.setAttribute('aria-label', label);
  node.addEventListener('change', () => onCommit(node.value.trim()));
  // Grow to fit the text so a narrow phone cell never shows a scrolled fragment.
  const fit = () => {
    if (!node.isConnected) return;
    node.style.height = 'auto';
    node.style.height = `${node.scrollHeight}px`;
  };
  node.addEventListener('input', fit);
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(fit);
  return node;
}

function chip(text: string, tone = ''): HTMLElement {
  return el('span', `mandala__chip ${tone}`.trim(), text);
}

function overview(goal: Goal, pillars: GoalMandalaPillar[], onPatch: (p: MandalaPatch) => void, ctx: MandalaContext, rerender: () => void) {
  const wrap = el('div', 'mandala');
  const projectTitle = new Map((ctx.projects ?? []).map((p) => [p.id, p.title]));
  const named = pillars.filter((p) => p.label.trim());
  const covered = named.filter((p) => p.project_id && projectTitle.has(p.project_id));
  const summary = el(
    'p',
    'meta mandala__summary',
    named.length
      ? `${named.length} of ${MANDALA_SIZE} pillars named${ctx.projects ? ` · ${covered.length} with a project behind ${covered.length === 1 ? 'it' : 'them'}` : ''}`
      : 'Name up to eight things this goal depends on. Then open each one and list what you could do.'
  );
  const grid = el('div', 'mandala__grid');
  grid.setAttribute('role', 'group');
  grid.setAttribute('aria-label', 'Goal and its pillars');
  for (const slot of gridSlots()) {
    if (slot === 'centre') {
      const centre = el('div', 'mandala__cell mandala__cell--centre');
      centre.append(el('span', 'mandala__kicker', 'Goal'), el('span', 'mandala__centre-text', goal.title));
      grid.append(centre);
      continue;
    }
    const pillar = pillars[slot]!;
    const named = Boolean(pillar.label.trim());
    const cell = el('div', `mandala__cell mandala__cell--pillar ${named ? PILLAR_TONES[slot] : 'is-empty'}`);
    cell.dataset.pillar = String(slot);
    cell.append(
      cellInput(`mandala.p.${slot}`, pillar.label, `Pillar ${slot + 1}`, 'Name a pillar', (v) =>
        onPatch(framePatch(goal, withPillar(pillars, slot, { ...pillar, label: v })))
      )
    );
    if (named) {
      const linked = pillar.project_id ? projectTitle.get(pillar.project_id) : undefined;
      if (linked) cell.append(chip(linked, 'mandala__chip--project'));
      else if (ctx.projects) cell.append(chip('No project yet', 'mandala__chip--empty'));
    }
    const foot = el('div', 'mandala__foot');
    const filled = pillar.actions.filter((a) => a.label.trim()).length;
    const dots = el('span', 'mandala__dots');
    dots.setAttribute('aria-hidden', 'true');
    for (let j = 0; j < MANDALA_SIZE; j++) dots.append(el('span', `mandala__dot${j < filled ? ' is-on' : ''}`));
    const open = el('button', 'mandala__open');
    open.type = 'button';
    open.dataset.action = 'open-pillar';
    open.disabled = !named;
    open.append(el('span', 'mandala__count', `${filled}/${MANDALA_SIZE}`), el('span', 'mandala__arrow', '→'));
    open.title = named ? `Open ${pillar.label}` : 'Name the pillar first';
    open.setAttribute('aria-label', named ? `Open ${pillar.label}: ${filled} of ${MANDALA_SIZE} actions` : `Pillar ${slot + 1}: name it first`);
    open.addEventListener('click', () => {
      openPillar.set(goal.id, slot);
      rerender();
    });
    if (named) foot.append(dots, open);
    cell.append(foot);
    grid.append(cell);
  }
  wrap.append(summary, grid);
  return wrap;
}

function promoteControl(
  goal: Goal,
  pillars: GoalMandalaPillar[],
  index: number,
  j: number,
  onPatch: (p: MandalaPatch) => void,
  ctx: MandalaContext
): HTMLElement {
  const pillar = pillars[index]!;
  const action = pillar.actions[j]!;
  const select = el('select', 'mandala__promote');
  select.dataset.action = 'promote';
  select.setAttribute('aria-label', `Use "${action.label}" as`);
  const options: Array<[string, string]> = [['', 'Use as… ▾'], ['lead', 'Lead measure']];
  if (ctx.onPromoteTask) options.push(['task', 'Task on this goal']);
  if (ctx.onPromoteIfThen) options.push(['if_then', 'If-then trigger']);
  for (const [value, label] of options) {
    const opt = el('option', '', label);
    opt.value = value;
    select.append(opt);
  }
  select.addEventListener('change', () => {
    const kind = select.value;
    select.value = '';
    if (kind === 'lead') {
      const existing = goal.lead_measure?.label;
      const ask = ctx.confirm ?? ((m: string) => window.confirm(m));
      if (existing && existing !== action.label && !ask(`Replace the lead measure "${existing}"?`)) return;
      // Only one cell can be the lead measure.
      const cleared = pillars.map((p) => ({
        ...p,
        actions: p.actions.map((a) => (a.promoted?.kind === 'lead' ? { ...a, promoted: null } : a))
      }));
      const marked = withPillar(cleared, index, withAction(cleared[index]!, j, { ...action, promoted: { kind: 'lead', task_id: null } }));
      onPatch({ ...framePatch(goal, marked), lead_measure: { label: action.label, per_week: goal.lead_measure?.per_week ?? 1 } });
    } else if (kind === 'if_then' && ctx.onPromoteIfThen) {
      ctx.onPromoteIfThen(action.label);
    } else if (kind === 'task' && ctx.onPromoteTask) {
      ctx.onPromoteTask(action.label, (taskId) =>
        framePatch(goal, withPillar(pillars, index, withAction(pillar, j, { ...action, promoted: { kind: 'task', task_id: taskId } })))
      );
    }
  });
  return select;
}

function pillarView(goal: Goal, pillars: GoalMandalaPillar[], index: number, onPatch: (p: MandalaPatch) => void, ctx: MandalaContext, rerender: () => void) {
  const pillar = pillars[index]!;
  const wrap = el('div', 'mandala mandala--pillar');
  const bar = el('div', 'mandala__bar');
  const back = el('button', 'mandala__back', '← All pillars');
  back.type = 'button';
  back.dataset.action = 'close-pillar';
  back.addEventListener('click', () => {
    openPillar.delete(goal.id);
    rerender();
  });
  bar.append(back);
  if (ctx.projects?.length) {
    const select = el('select', 'mandala__project');
    select.dataset.action = 'pillar-project';
    select.setAttribute('aria-label', `Project behind ${pillar.label}`);
    const none = el('option', '', 'No project');
    none.value = '';
    select.append(none);
    for (const p of ctx.projects) {
      const opt = el('option', '', p.title);
      opt.value = p.id;
      select.append(opt);
    }
    select.value = pillar.project_id && ctx.projects.some((p) => p.id === pillar.project_id) ? pillar.project_id : '';
    select.addEventListener('change', () =>
      onPatch(framePatch(goal, withPillar(pillars, index, { ...pillar, project_id: select.value || null })))
    );
    bar.append(select);
  }
  const grid = el('div', 'mandala__grid');
  grid.setAttribute('role', 'group');
  grid.setAttribute('aria-label', `${pillar.label} and its actions`);
  for (const slot of gridSlots()) {
    if (slot === 'centre') {
      const centre = el('div', `mandala__cell mandala__cell--hub ${PILLAR_TONES[index]}`);
      centre.append(el('span', 'mandala__kicker', goal.title), el('span', 'mandala__centre-text', pillar.label));
      grid.append(centre);
      continue;
    }
    const action = pillar.actions[slot]!;
    const cell = el('div', `mandala__cell mandala__cell--action${action.label.trim() ? '' : ' is-empty'}`);
    cell.dataset.action = String(slot);
    cell.append(
      cellInput(`mandala.a.${slot}`, action.label, `Action ${slot + 1}`, 'Add an action', (v) =>
        // Editing the text clears a promotion: the cell no longer says what it became.
        onPatch(framePatch(goal, withPillar(pillars, index, withAction(pillar, slot, { ...action, label: v, promoted: v === action.label ? action.promoted : null }))))
      )
    );
    if (action.label.trim()) {
      const foot = el('div', 'mandala__foot');
      const state = promotionState(goal, action, ctx);
      if (state === 'lead') foot.append(chip('Lead measure', 'mandala__chip--lead'));
      else if (state === 'task') foot.append(chip('Task', 'mandala__chip--task'));
      else if (state === 'task-done') foot.append(chip('Task · done', 'mandala__chip--task'));
      else if (state === 'if_then') foot.append(chip('If-then', 'mandala__chip--ifthen'));
      else foot.append(promoteControl(goal, pillars, index, slot, onPatch, ctx));
      cell.append(foot);
    }
    grid.append(cell);
  }
  wrap.append(bar, grid);
  return wrap;
}

/** The Mandala structure card body. */
export function renderMandala(goal: Goal, onPatch: (p: MandalaPatch) => void, ctx: MandalaContext = {}): HTMLElement {
  const host = el('div', 'mandala-host');
  const paint = () => {
    const pillars = padPillars(goal);
    let index = openPillar.get(goal.id);
    if (index !== undefined && !pillars[index]?.label.trim()) {
      openPillar.delete(goal.id);
      index = undefined;
    }
    host.replaceChildren(
      index === undefined ? overview(goal, pillars, onPatch, ctx, paint) : pillarView(goal, pillars, index, onPatch, ctx, paint)
    );
  };
  paint();
  return host;
}
