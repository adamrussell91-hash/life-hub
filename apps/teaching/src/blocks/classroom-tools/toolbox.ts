/**
 * Classroom toolbox: a faint gear on a divider (or the head of a Tools block)
 * that slides out a row of tools. Picking one opens it in that space: between
 * the two blocks for a divider, in the block's own slot for a Tools block.
 *
 * Teachers get every tool. Students get the timer, stopwatch, technique
 * spinner, coin and dice; nothing that uses names. Student names are read
 * from the class record at run time on the teacher side only, so they never
 * sit in a block or reach a student page.
 */
import type { Block, ClassroomToolId, TimerSegment } from '@/schemas/block';
import { TOOL_LABEL, toolsFor } from '@/blocks/classroom-tools/logic';
import { TOOL_BUILDERS, type ToolEnv } from '@/blocks/classroom-tools/tools';
import { ICON } from '@/blocks/classroom-tools/icons';
import { isMuted, setMuted } from '@/blocks/classroom-tools/sound';
import './classroom-tools.css';

export type ToolboxOptions = {
  kind: 'divider' | 'block';
  viewer: 'teacher' | 'student';
  timerStack: TimerSegment[];
  startTool?: ClassroomToolId;
  lessonId?: string;
  pageBlocks?: Block[];
  /** Block id. With it, the tray and open tool survive the re-render that follows any edit. */
  key?: string;
};

let uidSeed = 0;

/** Last tray state per block, so a re-render keeps what the teacher opened or closed. */
const remembered = new Map<string, { start: ClassroomToolId | null; trayOut: boolean; tool: ClassroomToolId | null }>();

export function forgetToolboxStateForTests(): void {
  remembered.clear();
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function iconButton(icon: string, label: string, className = 'ct-icon-btn'): HTMLButtonElement {
  const btn = el('button', className);
  btn.type = 'button';
  btn.innerHTML = icon;
  btn.setAttribute('aria-label', label);
  btn.title = label;
  return btn;
}

const muteButtons = new Set<HTMLButtonElement>();

function paintMute(btn: HTMLButtonElement): void {
  const muted = isMuted();
  btn.innerHTML = muted ? ICON.muted : ICON.sound;
  btn.setAttribute('aria-pressed', String(muted));
  btn.setAttribute('aria-label', muted ? 'Turn sound on' : 'Mute');
  btn.title = muted ? 'Turn sound on' : 'Mute';
}

/** Build the toolbox inside `host`. Returns a function that stops any running tool. */
export function mountToolbox(host: HTMLElement, options: ToolboxOptions): () => void {
  const tools = toolsFor(options.viewer);
  host.classList.add('ct-host', `ct-host--${options.kind}`);

  const bar = el('div', 'ct-bar');
  const tray = el('div', 'ct-tray');
  tray.setAttribute('role', 'toolbar');
  tray.setAttribute('aria-label', 'Classroom tools');
  tray.id = `ct-tray-${(uidSeed += 1)}`;
  const chips = new Map<ClassroomToolId, HTMLButtonElement>();
  for (const tool of tools) {
    const chip = el('button', 'ct-chip');
    chip.type = 'button';
    chip.dataset.tool = tool;
    chip.tabIndex = -1;
    chip.setAttribute('aria-pressed', 'false');
    chip.innerHTML = ICON[tool];
    chip.append(el('span', '', TOOL_LABEL[tool]));
    chips.set(tool, chip);
    tray.append(chip);
  }
  const trigger = iconButton(ICON.gear, 'Open classroom tools', 'ct-trigger');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.setAttribute('aria-controls', tray.id);

  if (options.kind === 'divider') {
    bar.append(el('hr', 'ct-rule'), tray, trigger);
  } else {
    bar.append(el('span', 'ct-block-label block-eyebrow', 'Classroom tools'), tray, trigger);
  }

  const panel = el('div', 'ct-panel');
  const inner = el('div', 'ct-panel__inner');
  const card = el('div', 'ct-card');
  inner.append(card);
  panel.append(inner);
  host.append(bar, panel);
  // The lesson builder selects a block on click; using a tool should not.
  for (const node of [tray, trigger, panel]) node.addEventListener('click', (event) => event.stopPropagation());

  let current: ClassroomToolId | null = null;
  let stopTool: (() => void) | null = null;

  const start = options.startTool && tools.includes(options.startTool) ? options.startTool : null;
  const memoryKey = options.key ? `${options.viewer}:${options.key}` : null;
  const remember = (): void => {
    if (memoryKey) remembered.set(memoryKey, { start, trayOut: host.classList.contains('is-tray-out'), tool: current });
  };

  const setTray = (out: boolean): void => {
    host.classList.toggle('is-tray-out', out);
    trigger.setAttribute('aria-expanded', String(out));
    trigger.setAttribute('aria-label', out ? 'Close classroom tools' : 'Open classroom tools');
    for (const chip of chips.values()) chip.tabIndex = out ? 0 : -1;
    remember();
  };

  const close = (): void => {
    stopTool?.();
    stopTool = null;
    current = null;
    host.classList.remove('is-open');
    for (const chip of chips.values()) chip.setAttribute('aria-pressed', 'false');
    card.replaceChildren();
    remember();
  };

  const open = (tool: ClassroomToolId): void => {
    stopTool?.();
    stopTool = null;
    current = tool;
    for (const [id, chip] of chips) chip.setAttribute('aria-pressed', String(id === tool));

    const head = el('div', 'ct-card__head');
    head.append(el('strong', 'ct-card__title', TOOL_LABEL[tool]));
    const actions = el('span', 'ct-card__actions');
    const mute = iconButton(ICON.sound, 'Mute');
    paintMute(mute);
    muteButtons.add(mute);
    mute.addEventListener('click', () => {
      setMuted(!isMuted());
      for (const btn of muteButtons) {
        if (btn.isConnected) paintMute(btn);
        else muteButtons.delete(btn);
      }
    });
    const full = iconButton(ICON.expand, 'Show full screen');
    full.addEventListener('click', () => {
      if (document.fullscreenElement === card) {
        void document.exitFullscreen?.().catch(() => undefined);
      } else {
        void card.requestFullscreen?.().catch(() => undefined);
      }
    });
    const shut = iconButton(ICON.close, 'Close tool');
    shut.addEventListener('click', () => {
      close();
      trigger.focus();
    });
    actions.append(mute, full, shut);
    head.append(actions);

    const body = el('div', 'ct-card__body');
    card.replaceChildren(head, body);
    const env: ToolEnv = {
      viewer: options.viewer,
      timerStack: options.timerStack,
      lessonId: options.lessonId,
      pageBlocks: options.pageBlocks,
      uid: `${(uidSeed += 1)}`
    };
    stopTool = TOOL_BUILDERS[tool](body, env) ?? null;
    host.classList.add('is-open');
    remember();
  };

  trigger.addEventListener('click', () => {
    const out = !host.classList.contains('is-tray-out');
    setTray(out);
    if (!out) close();
  });
  tray.addEventListener('click', (event) => {
    const chip = (event.target as HTMLElement).closest<HTMLButtonElement>('.ct-chip');
    const tool = chip?.dataset.tool as ClassroomToolId | undefined;
    if (!tool) return;
    if (current === tool) close();
    else open(tool);
  });
  host.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && host.classList.contains('is-tray-out') && !document.fullscreenElement) {
      close();
      setTray(false);
      trigger.focus();
    }
  });

  // A changed start tool is a new setting, so it wins over what was remembered.
  const saved = memoryKey ? remembered.get(memoryKey) : undefined;
  if (saved && saved.start === start) {
    if (saved.trayOut) setTray(true);
    if (saved.tool && tools.includes(saved.tool)) open(saved.tool);
  } else {
    if (start || options.kind === 'block') setTray(true);
    if (start) open(start);
  }

  return () => close();
}
