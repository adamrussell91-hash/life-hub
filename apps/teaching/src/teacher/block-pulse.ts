import { apiGet, apiPost } from '@/api/client';
import { findBlockById } from '@/blocks/find-block';
import {
  PULSE_OPTIONS,
  blockPulseOff,
  createPulseAnchor,
  pulseEl,
  pulseFill,
  pulseTargets,
  type BlockPulseSummary,
  type LessonPulse
} from '@/blocks/block-pulse';
import type { Block } from '@/schemas/block';
import { askConfirmCard } from '@/teacher/confirm-dialog';
import { showHubToast } from '../../design-kit/js/hub-feedback.js';

/**
 * Teacher side of block pulse, drawn inside each lesson block row (nested
 * blocks in sections, columns and tabs included). The dot sits where students
 * see theirs. It stays grey until taps arrive, then fills from green through
 * amber to red. Clicking it shows the numbers, a reset and the per-block off switch.
 */

export interface TeacherBlockPulseOptions {
  lessonId: string;
  isLessonOff: () => boolean;
  onSetBlockOff: (blockId: string, off: boolean) => void;
  fetchPulse?: (lessonId: string) => Promise<LessonPulse>;
  resetPulse?: (lessonId: string, blockId: string) => Promise<LessonPulse>;
}

export interface TeacherBlockPulseHandle {
  decorate(row: HTMLElement, block: Block): void;
  /** Latest counts, or null before the first load lands. */
  current(): LessonPulse | null;
  /** Called after every load or reset; returns an unsubscribe. */
  subscribe(listener: (data: LessonPulse | null) => void): () => void;
  /** Scrolls to a block's dot and opens its panel. */
  focusBlock(blockId: string): void;
  dispose(): void;
}

/** Re-check when the teacher comes back to the tab after this long. */
const STALE_MS = 60_000;

export function fetchLessonPulse(lessonId: string): Promise<LessonPulse> {
  return apiGet<LessonPulse>(`/api/lessons/${encodeURIComponent(lessonId)}/pulse`);
}

export function resetLessonPulse(lessonId: string, blockId: string): Promise<LessonPulse> {
  return apiPost<LessonPulse>(`/api/lessons/${encodeURIComponent(lessonId)}/pulse`, {
    action: 'reset',
    block_id: blockId
  });
}

function shortDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
}

function taps(n: number): string {
  return `${n} ${n === 1 ? 'tap' : 'taps'}`;
}

export function createTeacherBlockPulse(options: TeacherBlockPulseOptions): TeacherBlockPulseHandle {
  const { lessonId } = options;
  const fetchPulse = options.fetchPulse ?? fetchLessonPulse;
  const resetPulse = options.resetPulse ?? resetLessonPulse;

  let data: LessonPulse | null = null;
  let loadedAt = 0;
  let disposed = false;
  const dots = new Map<string, { block: Block; paint: () => void; anchor: ReturnType<typeof createPulseAnchor> }>();
  const listeners = new Set<(data: LessonPulse | null) => void>();

  function summary(blockId: string): BlockPulseSummary | undefined {
    return data?.blocks[blockId];
  }

  function paintAll(): void {
    for (const dot of dots.values()) dot.paint();
    for (const listener of listeners) listener(data);
  }

  async function load(): Promise<void> {
    try {
      const next = await fetchPulse(lessonId);
      if (disposed) return;
      data = next;
      loadedAt = Date.now();
      paintAll();
    } catch {
      // Dots stay grey; the next visit tries again.
    }
  }

  const onVisible = () => {
    if (!document.hidden && Date.now() - loadedAt > STALE_MS) void load();
  };
  document.addEventListener('visibilitychange', onVisible);

  async function reset(block: Block, close: () => void): Promise<void> {
    const ok = await askConfirmCard({
      eyebrow: 'Student feedback',
      title: 'Reset the counts on this block?',
      supporting: 'The current numbers are kept in this block’s history with today’s date, then the dot goes back to grey.',
      confirmLabel: 'Reset counts'
    });
    if (!ok || disposed) return;
    try {
      data = await resetPulse(lessonId, block.id);
      loadedAt = Date.now();
      close();
      paintAll();
    } catch {
      showHubToast('Those counts did not reset. Try again.', { tone: 'danger' });
    }
  }

  function buildPanel(panel: HTMLElement, block: Block, close: () => void): void {
    const lessonOff = options.isLessonOff();
    const blockOff = blockPulseOff(block);
    const info = summary(block.id);
    const total = info?.total ?? 0;

    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Student feedback on this block');
    panel.append(pulseEl('p', 'pulse__title', 'Student feedback'));

    if (lessonOff) {
      panel.append(pulseEl('p', 'pulse__note', 'Off for this whole lesson. Turn it back on from Lesson options.'));
    } else if (blockOff) {
      panel.append(pulseEl('p', 'pulse__note', 'Off for this block. Students don’t see the dot.'));
    }

    const list = pulseEl('ul', 'pulse__counts');
    for (const option of PULSE_OPTIONS) {
      const n = info?.counts[option.id] ?? 0;
      const item = pulseEl('li', `pulse__count${n > 0 ? '' : ' pulse__count--zero'}`);
      item.dataset.option = option.id;
      const icon = pulseEl('span', 'pulse__count-icon');
      icon.innerHTML = option.icon;
      item.append(icon, pulseEl('span', 'pulse__count-label', option.label), pulseEl('span', 'pulse__count-n', String(n)));
      list.append(item);
    }
    panel.append(list);

    const last = info?.resets[0];
    const foot = total === 0 && !last ? 'No taps yet.' : `${taps(total)} since ${last ? `reset on ${shortDate(last.reset_at)}` : 'the start'}.`;
    panel.append(pulseEl('p', 'pulse__meta', foot));
    if (last) {
      panel.append(pulseEl('p', 'pulse__meta', `Before that: ${taps(last.total)}.`));
    }

    const actions = pulseEl('div', 'pulse__actions');
    const resetBtn = pulseEl('button', 'btn btn--ghost pulse__reset', 'Reset counts');
    resetBtn.type = 'button';
    resetBtn.disabled = total === 0;
    resetBtn.addEventListener('click', () => void reset(block, close));
    actions.append(resetBtn);

    if (!lessonOff) {
      const toggle = pulseEl('button', 'btn btn--ghost pulse__toggle', blockOff ? 'Turn on here' : 'Turn off here');
      toggle.type = 'button';
      toggle.addEventListener('click', () => {
        close();
        options.onSetBlockOff(block.id, !blockOff);
        showHubToast(
          blockOff
            ? 'Feedback is on for this block. Publish changes to show students.'
            : 'Feedback is off for this block. Publish changes to hide it from students.'
        );
      });
      actions.append(toggle);
    }
    panel.append(actions);
  }

  function attach(target: HTMLElement, block: Block): void {
    let anchor: ReturnType<typeof createPulseAnchor>;
    const paint = () => {
      const info = summary(block.id);
      const fill = info ? pulseFill(info.counts) : null;
      const off = options.isLessonOff() || blockPulseOff(block);
      anchor.root.classList.toggle('pulse--off', off);
      anchor.root.classList.toggle('pulse--filled', Boolean(fill));
      if (fill) anchor.root.style.setProperty('--pulse-fill', fill);
      else anchor.root.style.removeProperty('--pulse-fill');
      const total = info?.total ?? 0;
      anchor.dot.setAttribute(
        'aria-label',
        `Student feedback: ${total === 0 ? 'no taps yet' : taps(total)}${off ? ', turned off' : ''}`
      );
      anchor.repaint();
    };
    anchor = createPulseAnchor({
      label: 'Student feedback',
      buildPanel: (panel) => buildPanel(panel, block, () => anchor.close())
    });
    anchor.root.classList.add('pulse--teacher');
    target.classList.add('pulse-host');
    target.append(anchor.root);
    dots.set(block.id, { block, paint, anchor });
    paint();
  }

  void load();

  return {
    decorate(row: HTMLElement, block: Block) {
      for (const { el, block: target } of pulseTargets(row, [block], findBlockById)) {
        attach(el, target);
      }
    },
    current: () => data,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    focusBlock(blockId: string) {
      const dot = dots.get(blockId);
      if (!dot?.anchor.root.isConnected) return;
      dot.anchor.root.parentElement?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      if (!dot.anchor.isOpen()) dot.anchor.dot.click();
      dot.anchor.dot.focus({ preventScroll: true });
    },
    dispose() {
      disposed = true;
      dots.clear();
      listeners.clear();
      document.removeEventListener('visibilitychange', onVisible);
    }
  };
}
