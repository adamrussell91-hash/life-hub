import type { ComplianceModule } from '@/schemas/project';
import { complianceModulesByCategory } from '@/domain/excursion-modules';
import { el } from '@/views/hub-kit';

/**
 * The excursion compliance bundle — six real checklist categories, each item
 * a checkbox. Shared between the New Excursion confirm flow (views/excursions.ts)
 * and the overview page (views/excursion-timeline.ts) so both stay in sync.
 */
export function renderComplianceBundle(
  modules: ComplianceModule[],
  onToggle: (id: string) => void
): HTMLElement {
  const host = el('div', 'excursion-compliance');
  for (const group of complianceModulesByCategory(modules)) {
    const block = el('div', 'excursion-compliance__group');
    block.append(el('p', 'excursion-compliance__group-label', group.label));
    const list = el('ul', 'task-list');
    for (const module of group.modules) {
      const item = el('li', 'task-item');
      const label = el('label', 'task-check');
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.checked = module.on;
      box.setAttribute('aria-label', module.label);
      box.addEventListener('change', () => onToggle(module.id));
      label.append(box, el('span', 'check-box'));
      const body = el('div', 'task-body');
      const nameRow = el('div', 'excursion-compliance__name-row');
      nameRow.append(el('span', 'task-name', module.label));
      if (module.critical) {
        nameRow.append(el('span', 'excursion-compliance__critical', 'Critical'));
      }
      body.append(nameRow);
      if (module.sub) {
        body.append(el('span', 'excursion-compliance__sub', module.sub));
      }
      item.append(label, body);
      list.append(item);
    }
    block.append(list);
    host.append(block);
  }
  return host;
}
