import type { Block, GroupSet } from '@/schemas/block';
import type { SavedGroup } from '@/markbook/schema';
import type { Move } from '@/evidence/next-moves';
import { createBlock } from '@/blocks/create-block';
import { activeMembers, overlapsSaved } from '@/evidence/groups';
import { button, el, errorText, labelled, select } from '@/quiz/dom';

/**
 * Personalise, in quiz Settings: add a set of questions for one of the class's
 * groups. Saved groups come first, then the markbook's suggested groups (a
 * suggestion is saved when picked). The set goes on the canvas as a section.
 */

export type GroupChoice = { kind: 'saved' | 'suggested'; key: string; name: string; tags: string[]; students: string[]; group?: SavedGroup };

export function groupChoices(saved: SavedGroup[], moves: Move[], label: (tag: string) => string = (t) => t): GroupChoice[] {
  const active = saved.filter((g) => g.retired === null);
  const out: GroupChoice[] = active.map((g) => ({ kind: 'saved', key: g.id, name: g.name, tags: g.tags, students: activeMembers(g), group: g }));
  for (const m of moves) {
    if (m.kind !== 'group') continue;
    const tags = m.parts.map((p) => p.tag);
    if (overlapsSaved(m.students, tags, active)) continue;
    out.push({ kind: 'suggested', key: `suggest:${tags.join('+')}`, name: tags.map(label).join(' · '), tags, students: m.students });
  }
  return out;
}

export function groupSetSection(id: string, config: GroupSet): Block {
  const base = createBlock('section', id);
  return { ...base, content: { ...base.content, title: `Practice: ${config.name}`, blocks: [], group_set: config } } as Block;
}

export type PickerOptions = {
  classes: Array<{ id: string; title: string }>;
  load: (classId: string) => Promise<{ saved: SavedGroup[]; moves: Move[]; label: (tag: string) => string }>;
  saveSuggestion: (classId: string, tags: string[], students: string[]) => Promise<SavedGroup>;
  onAdd: (config: GroupSet) => void;
};

export function renderGroupSetPicker(o: PickerOptions): HTMLElement {
  const root = el('div', 'qz-gs');
  root.append(
    el('h4', 'qz-settings__heading', 'Personalise'),
    el('p', 'qz-note block-secondary', 'Add practice questions for a markbook group. Only that group’s students get them, mixed in with the quiz. They don’t count in the quiz score.')
  );
  if (!o.classes.length) {
    root.append(el('p', 'qz-note', 'Group sets need a class with a class list. Open Results once to load this unit’s classes.'));
    return root;
  }
  const form = el('div', 'qz-gs__form');
  const status = el('p', 'qz-note');
  root.append(form, status);
  const classPick = select(o.classes.map((c) => ({ value: c.id, label: c.title })), o.classes[0]!.id);
  classPick.name = 'class';
  let choices: GroupChoice[] = [];
  async function fill(): Promise<void> {
    status.textContent = 'Loading groups…';
    try {
      const loaded = await o.load(classPick.value);
      choices = groupChoices(loaded.saved, loaded.moves, loaded.label);
      status.textContent = choices.length ? '' : 'No groups yet. Groups come from the markbook’s Next steps.';
      draw();
    } catch (error) {
      status.textContent = errorText(error);
    }
  }
  function draw(): void {
    const groupPick = select(
      choices.map((c) => ({ value: c.key, label: `${c.name} · ${c.students.length} ${c.students.length === 1 ? 'student' : 'students'}${c.kind === 'suggested' ? ' (suggested)' : ''}` })),
      choices[0]?.key ?? ''
    );
    groupPick.name = 'group';
    const count = el('input', 'qz-input qz-gs__count');
    count.type = 'number';
    count.name = 'count';
    count.min = '1';
    count.max = '10';
    count.value = '3';
    const add = button('Add group set', 'secondary', async () => {
      const choice = choices.find((c) => c.key === groupPick.value);
      const target = Math.max(1, Math.min(10, Number(count.value) || 3));
      if (!choice) return;
      add.disabled = true;
      try {
        const group = choice.group ?? (await o.saveSuggestion(classPick.value, choice.tags, choice.students));
        o.onAdd({ group_id: group.id, class_id: classPick.value, name: group.name, tags: group.tags, students: choice.students, target });
        status.textContent = `Added a set for ${group.name}. Write its questions on the canvas, or ask Ann.`;
      } catch (error) {
        status.textContent = errorText(error);
      } finally {
        add.disabled = false;
      }
    });
    add.classList.add('qz-gs__add');
    add.disabled = !choices.length;
    form.replaceChildren(labelled('Class', classPick), labelled('Group', groupPick), labelled('Questions', count), add);
  }
  classPick.addEventListener('change', () => void fill());
  form.append(labelled('Class', classPick));
  void fill();
  return root;
}
