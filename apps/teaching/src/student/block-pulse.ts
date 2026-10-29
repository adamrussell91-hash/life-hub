import { apiPost } from '@/api/client';
import { findBlockById } from '@/blocks/find-block';
import {
  PULSE_OPTIONS,
  blockTakesPulse,
  createPulseAnchor,
  pulseEl,
  pulseTargets,
  type PulseOption
} from '@/blocks/block-pulse';
import type { Block } from '@/schemas/block';

/**
 * Student side of block pulse. A faint dot sits in each block's corner; a tap
 * opens five icon buttons. Each option is one tap per device and a second tap
 * takes it back. Students never see anyone's totals, only their own choices.
 */

const DEVICE_KEY = 'block-pulse:device';
const PROMPT = "How's this going?";

let memoryDeviceId: string | null = null;

function randomId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** A random id this browser keeps, so a repeat tap lands on the same record. */
export function pulseDeviceId(): string {
  try {
    const saved = localStorage.getItem(DEVICE_KEY);
    if (saved && /^[A-Za-z0-9_-]{12,64}$/.test(saved)) return saved;
    const fresh = randomId();
    localStorage.setItem(DEVICE_KEY, fresh);
    return fresh;
  } catch {
    memoryDeviceId ??= randomId();
    return memoryDeviceId;
  }
}

function choicesKey(lessonId: string): string {
  return `block-pulse:choices:${lessonId}`;
}

function readChoices(lessonId: string): Record<string, PulseOption[]> {
  try {
    const raw = JSON.parse(localStorage.getItem(choicesKey(lessonId)) ?? '{}');
    return raw && typeof raw === 'object' ? raw : {};
  } catch {
    return {};
  }
}

function writeChoices(lessonId: string, choices: Record<string, PulseOption[]>): void {
  try {
    localStorage.setItem(choicesKey(lessonId), JSON.stringify(choices));
  } catch {
    /* ignore: the tap still reached the server */
  }
}

export function sendPulseTap(
  lessonId: string,
  body: { block_id: string; option: PulseOption; on: boolean }
): Promise<unknown> {
  return apiPost(`/api/published/pulse/${encodeURIComponent(lessonId)}`, {
    ...body,
    device_id: pulseDeviceId()
  });
}

export interface MountStudentPulseOptions {
  lessonId: string;
  blocks: Block[];
  feedbackOff?: boolean;
  send?: typeof sendPulseTap;
}

/** Adds a dot to every eligible block under `root`, nested ones included. */
export function mountStudentBlockPulse(root: HTMLElement, options: MountStudentPulseOptions): void {
  if (options.feedbackOff) return;
  const { lessonId, blocks } = options;
  const send = options.send ?? sendPulseTap;
  const choices = readChoices(lessonId);

  for (const { el, block } of pulseTargets(root, blocks, findBlockById)) {
    if (!blockTakesPulse(block)) continue;
    const chosen = new Set<PulseOption>(choices[block.id] ?? []);
    let caption: HTMLElement | null = null;
    let message = PROMPT;

    const paintDot = () => anchor.root.classList.toggle('pulse--used', chosen.size > 0);

    const anchor = createPulseAnchor({
      label: 'Give feedback on this block',
      buildPanel(panel) {
        panel.setAttribute('role', 'group');
        panel.setAttribute('aria-label', 'Feedback on this block');
        const row = pulseEl('div', 'pulse__options');
        for (const option of PULSE_OPTIONS) {
          const btn = pulseEl('button', 'pulse__option');
          btn.type = 'button';
          btn.dataset.option = option.id;
          btn.innerHTML = option.icon;
          btn.setAttribute('aria-label', option.label);
          btn.setAttribute('aria-pressed', String(chosen.has(option.id)));
          const show = () => {
            if (caption) caption.textContent = option.label;
          };
          const hide = () => {
            if (caption) caption.textContent = message;
          };
          btn.addEventListener('pointerenter', show);
          btn.addEventListener('focus', show);
          btn.addEventListener('pointerleave', hide);
          btn.addEventListener('blur', hide);
          btn.addEventListener('click', () => void toggle(option.id, btn));
          row.append(btn);
        }
        caption = pulseEl('p', 'pulse__caption', message);
        caption.setAttribute('aria-live', 'polite');
        panel.append(row, caption);
      }
    });

    async function toggle(option: PulseOption, btn: HTMLButtonElement): Promise<void> {
      const on = !chosen.has(option);
      if (on) chosen.add(option);
      else chosen.delete(option);
      btn.setAttribute('aria-pressed', String(on));
      paintDot();
      const label = PULSE_OPTIONS.find((row) => row.id === option)?.label ?? '';
      message = on ? `Sent: ${label}` : 'Taken back';
      if (caption) caption.textContent = message;
      try {
        await send(lessonId, { block_id: block.id, option, on });
        choices[block.id] = [...chosen];
        writeChoices(lessonId, choices);
      } catch {
        if (on) chosen.delete(option);
        else chosen.add(option);
        btn.setAttribute('aria-pressed', String(!on));
        paintDot();
        message = 'Try sending again.';
        if (caption) caption.textContent = message;
      }
    }

    paintDot();
    el.classList.add('pulse-host');
    el.append(anchor.root);
  }
}
