import { button, el, field } from '@/blocks/peer-feedback-ui';
import type { VennBlock } from './index';

type Content = VennBlock['content'];

export const MAX_PRELOAD = 12;

let seq = 0;

function input(label: string, value: string, max: number, onInput: (v: string) => void, placeholder = ''): HTMLElement {
  const id = `venn-ed-${++seq}`;
  const wrap = el('div', 'pf-field');
  const lab = el('label', 'pf-field__label', label);
  lab.htmlFor = id;
  const box = el('input', 'pf-field__input');
  box.id = id;
  box.type = 'text';
  box.maxLength = max;
  box.value = value;
  box.placeholder = placeholder;
  box.addEventListener('input', () => onInput(box.value));
  wrap.append(lab, box);
  return wrap;
}

function toggle(label: string, checked: boolean, onChange: (on: boolean) => void): HTMLElement {
  const wrap = el('label', 'pf-switch');
  const box = el('input');
  box.type = 'checkbox';
  box.checked = checked;
  box.addEventListener('change', () => onChange(box.checked));
  wrap.append(box, el('span', '', label));
  return wrap;
}

const TEXT_PLACEHOLDERS = ['The Tide Clock (poem)', 'Salt Roads (film)', 'A third text'];

export function createVennEditor(block: VennBlock, onChange: (b: VennBlock) => void): HTMLElement {
  const root = el('div', 'peer-feedback peer-feedback--editor venn-editor');
  let current = block;
  const set = (patch: Partial<Content>) => {
    current = { ...current, content: { ...current.content, ...patch } };
    onChange(current);
  };

  // Prompt
  const prompt = field('Prompt', 'The comparison students make.');
  prompt.input.rows = 2;
  prompt.input.maxLength = 600;
  prompt.input.value = current.content.prompt;
  prompt.input.placeholder = 'How do The Tide Clock and Salt Roads show people waiting for someone to come home?';
  prompt.input.addEventListener('input', () => set({ prompt: prompt.input.value }));

  // Texts
  const textsBox = el('div', 'cl-editor__group');
  const textsList = el('div', 'venn-editor__texts');
  const paintTexts = () => {
    const texts = current.content.texts;
    const rows = texts.map((t, i) => {
      const row = el('div', 'venn-editor__text');
      row.append(el('b', `venn-legend__letter venn-legend__letter--${'abc'[i]}`, 'ABC'[i]!));
      row.append(input(`Text ${'ABC'[i]}`, t.label, 80, (v) => set({ texts: current.content.texts.map((x, j) => (j === i ? { label: v } : x)) }), TEXT_PLACEHOLDERS[i]));
      if (i === 2) {
        const remove = button('×', 'ghost', () => {
          set({ texts: current.content.texts.slice(0, 2) });
          paintTexts();
        });
        remove.className = 'cl-editor__remove';
        remove.setAttribute('aria-label', 'Remove the third text');
        row.append(remove);
      }
      return row;
    });
    const parts: HTMLElement[] = [...rows];
    if (texts.length < 3) {
      parts.push(button('+ Add a third text', 'ghost', () => {
        set({ texts: [...current.content.texts, { label: '' }] });
        paintTexts();
        textsList.querySelector<HTMLInputElement>('.venn-editor__text:last-of-type input')?.focus();
      }));
    }
    textsList.replaceChildren(...parts);
  };
  textsBox.append(el('p', 'pf-field__label', 'Texts'), textsList);
  paintTexts();

  // Points to sort
  const preloadBox = el('div', 'cl-editor__group');
  const list = el('div', 'cl-editor__statements');
  const countLabel = el('span', 'block-secondary');
  const add = button('+ Add a point to sort', 'ghost', () => {
    if (current.content.preload.length >= MAX_PRELOAD) return;
    set({ preload: [...current.content.preload, { id: `${current.id}_p${Date.now().toString(36)}${++seq}`, text: '' }] });
    paintPreload();
    list.querySelector<HTMLInputElement>('.cl-editor__statement:last-child input')?.focus();
  });
  const paintPreload = () => {
    const all = current.content.preload;
    countLabel.textContent = ` ${all.length} of ${MAX_PRELOAD}`;
    add.hidden = all.length >= MAX_PRELOAD;
    list.replaceChildren(...all.map((p, i) => {
      const row = el('div', 'cl-editor__statement');
      const text = el('input', 'pf-field__input');
      text.type = 'text';
      text.maxLength = 300;
      text.value = p.text;
      text.placeholder = i === 0 ? 'A clock that stops at the moment of loss' : 'Another point for students to place';
      text.setAttribute('aria-label', `Point to sort ${i + 1}`);
      text.addEventListener('input', () => set({ preload: current.content.preload.map((x) => (x.id === p.id ? { ...x, text: text.value } : x)) }));
      const remove = button('×', 'ghost', () => {
        set({ preload: current.content.preload.filter((x) => x.id !== p.id) });
        paintPreload();
      });
      remove.className = 'cl-editor__remove';
      remove.setAttribute('aria-label', `Remove point to sort ${i + 1}`);
      row.append(el('b', 'cl-editor__num', String(i + 1)), text, remove);
      return row;
    }));
  };
  const preloadHead = el('p', 'pf-field__label', 'Points to sort (optional)');
  preloadHead.append(countLabel);
  preloadBox.append(
    preloadHead,
    el('p', 'pf-field__hint block-secondary', 'Students start by placing these in the Venn, then tag them and add their own. A gentler start for a new comparison.'),
    list,
    add
  );
  paintPreload();

  // Synthesis frame
  const frame = field('Synthesis frame', 'The sentence students finish in the centre. A, B and C become the text names.');
  frame.input.rows = 2;
  frame.input.maxLength = 300;
  frame.input.value = current.content.synthesis_frame;
  frame.input.placeholder = 'Both … explore …, but where A …, B …';
  frame.input.addEventListener('input', () => set({ synthesis_frame: frame.input.value }));

  const nudgeBox = el('div', 'cl-editor__group');
  nudgeBox.append(
    toggle('Suggest deep points', current.content.nudge, (on) => set({ nudge: on })),
    el('p', 'pf-field__hint block-secondary', 'When surface points (plot, feature) outnumber deep ones (idea, concept, purpose), students see a prompt to add a deep point.')
  );

  root.append(
    prompt.wrap,
    textsBox,
    preloadBox,
    frame.wrap,
    nudgeBox,
    el('p', 'pf-note block-secondary', 'Publish the lesson and students build their own Venn. Their Venns arrive on this block.')
  );
  return root;
}
