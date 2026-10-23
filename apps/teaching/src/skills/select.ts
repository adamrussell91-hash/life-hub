import { el } from '@/quiz/dom';
import type { SkillsContinuum } from './schema';

/** A skill picker: none, or one sub-strand grouped by strand. Keeps a saved skill even before the list loads. */
export function skillSelect(value: string, skills: SkillsContinuum | null, className: string): HTMLSelectElement {
  const select = el('select', className);
  const none = el('option', undefined, skills ? 'No skill' : value ? value : 'Skills are loading…');
  none.value = skills ? '' : value;
  select.append(none);
  for (const strand of skills?.strands ?? []) {
    const group = el('optgroup');
    group.label = strand.name;
    for (const sub of strand.sub_strands) {
      const opt = el('option', undefined, sub.name);
      opt.value = `${strand.strand}.${sub.id}`;
      group.append(opt);
    }
    select.append(group);
  }
  select.value = value;
  return select;
}
