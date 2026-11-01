import { el } from '@/quiz/dom';
import { loadSkills } from './api';
import type { SkillsContinuum } from './schema';
import '@/styles/next-step-teacher.css';

/**
 * Skills this box practises: a row of continuum sub-strand chips, several at
 * once (skillSelect picks one). The chosen ones sit in the row; "+ Skill"
 * opens every sub-strand grouped by strand. Saved skills show by their id
 * until the continuum loads.
 */
export function chipPicker(selected: readonly string[], skills: SkillsContinuum | null, onChange: (next: string[]) => void, max = 4): HTMLElement {
  let chosen = [...selected];
  let open = false;
  const root = el('div', 'nst-chips');
  const names = new Map<string, string>();
  for (const strand of skills?.strands ?? []) for (const sub of strand.sub_strands) names.set(`${strand.strand}.${sub.id}`, sub.name);

  const chip = (ref: string, label: string): HTMLButtonElement => {
    const on = chosen.includes(ref);
    const b = el('button', 'nst-chip', label);
    b.type = 'button';
    b.dataset.skill = ref;
    b.setAttribute('aria-pressed', String(on));
    b.disabled = !on && chosen.length >= max;
    b.addEventListener('click', () => {
      chosen = on ? chosen.filter((s) => s !== ref) : [...chosen, ref].slice(0, max);
      onChange([...chosen]);
      paint(`[data-skill="${ref}"]`);
    });
    return b;
  };

  function paint(focus?: string): void {
    const row = el('div', 'nst-chips__row');
    for (const ref of chosen) row.append(chip(ref, names.get(ref) ?? ref));
    const add = el('button', 'nst-chip nst-chip--add', skills ? (open ? 'Done' : '+ Skill') : 'Skills are loading…');
    add.type = 'button';
    add.disabled = !skills;
    add.setAttribute('aria-expanded', String(open));
    add.addEventListener('click', () => {
      open = !open;
      paint('.nst-chip--add');
    });
    row.append(add);
    root.replaceChildren(row);
    if (open && skills) {
      const groups = el('div', 'nst-chips__groups');
      for (const strand of skills.strands) {
        const group = el('div', 'nst-chips__group');
        group.setAttribute('role', 'group');
        group.setAttribute('aria-label', strand.name);
        const list = el('div', 'nst-chips__row');
        for (const sub of strand.sub_strands) list.append(chip(`${strand.strand}.${sub.id}`, sub.name));
        group.append(el('p', 'nst-chips__strand', strand.name), list);
        groups.append(group);
      }
      groups.append(el('p', 'nst-chips__hint', `Up to ${max} skills.`));
      root.append(groups);
    }
    if (focus) root.querySelector<HTMLElement>(focus)?.focus();
  }

  paint();
  return root;
}

/** The chip picker, swapped for the full one when the continuum has loaded. */
export function mountChipPicker(selected: readonly string[], onChange: (next: string[]) => void, max = 4): HTMLElement {
  let current = [...selected];
  const keep = (next: string[]) => {
    current = next;
    onChange(next);
  };
  const host = el('div', 'nst-chips-host');
  host.setAttribute('role', 'group');
  host.setAttribute('aria-label', 'Skills');
  host.append(chipPicker(current, null, keep, max));
  void loadSkills().then(
    (skills) => host.replaceChildren(chipPicker(current, skills, keep, max)),
    () => undefined
  );
  return host;
}
