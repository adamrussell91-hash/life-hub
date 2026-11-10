import { el } from '@/blocks/peer-feedback-ui';
import { TIER_NAMES, choiceSettings, ruleApplies, ruleText, type ChoiceRule, type ChoiceSettings } from './model';
import type { ChoiceBoardBlock, ChoiceTile } from './shared';
import './choice-board.css';

/** A choice board holds up to nine tiles (3 × 3); Panels shown as tabs or folds keep eight. */
export const CHOICE_TILES_MAX = 9;

let seq = 0;

function selectField(label: string, options: Array<{ value: string; label: string; disabled?: boolean }>, value: string, onPick: (v: string) => void): { wrap: HTMLElement; select: HTMLSelectElement } {
  const id = `cb-ed-${++seq}`;
  const wrap = el('div', 'pf-field cb-editor__field');
  const lab = el('label', 'pf-field__label', label);
  lab.htmlFor = id;
  const select = el('select', 'pf-field__input cb-editor__select');
  select.id = id;
  fillOptions(select, options, value);
  select.addEventListener('change', () => onPick(select.value));
  wrap.append(lab, select);
  return { wrap, select };
}

function fillOptions(select: HTMLSelectElement, options: Array<{ value: string; label: string; disabled?: boolean }>, value: string): void {
  select.replaceChildren(
    ...options.map((o) => {
      const opt = el('option', '', o.label);
      opt.value = o.value;
      opt.disabled = Boolean(o.disabled);
      return opt;
    })
  );
  select.value = value;
}

const RULE_LABELS: Record<ChoiceRule, string> = {
  none: 'None',
  each_column: 'One from each column',
  line: 'A line'
};

/**
 * Settings for a Panels block shown as a choice board: pick N, tiles per row
 * and the rule. `refresh` re-reads the block after tiles are added or removed.
 */
export function createChoiceSettingsEditor(
  read: () => ChoiceBoardBlock,
  onChange: (choice: ChoiceSettings) => void
): { el: HTMLElement; refresh: () => void } {
  const root = el('div', 'cb-editor');
  root.setAttribute('role', 'group');
  root.setAttribute('aria-label', 'Choice board settings');
  const row = el('div', 'cb-editor__row');
  const hint = el('p', 'pf-field__hint block-secondary cb-editor__hint');
  const preview = el('p', 'cb-editor__preview');
  preview.setAttribute('aria-live', 'polite');

  const current = (): ChoiceSettings => choiceSettings(read().content.choice, read().content.tabs.length);
  const emit = (patch: Partial<ChoiceSettings>): void => {
    // The rule is kept even when the board can't use it yet; ruleApplies decides that at run time.
    onChange({ ...current(), ...patch });
    refresh();
  };

  const pick = selectField('Students pick', [], '3', (v) => emit({ pick: Number(v) }));
  const columns = selectField('Tiles per row', [2, 3, 4].map((n) => ({ value: String(n), label: String(n) })), '3', (v) => emit({ columns: Number(v) }));
  const rule = selectField('Rule', [], 'none', (v) => emit({ rule: v as ChoiceRule }));
  row.append(pick.wrap, columns.wrap, rule.wrap);
  root.append(row, hint, preview);

  function refresh(): void {
    const block = read();
    const tiles = block.content.tabs.length;
    const settings = current();
    const chosenRule: ChoiceRule = block.content.choice?.rule ?? 'none';
    const lineFits = tiles === 9 && settings.columns === 3;
    fillOptions(pick.select, Array.from({ length: tiles }, (_, i) => ({ value: String(i + 1), label: `${i + 1} of ${tiles}` })), String(settings.pick));
    columns.select.value = String(settings.columns);
    fillOptions(
      rule.select,
      (['none', 'each_column', 'line'] as const).map((value) => ({
        value,
        label: value === 'line' && !lineFits ? `${RULE_LABELS.line} (needs a 3 × 3 board)` : RULE_LABELS[value],
        disabled: value === 'line' && !lineFits && chosenRule !== 'line'
      })),
      chosenRule
    );
    const checked = { ...settings, rule: chosenRule };
    if (chosenRule === 'line' && !ruleApplies(checked, tiles)) {
      hint.textContent = lineFits
        ? 'A line needs at least 3 picks. Until then students just pick.'
        : 'A line needs a 3 × 3 board: nine tiles, three per row. Until then students just pick.';
    } else if (chosenRule === 'each_column' && !ruleApplies(checked, tiles)) {
      hint.textContent = `One from each column needs at least ${Math.min(settings.columns, tiles)} picks. Until then students just pick.`;
    } else if (!lineFits) {
      hint.textContent = 'A line is offered on a 3 × 3 board: nine tiles, three per row.';
    } else {
      hint.textContent = '';
    }
    hint.hidden = !hint.textContent;
    preview.textContent = `Students see: ${ruleText(checked, tiles)}`;
  }

  refresh();
  return { el: root, refresh };
}

/** A tile's level and type, shown above its blocks in the panel editor. */
export function createChoiceTileFields(tile: ChoiceTile, onPatch: (patch: Partial<Pick<ChoiceTile, 'tier' | 'kind'>>) => void): HTMLElement {
  const row = el('div', 'cb-editor__row cb-editor__tile');
  const level = selectField(
    'Level',
    TIER_NAMES.map((name, i) => ({ value: String(i + 1), label: name })),
    String(tile.tier ?? 1),
    (v) => onPatch({ tier: Number(v) as 1 | 2 | 3 })
  );
  const id = `cb-ed-${++seq}`;
  const wrap = el('div', 'pf-field cb-editor__field');
  const lab = el('label', 'pf-field__label', 'Type');
  lab.htmlFor = id;
  const box = el('input', 'pf-field__input');
  box.id = id;
  box.type = 'text';
  box.maxLength = 40;
  box.value = tile.kind ?? '';
  box.placeholder = 'Write, Analyse, Create…';
  box.addEventListener('input', () => onPatch({ kind: box.value.trim() ? box.value : undefined }));
  wrap.append(lab, box);
  row.append(level.wrap, wrap);
  return row;
}
