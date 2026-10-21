import type { Block } from '@/schemas/block';
import { button, el } from '@/blocks/peer-feedback-ui';
import { mountFeedbackCodesEditor } from '@/blocks/feedback-codes-editor';
import { GROUP_LABELS, type FeedbackCodeGroup } from '@/blocks/feedback-codes';
import '@/blocks/peer-feedback.css';
import '@/blocks/peer-annotate.css';
import '@/blocks/voice.css';

/**
 * Editor fields for the Voice block's student modes (respond, viva). Listen
 * mode keeps the original audio upload fields in editors.ts.
 */

type VoiceBlock = Extract<Block, { block_type: 'audio' }>;
type VoiceMode = NonNullable<VoiceBlock['content']['mode']>;
type Content = VoiceBlock['content'];

const MODES: Array<{ mode: VoiceMode; label: string; hint: string }> = [
  { mode: 'listen', label: 'Listen', hint: 'Students play a clip you upload or record.' },
  { mode: 'respond', label: 'Respond', hint: 'Students record a spoken answer and send you their best take.' },
  { mode: 'viva', label: 'Viva', hint: 'Students prep dot points; the timer walks them through each point while they record.' }
];

/** Time choices in seconds; 0 = no limit (respond only), -1 = students choose. */
const TIMES: Array<{ value: number; label: string }> = [
  { value: 60, label: '60 s' },
  { value: 90, label: '90 s' },
  { value: 120, label: '2 min' },
  { value: 180, label: '3 min' },
  { value: -1, label: 'Students choose' }
];
export const STUDENT_TIME_CHOICES = [60, 90, 120];
export const DEFAULT_VIVA_SECONDS = 90;
const GROUPS: FeedbackCodeGroup[] = ['composition', 'viva', 'speaking'];
const WEIGHTS = [1, 1.5, 2];

export function voiceMode(block: VoiceBlock): VoiceMode {
  return block.content.mode ?? 'listen';
}

function pillGroup<T>(label: string, options: Array<{ value: T; label: string }>, isOn: (v: T) => boolean, onPick: (v: T) => void): HTMLElement {
  const wrap = el('div', 'pf-field');
  wrap.append(el('span', 'pf-field__label', label));
  const group = el('div', 'pa-mode');
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', label);
  for (const o of options) {
    const b = button(o.label, 'ghost', () => onPick(o.value));
    b.className = 'pa-mode__option';
    b.setAttribute('aria-pressed', String(isOn(o.value)));
    group.append(b);
  }
  wrap.append(group);
  return wrap;
}

export function createVoiceModePicker(getLatest: () => VoiceBlock, onPick: (mode: VoiceMode) => void): HTMLElement {
  const host = el('div', 'voice-editor__modes');
  const paint = () => {
    const current = voiceMode(getLatest());
    const picker = pillGroup('What students do', MODES.map((m) => ({ value: m.mode, label: m.label })), (m) => m === current, (m) => {
      if (m === voiceMode(getLatest())) return;
      onPick(m);
      paint();
    });
    picker.append(el('p', 'pf-field__hint block-secondary', MODES.find((m) => m.mode === current)?.hint ?? ''));
    host.replaceChildren(picker);
  };
  paint();
  return host;
}

export function createVoiceTaskFields(
  getLatest: () => VoiceBlock,
  onChange: (block: VoiceBlock) => void
): { el: HTMLElement; refresh: () => void } {
  const root = el('div', 'voice-editor');
  const dynamic = el('div', 'voice-editor__dynamic');

  const update = (patch: Partial<Content>, repaint = false) => {
    const latest = getLatest();
    onChange({ ...latest, content: { ...latest.content, ...patch } });
    if (repaint) paint();
  };

  const questionWrap = el('div', 'pf-field');
  const questionLabel = el('label', 'pf-field__label', 'Question');
  questionLabel.htmlFor = `voice-q-${Math.random().toString(36).slice(2, 8)}`;
  const question = el('textarea', 'pa-input voice-editor__question');
  question.id = questionLabel.htmlFor;
  question.rows = 3;
  question.maxLength = 4000;
  question.placeholder = 'e.g. How does the composer represent the human experience of isolation?';
  question.addEventListener('input', () => update({ prompt: question.value }));
  questionWrap.append(questionLabel, question);

  const codes = el('details', 'voice-editor__codes');
  codes.append(el('summary', 'voice-editor__codes-summary', 'Edit feedback codes'));
  codes.addEventListener('toggle', () => {
    if (codes.open && codes.childElementCount === 1) codes.append(mountFeedbackCodesEditor());
  });

  root.append(questionWrap, dynamic, codes, el('p', 'pf-note block-secondary', 'Students record on the published lesson. Their submissions appear on this block for you to mark.'));

  function scaffoldEditor(content: Content): HTMLElement {
    const points = content.scaffold ?? [];
    const wrap = el('div', 'pf-field voice-editor__scaffold');
    wrap.append(
      el('span', 'pf-field__label', 'Dot point scaffold (optional)'),
      el('p', 'pf-field__hint block-secondary', 'Labels students fill in, e.g. Concept · Evidence 1 · Evidence 2 · Link back. A heavier point gets more of the time.')
    );
    const list = el('ol', 'voice-editor__points');
    points.forEach((point, index) => {
      const item = el('li', 'voice-editor__point');
      const label = el('input', 'pa-input');
      label.type = 'text';
      label.maxLength = 80;
      label.value = point.label;
      label.placeholder = `Point ${index + 1}`;
      label.setAttribute('aria-label', `Point ${index + 1} label`);
      label.addEventListener('input', () => {
        const next = [...(getLatest().content.scaffold ?? [])];
        next[index] = { ...next[index]!, label: label.value };
        update({ scaffold: next });
      });
      const weights = el('div', 'pa-mode voice-editor__weights');
      weights.setAttribute('role', 'group');
      weights.setAttribute('aria-label', `Time share for point ${index + 1}`);
      for (const w of WEIGHTS) {
        const b = button(`${w}×`, 'ghost', () => {
          const next = [...(getLatest().content.scaffold ?? [])];
          next[index] = { ...next[index]!, weight: w };
          update({ scaffold: next }, true);
        });
        b.className = 'pa-mode__option';
        b.setAttribute('aria-pressed', String((point.weight ?? 1) === w));
        weights.append(b);
      }
      const remove = button('Remove', 'ghost', () => {
        update({ scaffold: (getLatest().content.scaffold ?? []).filter((_, i) => i !== index) }, true);
      });
      item.append(label, weights, remove);
      list.append(item);
    });
    const add = button('Add a point', 'secondary', () => {
      update({ scaffold: [...(getLatest().content.scaffold ?? []), { label: '', weight: 1 }] }, true);
      list.querySelector<HTMLInputElement>('.voice-editor__point:last-child input')?.focus();
    });
    add.disabled = points.length >= 8;
    wrap.append(list, add);
    return wrap;
  }

  function paint(): void {
    const content = getLatest().content;
    if (document.activeElement !== question) question.value = content.prompt ?? '';
    const mode = content.mode ?? 'listen';
    const timeValue = content.student_chooses_time ? -1 : (content.time_limit_s ?? (mode === 'viva' ? DEFAULT_VIVA_SECONDS : 0));
    const times = mode === 'respond' ? [{ value: 0, label: 'No limit' }, ...TIMES] : TIMES;
    const time = pillGroup('Speaking time', times, (v) => v === timeValue, (v) => {
      if (v === -1) update({ student_chooses_time: true, time_limit_s: undefined }, true);
      else update({ student_chooses_time: undefined, time_limit_s: v || undefined }, true);
    });
    time.append(el('p', 'pf-field__hint block-secondary', 'Students choose from 60 s, 90 s or 2 min. Recording stops at the limit.'));
    (time.lastElementChild as HTMLElement).hidden = timeValue !== -1;

    const shown = content.code_groups ?? GROUPS;
    const groups = pillGroup('Codes on your marking strip', GROUPS.map((g) => ({ value: g, label: GROUP_LABELS[g] })), (g) => shown.includes(g), (g) => {
      const next = shown.includes(g) ? shown.filter((x) => x !== g) : GROUPS.filter((x) => x === g || shown.includes(x));
      update({ code_groups: next.length === GROUPS.length ? undefined : next.length ? next : shown }, true);
    });

    dynamic.replaceChildren(time, ...(mode === 'viva' ? [scaffoldEditor(content)] : []), groups);
  }

  return { el: root, refresh: paint };
}
