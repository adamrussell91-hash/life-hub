import { loadSkills } from '@/skills/api';
import type { SkillsContinuum } from '@/skills/schema';
import { PASS_CHECKS, STEPS_ON_BLOCK, type TaggedStep } from './block-tags';
import type { DeepUnderstanding } from './schema';
import { pieceLayout, rubricLine, skillLayout, stepOptions, type PieceChip, type SkillChip } from './tag-model';
import '@/styles/next-step-teacher.css';
import './tag-row.css';

/**
 * "What does this check?": one row for anything a student submits. The same
 * component sits under a quiz question and in the block menu's sheet.
 * Chips are real buttons. The lesson's picks (and the pieces and skills of a
 * chosen DU step) show first; everything else opens under "More".
 */

export type TagRowValue = { steps: TaggedStep[]; skills: string[]; pieces: string[] };

export type TagRowOptions = {
  value: TagRowValue;
  deep: readonly DeepUnderstanding[];
  /** Which parts this work takes. Pieces: one for auto-marked work, several for written work. */
  parts: { steps: boolean; skills: boolean; pieces: 'one' | 'several' | false };
  picks?: { pieces?: readonly string[]; skills?: readonly string[] };
  /** Pieces already taught, so they sit ahead of untaught ones in the full list. */
  taught?: ReadonlySet<string>;
  /** Show the line under the row about what the marking rubric will hold (written work). */
  rubric?: boolean;
  /** Skills allowed on one item. */
  skillMax?: number;
  /** Pieces allowed when several. */
  pieceMax?: number;
  heading?: string | false;
  onChange: (next: TagRowValue) => void;
};

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
};

export function mountTagRow(options: TagRowOptions): { root: HTMLElement; update(value: TagRowValue): void } {
  let value: TagRowValue = { steps: options.value.steps.map((s) => ({ ...s })), skills: [...options.value.skills], pieces: [...options.value.pieces] };
  let continuum: SkillsContinuum | null = null;
  let moreSkills = false;
  let morePieces: boolean | null = null; // null: open only when nothing is suggested
  let addingStep = false;
  const skillMax = options.skillMax ?? 3;
  const pieceMax = options.parts.pieces === 'one' ? 1 : options.pieceMax ?? 3;
  const root = el('section', 'tg');
  root.setAttribute('aria-label', 'What does this check?');

  const emit = (): void => options.onChange({ steps: value.steps.map((s) => ({ ...s })), skills: [...value.skills], pieces: [...value.pieces] });
  const stepDus = (): string[] => value.steps.map((s) => s.du);
  const duNumber = (id: string): number => options.deep.findIndex((d) => d.id === id) + 1;

  function chip(label: string, key: string, on: boolean, onClick: () => void): HTMLButtonElement {
    const b = el('button', `tg-chip${on ? ' tg-chip--on' : ''}`, label);
    b.type = 'button';
    b.dataset.key = key;
    b.setAttribute('aria-pressed', String(on));
    b.addEventListener('click', () => {
      onClick();
      paint(key);
    });
    return b;
  }
  const toggler = (label: string, expanded: boolean, onClick: () => void, key: string): HTMLButtonElement => {
    const b = el('button', 'tg-chip tg-chip--add', label);
    b.type = 'button';
    b.dataset.key = key;
    b.setAttribute('aria-expanded', String(expanded));
    b.addEventListener('click', () => {
      onClick();
      paint(key);
    });
    return b;
  };
  const part = (title: string, hint?: string): HTMLElement => {
    const wrap = el('div', 'tg-part');
    wrap.append(el('h4', 'tg-part__title', title));
    if (hint) wrap.append(el('p', 'tg-hint', hint));
    return wrap;
  };

  /* ── DU step ── */
  function stepsPart(): HTMLElement {
    const wrap = part('DU step', 'Optional. Sets the chips below: that deep understanding’s pieces and skills come first.');
    const row = el('div', 'tg-chips');
    const options_ = stepOptions(options.deep);
    for (const s of value.steps) {
      const label = options_.find((o) => o.du === s.du && o.step === s.step)?.label ?? `DU ${duNumber(s.du) || '?'} · Step ${s.step.toUpperCase()}`;
      row.append(chip(label, `step:${s.du}:${s.step}`, true, () => {
        value = { ...value, steps: value.steps.filter((x) => !(x.du === s.du && x.step === s.step)) };
        emit();
      }));
    }
    const free = options_.filter((o) => !value.steps.some((s) => s.du === o.du && s.step === o.step));
    if (free.length && value.steps.length < STEPS_ON_BLOCK) {
      row.append(toggler(value.steps.length ? '+ Another step' : '+ DU step', addingStep, () => { addingStep = !addingStep; }, 'step:add'));
    }
    wrap.append(row);
    if (addingStep) {
      const list = el('div', 'tg-chips tg-chips--list');
      for (const o of free) {
        list.append(chip(o.label, `step:${o.du}:${o.step}`, false, () => {
          value = { ...value, steps: [...value.steps, { du: o.du, step: o.step, checks: [] }] };
          addingStep = false;
          emit();
        }));
      }
      wrap.append(list);
    }
    for (const s of value.steps) wrap.append(checksBox(s));
    return wrap;
  }

  function checksBox(step: TaggedStep): HTMLElement {
    const label = el('label', 'tg-checks');
    label.append(el('span', 'tg-checks__label', `To pass DU ${duNumber(step.du) || '?'} Step ${step.step.toUpperCase()}, listen or look for (one per line)`));
    const box = el('textarea', 'tg-checks__box');
    box.rows = 3;
    box.maxLength = PASS_CHECKS.max * (PASS_CHECKS.length + 1);
    box.value = step.checks.join('\n');
    box.addEventListener('input', () => {
      value = { ...value, steps: value.steps.map((s) => (s.du === step.du && s.step === step.step ? { ...s, checks: box.value.split('\n') } : s)) };
      emit();
    });
    label.append(box);
    return label;
  }

  /* ── Skills ── */
  function skillsPart(): HTMLElement {
    const wrap = part('Skills', `Up to ${skillMax}. Each gets its own rung on the rubric.`);
    const layout = skillLayout(continuum, options.deep, { picks: options.picks?.skills, stepDus: stepDus() });
    const names = new Map([...layout.suggested, ...layout.groups.flatMap((g) => g.skills)].map((c) => [c.ref, c.name]));
    const full = value.skills.length >= skillMax;
    const toggle = (c: SkillChip): HTMLButtonElement => {
      const on = value.skills.includes(c.ref);
      const b = chip(c.name, `skill:${c.ref}`, on, () => {
        value = { ...value, skills: on ? value.skills.filter((r) => r !== c.ref) : [...value.skills, c.ref].slice(0, skillMax) };
        emit();
      });
      b.disabled = !on && full;
      return b;
    };
    const row = el('div', 'tg-chips');
    const shown = new Set<string>();
    for (const c of layout.suggested) { row.append(toggle(c)); shown.add(c.ref); }
    // A saved skill that isn't on offer stays visible, by name or id.
    for (const ref of value.skills.filter((r) => !shown.has(r))) {
      row.append(toggle({ ref, name: names.get(ref) ?? ref, strand: '' }));
      shown.add(ref);
    }
    const open = moreSkills || !layout.suggested.length;
    if (layout.groups.length) row.append(toggler(open ? 'Fewer skills' : 'More skills', open, () => { moreSkills = !open; }, 'skill:more'));
    else if (!continuum) row.append(el('span', 'tg-hint', 'Skills are loading…'));
    wrap.append(row);
    if (open) wrap.append(groupsList(layout.groups.map((g) => ({ title: g.strand, chips: g.skills.filter((c) => !shown.has(c.ref)).map(toggle) }))));
    return wrap;
  }

  /* ── Pieces ── */
  function piecesPart(): HTMLElement {
    const one = options.parts.pieces === 'one';
    const wrap = part(
      one ? 'Piece' : 'Pieces you expect them to use',
      one ? 'One piece, because one right or wrong can’t split between two.' : `Up to ${pieceMax}. Marked used or missed.`
    );
    const layout = pieceLayout(options.deep, { picks: options.picks?.pieces, taught: options.taught, stepDus: stepDus() });
    const known = new Map([...layout.suggested, ...layout.groups.flatMap((g) => g.pieces)].map((c) => [c.id, c]));
    const toggle = (c: PieceChip): HTMLButtonElement => {
      const on = value.pieces.includes(c.id);
      const b = chip(c.text, `piece:${c.id}`, on, () => {
        if (one) value = { ...value, pieces: on ? value.pieces.filter((id) => id !== c.id) : [c.id] };
        else value = { ...value, pieces: on ? value.pieces.filter((id) => id !== c.id) : [...value.pieces, c.id].slice(0, pieceMax) };
        emit();
      });
      b.disabled = !one && !on && value.pieces.length >= pieceMax;
      return b;
    };
    const row = el('div', 'tg-chips');
    const shown = new Set<string>();
    for (const c of layout.suggested) { row.append(toggle(c)); shown.add(c.id); }
    // Chosen pieces stay on the row, including ones from an older tagging.
    for (const id of value.pieces.filter((p) => !shown.has(p))) {
      row.append(toggle(known.get(id) ?? { id, text: 'A piece no longer in the plan', tier: '', du: 0 }));
      shown.add(id);
    }
    const open = morePieces ?? !layout.suggested.length;
    if (layout.groups.length) row.append(toggler(open ? 'Fewer pieces' : 'More pieces', open, () => { morePieces = !open; }, 'piece:more'));
    wrap.append(row);
    if (open) wrap.append(groupsList(layout.groups.map((g) => ({ title: `DU ${g.du} · ${g.claim || 'No claim yet'}`, chips: g.pieces.filter((c) => !shown.has(c.id)).map(toggle) }))));
    return wrap;
  }

  function groupsList(groups: Array<{ title: string; chips: HTMLElement[] }>): HTMLElement {
    const wrap = el('div', 'tg-groups');
    for (const g of groups.filter((x) => x.chips.length)) {
      const group = el('div', 'tg-group');
      group.setAttribute('role', 'group');
      group.setAttribute('aria-label', g.title);
      const list = el('div', 'tg-chips');
      list.append(...g.chips);
      group.append(el('p', 'tg-group__title', g.title), list);
      wrap.append(group);
    }
    return wrap;
  }

  function paint(focusKey?: string): void {
    root.replaceChildren();
    if (options.heading !== false) root.append(el('h3', 'tg-title', options.heading ?? 'What does this check?'));
    if (options.parts.steps && options.deep.length) root.append(stepsPart());
    if (options.parts.skills) root.append(skillsPart());
    if (options.parts.pieces && options.deep.length) root.append(piecesPart());
    if (options.rubric) {
      const line = el('p', 'tg-rubric', rubricLine({ skills: value.skills.length, pieces: value.pieces.length, steps: value.steps.length }));
      line.setAttribute('aria-live', 'polite');
      root.append(line);
    }
    if (focusKey) {
      for (const b of root.querySelectorAll<HTMLElement>('[data-key]')) {
        if (b.dataset.key === focusKey) {
          b.focus();
          break;
        }
      }
    }
  }

  paint();
  if (options.parts.skills) {
    void loadSkills().then(
      (loaded) => {
        continuum = loaded;
        paint();
      },
      () => undefined
    );
  }
  return {
    root,
    update(next) {
      value = { steps: next.steps.map((s) => ({ ...s })), skills: [...next.skills], pieces: [...next.pieces] };
      paint();
    }
  };
}
