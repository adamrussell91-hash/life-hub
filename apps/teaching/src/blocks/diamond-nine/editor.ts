import { el } from '@/blocks/peer-feedback-ui';
import { LETTERS, cardReady, type DiamondCard, type DiamondNineBlock } from './shared';

type Content = DiamondNineBlock['content'];

let seq = 0;

function input(label: string, value: string, max: number, onInput: (v: string) => void, placeholder = ''): HTMLElement {
  const id = `d9-ed-${++seq}`;
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

/** Nine card rows, filling any gaps with empty text cards (ids unique within the block). */
function nineCards(block: DiamondNineBlock): DiamondCard[] {
  const cards = block.content.cards.slice(0, 9).map((c) => ({ ...c }));
  const used = new Set(cards.map((c) => c.id));
  let n = 1;
  while (cards.length < 9) {
    while (used.has(`${block.id}_c${n}`)) n += 1;
    const id = `${block.id}_c${n}`;
    used.add(id);
    cards.push({ id, kind: 'text', text: '' });
  }
  return cards;
}

const KINDS: Array<{ value: DiamondCard['kind']; label: string }> = [
  { value: 'text', label: 'Text' },
  { value: 'quote', label: 'Quote' },
  { value: 'image', label: 'Picture' }
];

export function createDiamondNineEditor(block: DiamondNineBlock, onChange: (b: DiamondNineBlock) => void): HTMLElement {
  const root = el('div', 'peer-feedback peer-feedback--editor d9-editor');
  let current: DiamondNineBlock = { ...block, content: { ...block.content, cards: nineCards(block) } };
  const count = el('span', 'd9-editor__count block-secondary');
  const paintCount = () => {
    const ready = current.content.cards.filter(cardReady).length;
    count.textContent = `${ready} of 9 cards ready`;
  };
  const set = (patch: Partial<Content>) => {
    current = { ...current, content: { ...current.content, ...patch } };
    paintCount();
    onChange(current);
  };

  // Title and criteria
  const top = el('div', 'd9-editor__group');
  top.append(
    input('Title (optional)', current.content.title, 200, (v) => set({ title: v }), 'The Tide Clock: what matters most?'),
    input('Rank by', current.content.criterion, 200, (v) => set({ criterion: v }), 'Most significant to the poem’s meaning'),
    el('p', 'pf-field__hint block-secondary', 'Start with “Most …” and the diamond labels its ends “Most …” and “Least …”.'),
    input('Second criterion (optional)', current.content.second_criterion, 200, (v) => set({ second_criterion: v }), 'Most surprising to a first-time reader'),
    el('p', 'pf-field__hint block-secondary', 'Students rank the same cards again by this, starting from their first diamond.')
  );

  // Cards
  const cardsBox = el('div', 'd9-editor__group');
  const list = el('div', 'd9-editor__cards');
  const cardRow = (card: DiamondCard, i: number): HTMLElement => {
    const row = el('div', 'd9-editor__card');
    const letter = LETTERS[i] ?? '?';
    const update = (patch: Partial<DiamondCard>) => {
      set({ cards: current.content.cards.map((c) => (c.id === card.id ? { ...c, ...patch } : c)) });
    };
    const fields = el('div', 'd9-editor__fields');
    const paintFields = () => {
      const now = current.content.cards.find((c) => c.id === card.id) ?? card;
      const parts: HTMLElement[] = [];
      if (now.kind === 'image') {
        parts.push(input(`Card ${letter} picture link`, now.url ?? '', 2000, (v) => update({ url: v }), 'https://'));
        parts.push(input(`Card ${letter} description`, now.alt_text ?? '', 300, (v) => update({ alt_text: v }), 'What the picture shows'));
        parts.push(input(`Card ${letter} caption (optional)`, now.text, 300, (v) => update({ text: v })));
      } else {
        parts.push(input(now.kind === 'quote' ? `Card ${letter} quotation` : `Card ${letter}`, now.text, 300, (v) => update({ text: v }),
          now.kind === 'quote' ? 'the clock that counts in salt' : 'The repeated image of the tide'));
        if (now.kind === 'quote') parts.push(input(`Card ${letter} source (optional)`, now.source ?? '', 120, (v) => update({ source: v }), 'Stanza 2'));
      }
      fields.replaceChildren(...parts);
    };
    const kindId = `d9-ed-${++seq}`;
    const kindWrap = el('div', 'pf-field d9-editor__kind');
    const kindLab = el('label', 'pf-field__label', 'Kind');
    kindLab.htmlFor = kindId;
    const kind = el('select', 'pf-field__input');
    kind.id = kindId;
    for (const k of KINDS) {
      const o = el('option', '', k.label);
      o.value = k.value;
      kind.append(o);
    }
    kind.value = card.kind;
    kind.addEventListener('change', () => {
      update({ kind: kind.value as DiamondCard['kind'] });
      paintFields();
    });
    kindWrap.append(kindLab, kind);
    paintFields();
    row.append(el('b', 'd9-letter', letter), kindWrap, fields);
    return row;
  };
  list.append(...current.content.cards.map(cardRow));
  const cardsHead = el('p', 'pf-field__label', 'Cards ');
  cardsHead.append(count);
  cardsBox.append(
    cardsHead,
    el('p', 'pf-field__hint block-secondary', 'Nine cards: words, quotations or pictures. Students see them lettered A to I.'),
    list
  );
  paintCount();

  // Options
  const options = el('div', 'd9-editor__group');
  options.append(
    el('p', 'pf-field__label', 'Options'),
    toggle('Wildcard card: a student can swap one card for their own', current.content.wildcard, (on) => set({ wildcard: on })),
    toggle('Offer Because, but, so for the top and bottom reasons', current.content.frame, (on) => set({ frame: on })),
    toggle('Re-rank round: students rank again after the discussion and say what changed their mind', current.content.rerank, (on) => set({ rerank: on }))
  );

  root.append(top, cardsBox, options, el('p', 'pf-note block-secondary', 'Students rank alone first. The class diamond opens for each student once they send theirs.'));
  return root;
}
