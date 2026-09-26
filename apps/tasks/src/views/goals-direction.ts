// apps/tasks/src/views/goals-direction.ts
import type { PlanningDirection } from '@/schemas/planning-direction';
import { tasksApi } from '@/services/client-api';
import { errorMessage } from '@/views/feedback';
import { el } from '@/views/hub-kit';
import { runMorphTransform } from '../../design-kit/js/morphing-dialog.js';
import { createTagList } from '../../design-kit/js/hub-inline-edit.js';

function oneLine(direction: PlanningDirection): string {
  const purpose = direction.purpose.trim();
  const vision = direction.vision.trim();
  if (!purpose && !vision) {
    return 'Direction not set — tap to add purpose and vision.';
  }
  const parts = [
    purpose ? `Purpose: ${purpose}` : null,
    vision ? `Vision: ${vision}` : null
  ].filter(Boolean);
  return parts.join(' · ');
}

/** G-18 Direction strip — collapsed one line; expands into editable purpose / principles / vision. */
export function mountDirectionStrip(host: HTMLElement, initial: PlanningDirection): void {
  let direction = initial;
  const root = el('section', 'goals-direction glass-tile');
  const collapsed = el('button', 'goals-direction__collapsed', oneLine(direction));
  collapsed.type = 'button';
  collapsed.setAttribute('aria-expanded', 'false');
  const editor = el('div', 'goals-direction__editor');
  editor.hidden = true;

  const purpose = el('textarea', 'goal-field') as HTMLTextAreaElement;
  purpose.rows = 2;
  purpose.value = direction.purpose;
  purpose.setAttribute('aria-label', 'Purpose');
  purpose.placeholder = 'Purpose';

  const vision = el('textarea', 'goal-field') as HTMLTextAreaElement;
  vision.rows = 2;
  vision.value = direction.vision;
  vision.setAttribute('aria-label', 'Vision');
  vision.placeholder = 'Vision';

  const principles = createTagList({
    tags: direction.principles,
    addLabel: 'Add principle',
    onChange: (tags) => {
      direction = { ...direction, principles: tags };
    }
  });

  const save = el('button', 'btn btn--primary', 'Save');
  save.type = 'button';
  save.addEventListener('click', () => {
    void tasksApi
      .updatePlanningDirection({
        purpose: purpose.value,
        vision: vision.value,
        principles: direction.principles
      })
      .then((next) => {
        direction = next;
        collapsed.textContent = oneLine(direction);
        close();
      })
      .catch((err) => window.alert(errorMessage(err)));
  });
  const discard = el('button', 'btn btn--ghost', 'Close');
  discard.type = 'button';
  discard.addEventListener('click', close);

  editor.append(
    el('p', 'goal-card__eyebrow', 'Direction'),
    purpose,
    el('p', 'meta', 'Principles'),
    principles.el,
    vision,
    (() => {
      const row = el('div', 'row');
      row.append(save, discard);
      return row;
    })()
  );

  collapsed.addEventListener('click', () => {
    if (editor.hidden) open();
    else close();
  });

  root.append(collapsed, editor);
  host.replaceChildren(root);

  function open(): void {
    collapsed.setAttribute('aria-expanded', 'true');
    const from = collapsed.getBoundingClientRect();
    editor.hidden = false;
    runMorphTransform({
      from: collapsed,
      update: () => undefined,
      to: () => editor,
      spring: { stiffness: 380, damping: 32 }
    });
    void from;
  }
  function close(): void {
    collapsed.setAttribute('aria-expanded', 'false');
    editor.hidden = true;
  }
}
