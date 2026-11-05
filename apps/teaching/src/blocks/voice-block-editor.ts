import type { Block } from '@/schemas/block';
import { button, el } from '@/blocks/peer-feedback-ui';
import { mountFeedbackCodesEditor } from '@/blocks/feedback-codes-editor';
import { GROUP_LABELS, type FeedbackCodeGroup } from '@/blocks/feedback-codes';
import { taggedSkills, withTaggedSkills } from '@/deep/block-tags';
import { loadSkills } from '@/skills/api';
import type { SkillStrand } from '@/skills/schema';
import { applyVoicePick, reciteParts, voicePick, SIDE_LABELS, VOICE_PICKS } from '@/blocks/voice-oracy';
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

/** Time choices in seconds; 0 = no limit (respond only), -1 = students choose. */
const TIMES: Array<{ value: number; label: string }> = [
  { value: 60, label: '60 s' },
  { value: 90, label: '90 s' },
  { value: 120, label: '2 min' },
  { value: 180, label: '3 min' },
  { value: 300, label: '5 min' },
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

export function createVoiceModePicker(getLatest: () => VoiceBlock, onPick: (block: VoiceBlock) => void): HTMLElement {
  const host = el('div', 'voice-editor__modes');
  const paint = () => {
    const current = voicePick(getLatest().content);
    const picker = pillGroup('What students do', VOICE_PICKS.map((p) => ({ value: p.id, label: p.label })), (id) => id === current, (id) => {
      const latest = getLatest();
      if (id === voicePick(latest.content)) return;
      onPick({ ...latest, content: applyVoicePick(latest.content, id) });
      paint();
    });
    picker.append(el('p', 'pf-field__hint block-secondary', VOICE_PICKS.find((p) => p.id === current)?.hint ?? ''));
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

  // The Speaking strand, once loaded: its sub-strands become the skills a speaking task can place students on.
  let speaking: SkillStrand | null = null;
  void loadSkills().then((c) => {
    speaking = c?.strands?.find((x) => x.strand === 'speaking') ?? null;
    if (speaking && root.isConnected) paint();
  }, () => {});

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

  const QUESTION_FIELD: Partial<Record<NonNullable<Content['oracy']>, { label: string; placeholder: string }>> = {
    speech: { label: 'Speech topic', placeholder: 'e.g. The one rule I would change at this school' },
    debate: { label: 'Motion', placeholder: 'e.g. Cities should ban cars from their centres' },
    presentation: { label: 'Presentation topic', placeholder: 'e.g. How a volcano forms' },
    recite: { label: 'Instruction (optional)', placeholder: 'e.g. Recite this with attention to its rhythm' }
  };

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

  function sideField(content: Content): HTMLElement {
    const options: Array<{ value: Content['side']; label: string }> = [
      { value: undefined, label: 'Students pick' },
      { value: 'proposing', label: SIDE_LABELS.proposing },
      { value: 'opposing', label: SIDE_LABELS.opposing }
    ];
    return pillGroup('Side', options, (v) => v === content.side, (v) => update({ side: v }, true));
  }

  function stemsField(content: Content): HTMLElement {
    const wrap = el('div', 'pf-field');
    const label = el('label', 'pf-field__label', content.oracy === 'debate' ? 'Phrases to try' : 'Techniques to try');
    label.htmlFor = `voice-stems-${getLatest().id}`;
    const box = el('textarea', 'pa-input');
    box.id = label.htmlFor;
    box.rows = 4;
    box.value = (content.stems ?? []).join('\n');
    box.addEventListener('input', () => {
      const stems = box.value.split('\n').map((line) => line.trim().slice(0, 120)).filter(Boolean).slice(0, 12);
      update({ stems });
    });
    wrap.append(label, box, el('p', 'pf-field__hint block-secondary', 'One per line, up to 12. Students see these as prompts under their dot points.'));
    return wrap;
  }

  function reciteField(content: Content): HTMLElement {
    const wrap = el('div', 'pf-field');
    const label = el('label', 'pf-field__label', 'Text to recite');
    label.htmlFor = `voice-recite-${getLatest().id}`;
    const box = el('textarea', 'pa-input voice-editor__recite');
    box.id = label.htmlFor;
    box.rows = 8;
    box.maxLength = 8000;
    box.value = content.recite_text ?? '';
    const count = el('p', 'pf-field__hint block-secondary');
    const paintCount = () => {
      const parts = reciteParts(box.value).length;
      count.textContent = `A blank line starts a new part. ${parts} part${parts === 1 ? '' : 's'} found.`;
    };
    box.addEventListener('input', () => {
      update({ recite_text: box.value });
      paintCount();
    });
    paintCount();
    wrap.append(label, box, count);
    return wrap;
  }

  function paint(): void {
    const content = getLatest().content;
    if (document.activeElement !== question) question.value = content.prompt ?? '';
    const field = content.oracy ? QUESTION_FIELD[content.oracy] : undefined;
    questionLabel.textContent = field?.label ?? 'Question';
    question.placeholder = field?.placeholder ?? 'e.g. How does the composer represent the human experience of isolation?';
    const mode = content.mode ?? 'listen';
    const timeValue = content.student_chooses_time ? -1 : (content.time_limit_s ?? (mode === 'viva' ? DEFAULT_VIVA_SECONDS : 0));
    const times = mode === 'respond' ? [{ value: 0, label: 'No limit' }, ...TIMES] : TIMES;
    const time = pillGroup('Speaking time', times, (v) => v === timeValue, (v) => {
      if (v === -1) update({ student_chooses_time: true, time_limit_s: undefined }, true);
      else update({ student_chooses_time: undefined, time_limit_s: v || undefined }, true);
    });
    time.append(el('p', 'pf-field__hint block-secondary', 'Students choose from 60 s, 90 s or 2 min. Recording stops at the limit.'));
    (time.lastElementChild as HTMLElement).hidden = timeValue !== -1;
    if (content.oracy === 'recite' && timeValue === 0) time.append(el('p', 'pf-field__hint block-secondary', 'Recording stops at 5 min, the longest take the block keeps.'));

    const shown = content.code_groups ?? GROUPS;
    const groups = pillGroup('Codes on your marking strip', GROUPS.map((g) => ({ value: g, label: GROUP_LABELS[g] })), (g) => shown.includes(g), (g) => {
      const next = shown.includes(g) ? shown.filter((x) => x !== g) : GROUPS.filter((x) => x === g || shown.includes(x));
      update({ code_groups: next.length === GROUPS.length ? undefined : next.length ? next : shown }, true);
    });

    dynamic.replaceChildren(
      ...(content.oracy === 'recite' ? [reciteField(content)] : []),
      ...(content.oracy === 'debate' ? [sideField(content)] : []),
      time,
      ...(mode === 'viva' ? [scaffoldEditor(content)] : []),
      ...(content.oracy === 'speech' || content.oracy === 'debate' ? [stemsField(content)] : []),
      ...(content.oracy === 'presentation' ? [el('p', 'pf-field__hint block-secondary', 'Slides stay in the student’s own tool. You mark from the audio and transcript.')] : []),
      groups,
      ...(shown.includes('speaking') ? [speakingSkillsField()] : [])
    );
  }

  /**
   * Which Speaking skills this task places students on. A tagged skill puts its
   * ladder on the marking screen, so the rung you pick lands on the continuum.
   */
  function speakingSkillsField(): HTMLElement {
    const block = getLatest();
    const tagged = taggedSkills(block);
    if (!speaking) return el('p', 'pf-field__hint block-secondary voice-editor__skills-wait', 'Speaking skills load from the skills continuum.');
    const refs = speaking.sub_strands.map((s) => ({ value: `speaking.${s.id}`, label: s.name }));
    const field = pillGroup('Speaking skills to place students on', refs, (ref) => tagged.includes(ref), (ref) => {
      const latest = getLatest();
      const now = taggedSkills(latest);
      const next = now.includes(ref) ? now.filter((x) => x !== ref) : [...now, ref];
      if (next.length > 3) return;
      onChange(withTaggedSkills(latest, next));
      paint();
    });
    field.classList.add('voice-editor__skills');
    const speakingTagged = tagged.filter((r) => r.startsWith('speaking.')).length;
    field.append(el('p', 'pf-field__hint block-secondary', speakingTagged
      ? 'Marking shows these ladders, so you can place each student on a rung.'
      : 'Pick at least one so marking shows the speaking ladder. Up to three skills per task.'));
    return field;
  }

  return { el: root, refresh: paint };
}
