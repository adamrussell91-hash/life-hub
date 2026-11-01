import type { Block } from '@/schemas/block';
import { evidenceStepOf, piecesTaught, targetPieces, withEvidenceStep, withPiecesTaught, withTargetPieces, type EvidenceStep } from './block-tags';
import { STEP_LABEL, type DeepUnderstanding, type PlacedStep } from './schema';
import './block-menu.css';

export type DeepSheetResult = { taught: string[]; step: EvidenceStep | null; targets: string[] };
type Ask = (block: Block, deep: DeepUnderstanding[]) => Promise<DeepSheetResult | null>;

const PLACED: PlacedStep[] = ['2a', '2b', '3', '4'];

/** The block menu's "Deep understanding…" item: what this block teaches, whether it's a step's evidence task, and its target pieces. */
export function deepMenuItems(block: Block | (() => Block), deep: DeepUnderstanding[], onChange: (next: Block) => void, deps: { ask?: Ask } = {}) {
  if (!deep.length) return [];
  const ask = deps.ask ?? askDeepSheet;
  // A getter keeps the sheet on the block's latest tags: the menu outlives edits made through it.
  const current = (): Block => (typeof block === 'function' ? block() : block);
  return [{
    label: 'Deep understanding…',
    dataset: { blockAction: 'deep' },
    onSelect: async () => {
      const block = current();
      const result = await ask(block, deep);
      if (!result) return;
      onChange(withTargetPieces(withEvidenceStep(withPiecesTaught(block, result.taught), result.step), result.targets));
    }
  }];
}

/** "Teaches 2 pieces · Evidence for DU 1 Step 2A", or '' when the block has no tags. */
export function deepBlockLine(block: Block, deep: readonly DeepUnderstanding[]): string {
  if (!deep.length) return '';
  const parts: string[] = [];
  const known = new Set(deep.flatMap((d) => d.pieces.map((p) => p.id)));
  const taught = piecesTaught(block).filter((id) => known.has(id));
  if (taught.length) parts.push(`Teaches ${taught.length} ${taught.length === 1 ? 'piece' : 'pieces'}`);
  const step = evidenceStepOf(block);
  const n = step ? deep.findIndex((d) => d.id === step.du) : -1;
  if (step && n >= 0) parts.push(`Evidence for DU ${n + 1} Step ${STEP_LABEL[step.step]}`);
  return parts.join(' · ');
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** A pill that is a real checkbox or radio underneath. */
function pill(type: 'checkbox' | 'radio', name: string, value: string, text: string, checked: boolean, tier?: string): { label: HTMLLabelElement; input: HTMLInputElement } {
  const label = el('label', 'du-sheet__pill');
  const input = Object.assign(document.createElement('input'), { type, name, value, checked });
  label.append(input, el('span', 'du-sheet__pill-text', text));
  if (tier) label.append(el('span', 'du-sheet__tier', tier));
  return { label, input };
}

/** The sheet itself: three parts, pre-filled from the block's tags. Resolves null on cancel. */
export function askDeepSheet(block: Block, deep: DeepUnderstanding[]): Promise<DeepSheetResult | null> {
  return new Promise((resolve) => {
    const dialog = el('dialog', 'du-sheet');
    dialog.setAttribute('aria-label', 'Deep understanding');
    const form = el('form', 'du-sheet__form');
    form.method = 'dialog';

    const taught = new Set(piecesTaught(block));
    const targets = new Set(targetPieces(block));
    const step = evidenceStepOf(block);

    // 1. What this block teaches.
    const teaches = el('fieldset', 'du-sheet__part');
    teaches.append(el('legend', 'du-sheet__title', 'This block teaches'));
    const taughtInputs: HTMLInputElement[] = [];
    for (const [n, du] of deep.entries()) {
      const group = el('div', 'du-sheet__group');
      group.append(el('p', 'du-sheet__heading', `DU ${n + 1} · ${du.claim}`));
      const row = el('div', 'du-sheet__pills');
      for (const piece of du.pieces) {
        const { label, input } = pill('checkbox', 'taught', piece.id, piece.text, taught.has(piece.id), piece.tier);
        taughtInputs.push(input);
        row.append(label);
      }
      group.append(row);
      teaches.append(group);
    }

    // 2. Evidence task for a step.
    const evidence = el('fieldset', 'du-sheet__part');
    evidence.append(el('legend', 'du-sheet__title', 'This is the evidence task for'));
    const stepRow = el('div', 'du-sheet__pills');
    const none = pill('radio', 'step', '', 'Nothing', !step);
    stepRow.append(none.label);
    const stepInputs: HTMLInputElement[] = [none.input];
    for (const [n, du] of deep.entries()) {
      for (const s of PLACED) {
        const on = !!step && step.du === du.id && step.step === s;
        const { label, input } = pill('radio', 'step', `${du.id}|${s}`, `DU ${n + 1} · Step ${STEP_LABEL[s]}`, on);
        stepInputs.push(input);
        stepRow.append(label);
      }
    }
    evidence.append(stepRow);

    // 3. Pieces to look for (only with a step).
    const lookFor = el('fieldset', 'du-sheet__part');
    lookFor.append(el('legend', 'du-sheet__title', 'Pieces to look for in this writing (2–3)'));
    const lookRow = el('div', 'du-sheet__pills');
    const lookInputs: HTMLInputElement[] = [];
    for (const du of deep.flatMap((d) => d.pieces)) {
      const { label, input } = pill('checkbox', 'target', du.id, du.text, targets.has(du.id));
      lookInputs.push(input);
      lookRow.append(label);
    }
    lookFor.append(lookRow);

    const chosenStep = (): EvidenceStep | null => {
      const v = stepInputs.find((i) => i.checked)?.value;
      if (!v) return null;
      const [duId, s] = v.split('|');
      return { du: duId!, step: s as PlacedStep };
    };
    const syncLookFor = (): void => { lookFor.hidden = !chosenStep(); };
    for (const i of stepInputs) i.addEventListener('change', syncLookFor);
    for (const i of lookInputs) {
      i.addEventListener('change', () => {
        if (lookInputs.filter((x) => x.checked).length > 3) i.checked = false;
      });
    }
    syncLookFor();

    const actions = el('div', 'du-sheet__actions');
    const save = Object.assign(el('button', 'btn btn--primary', 'Save'), { type: 'button' });
    const cancel = Object.assign(el('button', 'btn', 'Cancel'), { type: 'button' });
    actions.append(cancel, save);
    form.append(teaches, evidence, lookFor, actions);
    dialog.append(form);

    let result: DeepSheetResult | null = null;
    save.addEventListener('click', () => {
      const s = chosenStep();
      result = {
        taught: taughtInputs.filter((i) => i.checked).map((i) => i.value),
        step: s,
        targets: s ? lookInputs.filter((i) => i.checked).map((i) => i.value) : []
      };
      dialog.close();
    });
    cancel.addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => {
      dialog.remove();
      resolve(result);
    });
    document.body.append(dialog);
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
  });
}
