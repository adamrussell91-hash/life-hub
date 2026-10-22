import { mountToolbox } from '@/blocks/classroom-tools/toolbox';
import { visitBlocks } from '@/blocks/walk-blocks';
import type { Block, TimerSegment } from '@/schemas/block';
import { mountCheckpoint, type CheckpointHandle } from './checkpoint';
import { openLessonMap } from './lesson-map';
import type { QuizLiveHandle } from './quiz-live';
import type { FocusStep } from './steps';
import './focus-view.css';

/**
 * Focus mode for the Display view: the lesson one step at a time, each step
 * scaled up to fill the board. The blocks are rendered once by the Display
 * view and only shown or hidden here, so live controls (join codes, reveal,
 * timers) keep running as the teacher moves through the steps.
 *
 * Keys: right, down, space and Page Down go on; left, up and Page Up go back;
 * Home and End jump; M opens the lesson map. A presenter clicker sends these.
 */

/** A rendered step. A quiz lesson's live round rides on its quiz step. */
export type FocusStepView = FocusStep & { el: HTMLElement; live?: QuizLiveHandle };

export type FocusMode = 'page' | 'focus';

export interface FocusControllerOptions {
  surface: HTMLElement;
  /** Where the Page / Focus toggle and the Lesson map button go. */
  actions: HTMLElement;
  stage: HTMLElement;
  lessonId: string;
}

export interface FocusController {
  /** Hand over freshly rendered steps (first load and every Refresh), with the lesson's blocks for the tools. */
  setSteps(steps: FocusStepView[], pageBlocks: Block[]): void;
  /** A live quiz round changed: re-check the checkpoint cue. */
  refreshCheckpoint(): void;
  dispose(): void;
}

const MODE_KEY = 'teaching-hub.display.mode';
/** Steps never shrink below their page size, and stop growing at this. */
const MAX_ZOOM = 2.4;

function readMode(): FocusMode {
  try {
    return localStorage.getItem(MODE_KEY) === 'focus' ? 'focus' : 'page';
  } catch {
    return 'page';
  }
}

function saveMode(mode: FocusMode): void {
  try {
    localStorage.setItem(MODE_KEY, mode);
  } catch {
    // Private windows: the toggle still works, it just isn't remembered.
  }
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(label: string, className: string, onClick: () => void): HTMLButtonElement {
  const btn = el('button', className, label);
  btn.type = 'button';
  btn.addEventListener('click', onClick);
  return btn;
}

/** Typing, choosing or pressing a focused control keeps its own keys. */
function ownsKeys(target: EventTarget | null, key: string): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable || target.closest('input, textarea, select, [contenteditable="true"]')) return true;
  return (key === ' ' || key === 'Enter') && !!target.closest('button, a, [role="button"], [role="radio"]');
}

/** A saved timer stack that belongs to this step: a divider inside it, or the one just before it. */
export function stepTimerStack(steps: readonly FocusStep[], index: number): TimerSegment[] {
  const find = (blocks: Block[]): TimerSegment[] => {
    let found: TimerSegment[] = [];
    visitBlocks(blocks, (block) => {
      if (!found.length && block.block_type === 'divider' && block.content?.tools !== false && block.content?.timer_stack?.length) {
        found = block.content.timer_stack;
      }
      if (!found.length && block.block_type === 'classroom_tools' && block.content.timer_stack?.length) {
        found = block.content.timer_stack;
      }
    });
    return found;
  };
  const own = steps[index] ? find(steps[index]!.blocks) : [];
  if (own.length) return own;
  const before = steps[index - 1]?.blocks.at(-1);
  return before?.block_type === 'divider' && before.content?.tools !== false ? before.content?.timer_stack ?? [] : [];
}

export function mountFocusController(options: FocusControllerOptions): FocusController {
  const { surface, actions, stage, lessonId } = options;
  let pageBlocks: Block[] = [];
  let mode: FocusMode = readMode();
  let steps: FocusStepView[] = [];
  let index = 0;
  let fitFrame = 0;
  let closeMap: (() => void) | null = null;

  // ── Chrome: Page / Focus toggle and the lesson map ────────────────
  const toggle = el('div', 'fv-mode');
  toggle.setAttribute('role', 'group');
  toggle.setAttribute('aria-label', 'Display layout');
  const pageBtn = button('Page', 'fv-mode__btn', () => setMode('page'));
  const focusBtn = button('Focus', 'fv-mode__btn', () => setMode('focus'));
  toggle.append(pageBtn, focusBtn);
  const mapBtn = button('Lesson map', 'btn btn--ghost lesson-display__action fv-map-btn', () => toggleMap());
  actions.prepend(toggle, mapBtn);

  // ── Bottom strip: tools, previous, step pills, next, count ────────
  const strip = el('nav', 'fv-strip');
  strip.setAttribute('aria-label', 'Lesson steps');
  const dock = el('div', 'fv-dock');
  const prev = button('‹', 'fv-strip__nav', () => goBack());
  prev.setAttribute('aria-label', 'Previous step');
  const next = button('›', 'fv-strip__nav', () => goNext());
  next.setAttribute('aria-label', 'Next step');
  // Picking a tool folds the tray out of the way; the gear unfolds it again. Closing the
  // toolbox's own tray would also close the tool, so the fold is ours. (The toolbox stops
  // click bubbling, hence capture.)
  dock.addEventListener(
    'click',
    (event) => {
      if (!(event.target instanceof Element)) return;
      if (event.target.closest('.ct-chip')) {
        dock.classList.add('is-folded');
      } else if (event.target.closest('.ct-trigger') && dock.classList.contains('is-folded')) {
        event.stopPropagation();
        dock.classList.remove('is-folded');
      }
    },
    true
  );
  const pills = el('div', 'fv-strip__steps');
  const count = el('span', 'fv-strip__count');
  count.setAttribute('aria-live', 'polite');
  strip.append(dock, prev, pills, next, count);
  surface.append(strip);

  const checkpoint: CheckpointHandle = mountCheckpoint({ surface, stage, onMoveOn: () => go(index + 1) });

  // ── Tools dock ────────────────────────────────────────────────────
  let stopDock: (() => void) | null = null;
  let dockStack = '';
  function mountDock(): void {
    // A running tool keeps running from step to step.
    if (stopDock && dock.classList.contains('is-open')) return;
    const stack = stepTimerStack(steps, index);
    const sig = JSON.stringify(stack);
    dock.classList.toggle('has-saved-timer', stack.length > 0);
    if (stopDock && sig === dockStack) return;
    const trayOut = dock.classList.contains('is-tray-out');
    stopDock?.();
    dock.replaceChildren();
    dock.className = 'fv-dock';
    dock.classList.toggle('has-saved-timer', stack.length > 0);
    dockStack = sig;
    stopDock = mountToolbox(dock, { kind: 'divider', viewer: 'teacher', timerStack: stack, lessonId, pageBlocks });
    if (trayOut) dock.querySelector<HTMLButtonElement>('.ct-trigger')?.click();
  }

  // ── Steps ─────────────────────────────────────────────────────────
  function paintStrip(): void {
    pills.replaceChildren(
      ...steps.map((step, k) => {
        const pill = button(step.label, 'fv-strip__step', () => go(k));
        if (k === index) pill.setAttribute('aria-current', 'step');
        return pill;
      })
    );
    pills.querySelector('[aria-current]')?.scrollIntoView({ block: 'nearest', inline: 'center' });
    count.textContent = steps.length ? `${index + 1} / ${steps.length}` : '';
    prev.disabled = index <= 0;
    next.disabled = index >= steps.length - 1;
  }

  function show(): void {
    steps.forEach((step, k) => {
      const current = mode === 'page' || k === index;
      step.el.classList.toggle('is-current', k === index);
      step.el.hidden = !current;
      step.el.setAttribute('aria-hidden', String(!current));
    });
    steps.forEach((step, k) => step.live?.activate(mode === 'focus' && k === index));
    if (mode === 'focus') {
      paintStrip();
      mountDock();
      const live = steps[index]?.live;
      checkpoint.watch(steps[index]?.el ?? null, live ? () => live.subject() : undefined);
      stage.scrollTop = 0;
      scheduleFit();
    }
  }

  function go(k: number): void {
    if (!steps.length) return;
    const target = Math.max(0, Math.min(steps.length - 1, k));
    checkpoint.close();
    if (target === index && mode === 'focus') return;
    index = target;
    show();
  }

  /** Forward, unless a question on this step came in under the mark, or a live quiz round has more to show. */
  function goNext(): void {
    if (checkpoint.isOpen()) return;
    if (checkpoint.shouldStop()) {
      checkpoint.open();
      return;
    }
    if (steps[index]?.live?.forward()) return;
    go(index + 1);
  }

  function goBack(): void {
    checkpoint.close();
    if (steps[index]?.live?.back()) return;
    go(index - 1);
  }

  /** Scale the current step to fill the stage, never below its page size. */
  function fit(): void {
    const step = steps[index]?.el;
    if (mode !== 'focus' || !step) return;
    step.style.zoom = '1';
    const room = stage.getBoundingClientRect();
    const box = step.getBoundingClientRect();
    if (!box.width || !box.height) return;
    const zoom = Math.max(1, Math.min(MAX_ZOOM, (room.width * 0.94) / box.width, (room.height * 0.9) / box.height));
    step.style.zoom = zoom.toFixed(3);
  }
  function scheduleFit(): void {
    cancelAnimationFrame(fitFrame);
    fitFrame = requestAnimationFrame(fit);
  }
  // Blocks grow and shrink as they go live (answers come in, a tool opens).
  const resize = new ResizeObserver(() => scheduleFit());
  resize.observe(stage);

  function setMode(next: FocusMode): void {
    mode = next;
    saveMode(mode);
    surface.classList.toggle('is-focus', mode === 'focus');
    pageBtn.setAttribute('aria-pressed', String(mode === 'page'));
    focusBtn.setAttribute('aria-pressed', String(mode === 'focus'));
    mapBtn.hidden = mode !== 'focus';
    strip.hidden = mode !== 'focus';
    if (mode === 'page') {
      closeMap?.();
      checkpoint.close();
      // The dock lives in the focus strip: a tool left running out of sight would still ring.
      stopDock?.();
      stopDock = null;
      dock.replaceChildren();
      dockStack = '';
      steps.forEach((step) => (step.el.style.zoom = ''));
    }
    show();
  }

  // ── Lesson map ────────────────────────────────────────────────────
  function toggleMap(): void {
    if (closeMap) {
      closeMap();
      return;
    }
    if (mode !== 'focus' || !steps.length) return;
    checkpoint.close();
    closeMap = openLessonMap({
      surface,
      steps,
      index,
      onPick: (k, finish) => {
        finish(() => {
          index = k;
          show();
          fit();
          return steps[k]!.el;
        });
      },
      onClose: () => {
        closeMap = null;
        mapBtn.setAttribute('aria-pressed', 'false');
      }
    });
    mapBtn.setAttribute('aria-pressed', 'true');
  }

  // ── Keys ──────────────────────────────────────────────────────────
  function onKey(event: KeyboardEvent): void {
    if (mode !== 'focus' || event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
    // The hinge board and full-screen tools sit over the stage and keep their own keys.
    if (document.querySelector('.pf-board') || document.fullscreenElement?.classList.contains('ct-card')) return;
    if (ownsKeys(event.target, event.key)) return;
    const key = event.key;
    if (key === 'Escape') {
      if (closeMap) closeMap();
      else checkpoint.close();
      return;
    }
    if (key === 'm' || key === 'M') {
      event.preventDefault();
      toggleMap();
      return;
    }
    if (closeMap) return;
    if (['ArrowRight', 'ArrowDown', 'PageDown', ' '].includes(key)) {
      event.preventDefault();
      goNext();
    } else if (['ArrowLeft', 'ArrowUp', 'PageUp'].includes(key)) {
      event.preventDefault();
      goBack();
    } else if (key === 'Home') {
      event.preventDefault();
      go(0);
    } else if (key === 'End') {
      event.preventDefault();
      go(steps.length - 1);
    }
  }
  document.addEventListener('keydown', onKey);

  setMode(mode);

  return {
    setSteps(fresh, blocks) {
      for (const step of steps) if (!fresh.includes(step)) step.live?.dispose();
      steps = fresh;
      pageBlocks = blocks;
      // A Refresh keeps the teacher on the step they were showing.
      if (steps.length) index = Math.min(index, steps.length - 1);
      dockStack = '';
      show();
    },
    refreshCheckpoint: () => checkpoint.refresh(),
    dispose() {
      for (const step of steps) step.live?.dispose();
      document.removeEventListener('keydown', onKey);
      resize.disconnect();
      cancelAnimationFrame(fitFrame);
      closeMap?.();
      checkpoint.dispose();
      stopDock?.();
      strip.remove();
      surface.classList.remove('is-focus');
    }
  };
}
