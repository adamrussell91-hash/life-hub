/**
 * Technique scan review: the teacher checks what the scan found and ticks the
 * techniques students may get. Nothing reaches students until Save. Likely
 * finds (70% and up) start ticked; on a re-review the teacher's last ticks win.
 */
import type { LiteraryElementsTable } from '@/blocks/literary-elements';
import { familyOfTechnique } from '@/blocks/literary-elements';
import { confidenceTier, foundTechniqueIds, type TechniqueScanData } from '@/blocks/technique-scan';
import '@/blocks/classroom-tools/classroom-tools.css';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Ticks a fresh scan starts with: every technique with a Likely reading somewhere. */
export function defaultApproval(scan: TechniqueScanData): string[] {
  if (scan.approved_at) return scan.approved_ids;
  const likely = new Set<string>();
  for (const finding of scan.findings) for (const hit of finding.techniques) if (hit.confidence >= 70) likely.add(hit.id);
  return foundTechniqueIds(scan.findings).filter((id) => likely.has(id));
}

export function openTechniqueReview(
  scan: TechniqueScanData,
  table: LiteraryElementsTable,
  onSave: (approvedIds: string[]) => void
): HTMLDialogElement {
  const dialog = el('dialog', 'text-tools-review technique-review');
  dialog.setAttribute('aria-label', 'Technique scan');
  const heading = el('h2', '', 'Technique scan');
  const intro = el(
    'p',
    'technique-review__intro',
    'Tick the techniques students may get from the technique spinner. Nothing reaches students until you save.'
  );
  const body = el('div', 'text-tools-review__body technique-review__body');
  const ticked = new Set(defaultApproval(scan));
  const boxes = new Map<string, HTMLInputElement[]>();

  scan.findings.forEach((finding, f) => {
    const card = el('div', 'technique-review__finding');
    card.append(el('p', 'technique-review__quote', `“${finding.quote}”`));
    for (const hit of finding.techniques) {
      const tech = table.techniques.find((t) => t.id === hit.id);
      if (!tech) continue;
      const family = familyOfTechnique(table, tech);
      const rowEl = el('label', 'technique-review__row');
      rowEl.style.setProperty('--fc', family?.colour ?? 'var(--line)');
      const box = el('input');
      box.type = 'checkbox';
      box.id = `technique-review-${f}-${hit.id}`;
      box.checked = ticked.has(hit.id);
      box.addEventListener('change', () => {
        if (box.checked) ticked.add(hit.id);
        else ticked.delete(hit.id);
        // The same technique can show up under several quotes; keep them in step.
        for (const twin of boxes.get(hit.id) ?? []) twin.checked = box.checked;
        paintCount();
      });
      boxes.set(hit.id, [...(boxes.get(hit.id) ?? []), box]);
      const text = el('span', 'technique-review__text');
      const top = el('span', 'technique-review__top');
      top.append(
        el('span', 'technique-review__family', family?.name ?? ''),
        el('strong', '', tech.name),
        el('span', 'technique-review__conf', `${hit.confidence}% · ${confidenceTier(hit.confidence)}`)
      );
      const meter = el('span', 'technique-review__meter');
      const fill = el('span', 'technique-review__fill');
      fill.style.width = `${hit.confidence}%`;
      meter.append(fill);
      text.append(top, meter);
      if (hit.explanation) text.append(el('span', 'technique-review__why', hit.explanation));
      rowEl.append(box, text);
      card.append(rowEl);
    }
    body.append(card);
  });

  const count = el('p', 'technique-review__count');
  const paintCount = () => {
    count.textContent = ticked.size
      ? `${ticked.size} ${ticked.size === 1 ? 'technique' : 'techniques'} ticked for students`
      : 'Nothing ticked. Students will not get a technique spinner for this text.';
  };
  paintCount();

  const actions = el('div', 'text-tools-review__actions');
  const close = () => {
    dialog.close?.();
    dialog.remove();
  };
  const save = el('button', 'btn btn--primary', 'Save for students');
  save.type = 'button';
  save.addEventListener('click', () => {
    close();
    onSave([...ticked]);
  });
  const dismiss = el('button', 'btn btn--ghost', 'Cancel');
  dismiss.type = 'button';
  dismiss.addEventListener('click', close);
  actions.append(save, dismiss);
  dialog.addEventListener('cancel', () => dialog.remove());

  dialog.append(heading, intro, body, count, actions);
  document.body.append(dialog);
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', '');
  return dialog;
}
