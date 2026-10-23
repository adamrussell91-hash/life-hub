import type { Block } from '@/schemas/block';
import type { RenderMode } from '@/blocks/render';
import { editorShell, type BlockChangeHandler } from '@/blocks/editors';

type WithTeacherBlock = Extract<Block, { block_type: 'with_teacher' }>;

/**
 * Where a tutorial group stops for the teacher. Students see a calm marker;
 * the tutorial player holds them here until the teacher sits with the group.
 * Talking points are for the teacher's live board only.
 */
export function renderWithTeacher(block: WithTeacherBlock, mode: RenderMode): HTMLElement {
  const root = document.createElement('div');
  root.className = 'block-with-teacher';
  const head = document.createElement('p');
  head.className = 'block-with-teacher__head';
  head.textContent = mode === 'teacher' ? 'With teacher' : 'Your teacher will join you here.';
  root.append(head);
  if (mode === 'teacher' && block.content.talking_points.length) {
    const list = document.createElement('ul');
    list.className = 'block-with-teacher__points';
    for (const point of block.content.talking_points) {
      const item = document.createElement('li');
      item.textContent = point;
      list.append(item);
    }
    root.append(list);
  }
  return root;
}

export function createWithTeacherEditor(
  block: WithTeacherBlock,
  onChange: BlockChangeHandler<WithTeacherBlock>,
  getLatest: () => WithTeacherBlock = () => block
): HTMLElement {
  const fields = document.createElement('div');
  fields.className = 'block-editor__fields';
  const label = document.createElement('label');
  label.className = 'block-editor__label';
  label.textContent = 'Talking points (one per line, no names)';
  const points = document.createElement('textarea');
  points.className = 'block-editor__with-teacher-points';
  points.rows = 4;
  points.value = block.content.talking_points.join('\n');
  points.addEventListener('input', () => {
    const latest = getLatest();
    const talking_points = points.value.split('\n').map((p) => p.trim()).filter(Boolean).slice(0, 8);
    onChange({ ...latest, content: { ...latest.content, talking_points } });
  });
  label.append(points);
  fields.append(label);
  return editorShell(block, onChange, fields, getLatest);
}
