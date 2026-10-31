import { apiGet, apiPut } from '@/api/client';
import { button, el, errorText } from '@/blocks/peer-feedback-ui';
import type { CodeColour } from '@/blocks/peer-annotate';
import {
  FEEDBACK_CODES_ENDPOINT,
  CRITERION_LABELS,
  GROUP_LABELS,
  PROBLEM_TYPE_LABELS,
  codeInk,
  primeFeedbackCodes,
  type CodeProblemType,
  type Criterion,
  type FeedbackCode,
  type FeedbackCodeGroup
} from '@/blocks/feedback-codes';
import { askInline, costText, estimateNextStepJob, runNextStepJob, type LaddersDone } from '@/blocks/next-step-run';
import { flagText, rungLabel } from '@/blocks/next-step-bank';
import { RUNG_ORDER, checkWording } from '@/progress/wording';
import { loadSkills } from '@/skills/api';
import { skillSelect } from '@/skills/select';
import type { SkillsContinuum } from '@/skills/schema';
import '@/styles/next-step-teacher.css';

/**
 * Editor for the feedback code library. One library for every lesson, so it
 * saves on its own (not with the lesson) by its own button, like the peer
 * feedback bank. Each code folds away to one line so 25 codes stay scannable.
 * A code can link to a continuum skill and carry a ladder: its next step at
 * each placement rung, which writing boxes rewrite for their question. Wording
 * that students read is checked as it is typed; the flags are advice only.
 */

const COLOURS: CodeColour[] = ['lilac', 'blue', 'gold', 'peach', 'sage'];
const COLOUR_NAMES: Record<CodeColour, string> = { blue: 'Blue', sage: 'Green', peach: 'Peach', gold: 'Gold', lilac: 'Purple' };
const GROUPS: FeedbackCodeGroup[] = ['composition', 'viva', 'speaking'];
const MAX_CODES = 60;

let seq = 0;
function input(label: string, value: string, max: number, onInput: (v: string) => void, opts: { multiline?: boolean; placeholder?: string; check?: boolean } = {}): HTMLElement {
  const id = `fc-edit-${++seq}`;
  const wrap = el('div', 'pf-field');
  const lab = el('label', 'pf-field__label', label);
  lab.htmlFor = id;
  const box = opts.multiline ? el('textarea', 'pa-input') : el('input', 'pa-input');
  box.id = id;
  if (box instanceof HTMLInputElement) box.type = 'text';
  else box.rows = 2;
  box.value = value;
  box.maxLength = max;
  box.placeholder = opts.placeholder ?? '';
  box.addEventListener('input', () => onInput(box.value));
  wrap.append(lab, box);
  if (opts.check) wrap.append(wordingFlag(box));
  return wrap;
}

/** The wording check under a field students read. An empty optional field passes. */
function wordingFlag(box: HTMLInputElement | HTMLTextAreaElement, max = 600): HTMLElement {
  const flag = el('p', 'nst-flag');
  flag.setAttribute('aria-live', 'polite');
  const show = () => {
    flag.textContent = box.value.trim() ? flagText(checkWording(box.value, max)) : '';
    flag.hidden = !flag.textContent;
  };
  box.addEventListener('input', show);
  show();
  return flag;
}

function pills<T extends string | number>(label: string, options: Array<{ value: T; label: string }>, current: T | null, onPick: (v: T) => void): HTMLElement {
  const wrap = el('div', 'pf-field');
  wrap.append(el('span', 'pf-field__label', label));
  const group = el('div', 'pa-mode');
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', label);
  for (const o of options) {
    const b = button(o.label, 'ghost', () => onPick(o.value));
    b.className = 'pa-mode__option';
    b.setAttribute('aria-pressed', String(o.value === current));
    group.append(b);
  }
  wrap.append(group);
  return wrap;
}

export function mountFeedbackCodesEditor(): HTMLElement {
  const root = el('section', 'pa-bank fc-editor');
  root.append(
    el('p', 'pf-field__label', 'Feedback codes'),
    el('p', 'pf-field__hint', 'Shared by every Voice block and annotation in every lesson. Students see the description when they tap a code.')
  );
  const rows = el('ul', 'pa-bank__rows fc-editor__rows');
  const status = el('p', 'pa-bank__status');
  status.setAttribute('role', 'status');
  const actions = el('div', 'pf-actions');
  root.append(rows, actions, status);

  let codes: FeedbackCode[] = [];
  let dirty = false;
  let openIndex: number | null = null;
  let skills: SkillsContinuum | null = null;
  /** Codes Draft ladders filled, with the descriptor each had before. */
  const drafted = new Map<string, string>();

  const say = (text: string, tone: 'info' | 'error' = 'info') => {
    status.textContent = text;
    status.dataset.tone = tone;
  };
  const change = (index: number, patch: Partial<FeedbackCode>, repaint = false) => {
    codes = codes.map((c, i) => (i === index ? { ...c, ...patch } : c));
    dirty = true;
    say('Unsaved changes.');
    if (repaint) paint();
  };

  function row(code: FeedbackCode, index: number): HTMLElement {
    const item = el('li', 'fc-editor__row');
    const head = button('', 'ghost', () => {
      openIndex = openIndex === index ? null : index;
      paint();
    });
    head.className = 'fc-editor__head';
    head.setAttribute('aria-expanded', String(openIndex === index));
    const chip = el('span', 'fc-chip', code.code || '?');
    chip.style.setProperty('--fc-ink', codeInk(code.colour));
    const where = code.criterion ? CRITERION_LABELS[code.criterion] : GROUP_LABELS[code.group];
    head.append(chip, el('span', 'fc-editor__name', code.label || 'New code'), el('span', 'fc-editor__where block-secondary', code.key ? `${where} · shortcut ${code.key}` : where));
    if (code.hidden) head.append(el('span', 'fc-editor__hidden', 'Hidden'));
    item.append(head);
    if (openIndex !== index) return item;

    const body = el('div', 'fc-editor__body');
    body.append(
      input('Code', code.code, 3, (v) => change(index, { code: v.toUpperCase() }), { placeholder: 'AR' }),
      input('Name', code.label, 60, (v) => change(index, { label: v }), { placeholder: 'Analysis – relevance' }),
      pills('Group', GROUPS.map((g) => ({ value: g, label: GROUP_LABELS[g] })), code.group, (g) =>
        change(index, { group: g, criterion: g === 'speaking' ? null : (code.criterion ?? 1), key: g === 'speaking' ? code.key : undefined }, true)
      )
    );
    if (code.group !== 'speaking') {
      body.append(
        pills('Rubric criterion', ([1, 2, 3] as Criterion[]).map((n) => ({ value: n, label: CRITERION_LABELS[n] })), code.criterion, (n) => change(index, { criterion: n }, true))
      );
    } else {
      const taken = new Set(codes.filter((c, i) => i !== index && c.key).map((c) => c.key));
      body.append(
        pills(
          'Number key while marking',
          ['1', '2', '3', '4', '5', '6', '7', '8', '9'].filter((k) => !taken.has(k) || k === code.key).map((k) => ({ value: k, label: k })),
          code.key ?? null,
          (k) => change(index, { key: code.key === k ? undefined : k }, true)
        )
      );
    }

    const colour = el('div', 'pf-field');
    colour.append(el('span', 'pf-field__label', 'Colour'));
    const swatches = el('div', 'pa-swatches');
    swatches.setAttribute('role', 'group');
    swatches.setAttribute('aria-label', `Colour for ${code.code || 'this code'}`);
    for (const c of COLOURS) {
      const s = button('', 'ghost', () => change(index, { colour: c }, true));
      s.className = 'pa-swatch';
      s.dataset.colour = c;
      s.setAttribute('aria-label', COLOUR_NAMES[c]);
      s.setAttribute('aria-pressed', String(code.colour === c));
      swatches.append(s);
    }
    colour.append(swatches);
    body.append(colour);

    const descriptor = input('What the student reads', code.descriptor, 600, (v) => change(index, { descriptor: v }), { multiline: true, check: true });
    const strength = input('As a strength (Shift + code, optional)', code.strength_descriptor ?? '', 600, (v) => change(index, { strength_descriptor: v || undefined }), {
      multiline: true,
      placeholder: 'Leave empty to show “Strength: …”',
      check: true
    });
    descriptor.classList.add('pa-bank__wide');
    strength.classList.add('pa-bank__wide');
    const before = drafted.get(code.id);
    if (before !== undefined) descriptor.append(el('p', 'fc-draft__note', before ? `Drafted. It read: “${before}”` : 'Drafted.'));
    body.append(descriptor, strength, skillField(code, index));
    if (code.skill) body.append(ladderField(code, index));
    if (code.group !== 'speaking') {
      body.append(
        pills(
          'Problem it points to (WalkThrus, optional)',
          (Object.keys(PROBLEM_TYPE_LABELS) as CodeProblemType[]).map((t) => ({ value: t, label: PROBLEM_TYPE_LABELS[t] })),
          code.problem_type ?? null,
          (t) => change(index, { problem_type: code.problem_type === t ? undefined : t }, true)
        )
      );
    }

    const setResource = (url: string, title: string): void => {
      const clean = url.trim();
      change(index, { resource: clean ? { kind: /youtu|vimeo|\.mp4/.test(clean) ? 'video' : 'link', url: clean, title: title.trim() } : undefined });
    };
    body.append(
      input('See how link (optional)', code.resource?.url ?? '', 300, (v) => setResource(v, codes[index]?.resource?.title ?? ''), { placeholder: 'https://' }),
      input('See how title', code.resource?.title ?? '', 80, (v) => setResource(codes[index]?.resource?.url ?? '', v), { placeholder: 'Topic sentences' })
    );

    const tools = el('div', 'pa-bank__row-actions pa-bank__wide');
    tools.append(
      button(code.hidden ? 'Show this code' : 'Hide this code', 'ghost', () => change(index, { hidden: code.hidden ? undefined : true }, true)),
      Object.assign(
        button('Remove code', 'ghost', () => {
          codes = codes.filter((_, i) => i !== index);
          openIndex = null;
          dirty = true;
          say('Unsaved changes. Old feedback keeps showing a removed code by its letters.');
          paint();
        }),
        { disabled: codes.length <= 1 }
      )
    );
    body.append(tools);
    item.append(body);
    return item;
  }

  /** The continuum skill the code works on: it links the code to writing boxes tagged with that skill. */
  function skillField(code: FeedbackCode, index: number): HTMLElement {
    const id = `fc-edit-${++seq}`;
    const wrap = el('div', 'pf-field');
    const lab = el('label', 'pf-field__label', 'Skill (optional)');
    lab.htmlFor = id;
    const pick = skillSelect(code.skill ?? '', skills, 'pa-input fc-editor__skill');
    pick.id = id;
    pick.addEventListener('change', () => change(index, { skill: pick.value || undefined }, true));
    wrap.append(lab, el('p', 'pf-field__hint', 'Writing boxes that practise this skill show students this code’s next step.'), pick);
    wrap.classList.add('pa-bank__wide');
    return wrap;
  }

  /** One next step per placement rung, each the step toward the rung above. */
  function ladderField(code: FeedbackCode, index: number): HTMLElement {
    const wrap = el('div', 'pf-field fc-ladder pa-bank__wide');
    wrap.append(
      el('span', 'pf-field__label', 'Ladder: the next step at each rung'),
      el('p', 'pf-field__hint', 'One sentence each, something to do. Writing boxes rewrite these for their own question.')
    );
    const hint = el('p', 'fc-ladder__hint');
    const lines = () => codes[index]?.ladder ?? RUNG_ORDER.map(() => '');
    const showHint = () => {
      const filled = lines().filter((l) => l.trim()).length;
      hint.textContent = filled && filled < RUNG_ORDER.length ? 'Fill all five lines to keep the ladder.' : '';
    };
    RUNG_ORDER.forEach((_, i) => {
      const row = el('div', 'fc-ladder__row');
      const id = `fc-edit-${++seq}`;
      const lab = el('label', 'pf-field__label', rungLabel(i));
      lab.htmlFor = id;
      const box = el('input', 'pa-input');
      box.type = 'text';
      box.id = id;
      box.maxLength = 160;
      box.value = code.ladder?.[i] ?? '';
      box.addEventListener('input', () => {
        const next = [...lines()];
        next[i] = box.value;
        change(index, { ladder: next.every((l) => !l.trim()) ? undefined : next });
        showHint();
      });
      row.append(lab, box, wordingFlag(box, 160));
      wrap.append(row);
    });
    showHint();
    wrap.append(hint);
    return wrap;
  }

  /** Draft ladders: Claude drafts every linked code's ladder and a positive descriptor, for review here. */
  const draftHost = el('div', 'fc-draft pa-bank__wide');
  const draft = button('Draft ladders', 'secondary', async function () {
    if (dirty) {
      say('Save your codes first, so the drafts start from them.');
      return;
    }
    this.disabled = true;
    try {
      say('Working out the cost…');
      const estimate = await estimateNextStepJob({ kind: 'ladders_draft' });
      if (!estimate.codes) {
        say('Give a code a skill first.');
        return;
      }
      say('');
      const ok = await askInline(draftHost, `Draft ladders for ${estimate.codes} ${estimate.codes === 1 ? 'code' : 'codes'}, ${costText(estimate)}. Nothing is saved until you save.`, 'Draft them');
      if (!ok) return;
      say('Drafting ladders…');
      const done = await runNextStepJob<LaddersDone>({ kind: 'ladders_draft' });
      let n = 0;
      for (const d of done.ladders ?? []) {
        const at = codes.findIndex((c) => c.id === d.id);
        if (at === -1 || !codes[at]!.skill) continue;
        if (!drafted.has(d.id)) drafted.set(d.id, codes[at]!.descriptor);
        codes = codes.map((c, i) => (i === at ? { ...c, ladder: d.ladder, ...(d.descriptor ? { descriptor: d.descriptor } : {}) } : c));
        n += 1;
      }
      dirty = n > 0 || dirty;
      paint();
      say(n ? `Ladders drafted for ${n} ${n === 1 ? 'code' : 'codes'}. Open each to check, then Save codes.` : 'No ladders came back. Try again.');
    } catch (error) {
      say(errorText(error), 'error');
    } finally {
      this.disabled = false;
    }
  });
  root.insertBefore(draftHost, status);

  const add = button('Add a code', 'secondary', () => {
    codes = [...codes, { id: '', code: '', label: '', group: 'composition', criterion: 1, colour: 'lilac', descriptor: '' }];
    openIndex = codes.length - 1;
    dirty = true;
    paint();
    rows.querySelector<HTMLInputElement>('.fc-editor__row:last-child input')?.focus();
  });
  const save = button('Save codes', 'primary', async function () {
    this.disabled = true;
    say('Saving…');
    try {
      const saved = await apiPut<{ codes: FeedbackCode[] }>(FEEDBACK_CODES_ENDPOINT, { codes });
      codes = saved.codes;
      primeFeedbackCodes(codes);
      dirty = false;
      drafted.clear();
      paint();
      say('Saved. Every Voice block and annotation uses these now.');
    } catch (error) {
      say(errorText(error), 'error');
    } finally {
      this.disabled = false;
    }
  });
  actions.append(add, draft, save);

  function paint(): void {
    rows.replaceChildren(...codes.map(row));
    add.disabled = codes.length >= MAX_CODES;
  }

  void loadSkills().then(
    (loaded) => {
      skills = loaded;
      // A field being typed in keeps its caret; the open code's skill list fills in on the next repaint.
      if (!rows.contains(document.activeElement)) paint();
    },
    () => undefined
  );

  say('Loading codes…');
  void apiGet<{ codes: FeedbackCode[] }>(FEEDBACK_CODES_ENDPOINT)
    .then((data) => {
      if (dirty) return;
      codes = data.codes;
      paint();
      say('');
    })
    .catch((error) => say(errorText(error), 'error'));
  return root;
}
