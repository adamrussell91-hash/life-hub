import { apiGet, apiPut } from '@/api/client';
import { button, el, errorText } from '@/blocks/peer-feedback-ui';
import type { Code, CodeColour, Resource } from '@/blocks/peer-annotate';

/**
 * The feedback buttons students press in annotate mode. One bank for every
 * lesson, so it is saved on its own (not with the lesson) by its own button.
 * Only the teacher sets resources; students can never add links.
 */

const ENDPOINT = '/api/peer-feedback/bank';
const COLOURS: CodeColour[] = ['blue', 'sage', 'peach', 'gold', 'lilac'];
const COLOUR_NAMES: Record<CodeColour, string> = { blue: 'Blue', sage: 'Green', peach: 'Peach', gold: 'Gold', lilac: 'Purple' };
const MAX_CODES = 12;
type ResourceKind = 'none' | 'link' | 'video' | 'technique';
const KINDS: Array<{ kind: ResourceKind; label: string }> = [
  { kind: 'none', label: 'Nothing' },
  { kind: 'link', label: 'Link' },
  { kind: 'video', label: 'Video' },
  { kind: 'technique', label: 'Technique card' }
];

/** "1:05", "65" or "1:02:03" to seconds. */
export function parseStart(value: string): number | undefined {
  const parts = value.trim().split(':').map((p) => Number(p));
  if (!value.trim() || parts.some((p) => !Number.isFinite(p) || p < 0)) return undefined;
  return parts.reduce((total, p) => total * 60 + p, 0) || undefined;
}

function formatStart(seconds?: number): string {
  if (!seconds) return '';
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

let seq = 0;
function textInput(label: string, value: string, max: number, onInput: (v: string) => void, placeholder = ''): HTMLElement {
  const id = `pa-bank-${++seq}`;
  const wrap = el('div', 'pf-field');
  const lab = el('label', 'pf-field__label', label);
  lab.htmlFor = id;
  const box = el('input', 'pa-input');
  box.id = id;
  box.type = 'text';
  box.value = value;
  box.maxLength = max;
  box.placeholder = placeholder;
  box.addEventListener('input', () => onInput(box.value));
  wrap.append(lab, box);
  return wrap;
}

function pills<T extends string>(label: string, options: Array<{ value: T; label: string }>, current: T, onPick: (v: T) => void): HTMLElement {
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

export function mountBankEditor(): HTMLElement {
  const root = el('section', 'pa-bank');
  root.append(
    el('p', 'pf-field__label', 'Feedback buttons'),
    el('p', 'pf-field__hint', 'Shared by every notes-on-the-text block in every lesson. Students press these; only you set what each one links to.')
  );
  const rows = el('ul', 'pa-bank__rows');
  const status = el('p', 'pa-bank__status');
  status.setAttribute('role', 'status');
  const actions = el('div', 'pf-actions');
  root.append(rows, actions, status);

  let codes: Code[] = [];
  let dirty = false;

  const say = (text: string, tone: 'info' | 'error' = 'info') => {
    status.textContent = text;
    status.dataset.tone = tone;
  };
  const change = (index: number, next: Code, repaint = false) => {
    codes = codes.map((c, i) => (i === index ? next : c));
    dirty = true;
    say('Unsaved changes.');
    if (repaint) paint();
  };

  function row(code: Code, index: number): HTMLElement {
    const item = el('li', 'pa-bank__row');
    item.append(textInput('Label', code.label, 40, (v) => change(index, { ...codes[index]!, label: v })));

    const colour = el('div', 'pf-field');
    colour.append(el('span', 'pf-field__label', 'Colour'));
    const swatches = el('div', 'pa-swatches');
    swatches.setAttribute('role', 'group');
    swatches.setAttribute('aria-label', `Colour for ${code.label || 'this button'}`);
    for (const c of COLOURS) {
      const s = button('', 'ghost', () => change(index, { ...codes[index]!, colour: c }, true));
      s.className = 'pa-swatch';
      s.dataset.colour = c;
      s.setAttribute('aria-label', COLOUR_NAMES[c]);
      s.setAttribute('aria-pressed', String(code.colour === c));
      swatches.append(s);
    }
    colour.append(swatches);
    item.append(colour);

    item.append(
      textInput('Asks the reviewer (optional)', code.ask ?? '', 60, (v) => {
        const next = { ...codes[index]! };
        if (v.trim()) next.ask = v;
        else delete next.ask;
        change(index, next);
      }, 'e.g. Should be:')
    );

    const kind: ResourceKind = code.resource?.kind ?? 'none';
    const resource = pills('The writer also gets', KINDS.map((k) => ({ value: k.kind, label: k.label })), kind, (picked) => {
      const next = { ...codes[index]! };
      if (picked === 'none') delete next.resource;
      else if (picked === 'technique') next.resource = { kind: 'technique' };
      else next.resource = { kind: picked, url: code.resource && 'url' in code.resource ? code.resource.url : '' };
      change(index, next, true);
    });
    resource.classList.add('pa-bank__wide');
    item.append(resource);

    const res = code.resource;
    if (res && res.kind !== 'technique') {
      const update = (patch: Partial<Extract<Resource, { kind: 'link' | 'video' }>>) =>
        change(index, { ...codes[index]!, resource: { ...(codes[index]!.resource as typeof res), ...patch } });
      item.append(textInput('Web address', res.url, 2000, (v) => update({ url: v }), 'https://'));
      item.append(textInput('Title (optional)', res.title ?? '', 120, (v) => update({ title: v })));
      if (res.kind === 'video') item.append(textInput('Start at (optional)', formatStart(res.start), 8, (v) => update({ start: parseStart(v) }), '1:05'));
    } else if (res?.kind === 'technique') {
      const note = el('p', 'pf-field__hint pa-bank__wide', 'The writer gets the technique card for whatever the reviewer types, e.g. “metaphor”. Give this button a question to ask.');
      item.append(note);
    }

    const tools = el('div', 'pa-bank__row-actions pa-bank__wide');
    const remove = button('Remove button', 'ghost', () => {
      codes = codes.filter((_, i) => i !== index);
      dirty = true;
      say('Unsaved changes.');
      paint();
    });
    remove.disabled = codes.length <= 1;
    tools.append(remove);
    item.append(tools);
    return item;
  }

  const add = button('Add a button', 'secondary', () => {
    codes = [...codes, { id: '', label: '', colour: COLOURS[codes.length % COLOURS.length]! }];
    dirty = true;
    paint();
    rows.querySelector<HTMLInputElement>('.pa-bank__row:last-child input')?.focus();
  });
  const save = button('Save buttons', 'primary', async function () {
    this.disabled = true;
    say('Saving…');
    try {
      const saved = await apiPut<{ codes: Code[] }>(ENDPOINT, { codes });
      codes = saved.codes;
      dirty = false;
      paint();
      say('Saved. Every notes-on-the-text block uses these now.');
    } catch (error) {
      say(errorText(error), 'error');
    } finally {
      this.disabled = false;
    }
  });
  actions.append(add, save);

  function paint(): void {
    rows.replaceChildren(...codes.map(row));
    add.disabled = codes.length >= MAX_CODES;
  }

  say('Loading buttons…');
  void apiGet<{ codes: Code[] }>(ENDPOINT)
    .then((data) => {
      if (dirty) return;
      codes = data.codes;
      paint();
      say('');
    })
    .catch((error) => say(errorText(error), 'error'));
  return root;
}
