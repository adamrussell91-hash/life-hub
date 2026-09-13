import { renderEntityDetail } from '@/components/entity-detail';
import { personRef } from '@/domain/ids';
import type { EntityOverview, PersonRecord } from '@/domain/types';

export async function renderPersonPage(
  canvas: HTMLElement,
  personId: string,
  options: { onTitleReady?: (title: string) => void; isCurrent?: () => boolean } = {}
): Promise<void> {
  await renderEntityDetail(canvas, {
    ref: personRef(personId),
    backHref: '#/people',
    backLabel: 'Back to People',
    onTitleReady: options.onTitleReady,
    isCurrent: options.isCurrent,
    renderExtraFields: (overview: EntityOverview, host: HTMLElement) => {
      const person = overview.entity as PersonRecord;
      if (person.sort_name) {
        const sortName = document.createElement('p');
        sortName.className = 'entity-detail__sort-name';
        sortName.textContent = person.sort_name;
        host.append(sortName);
      }
      if (person.is_self) {
        const self = document.createElement('p');
        self.className = 'entity-detail__self-indicator';
        self.textContent = 'Self';
        host.append(self);
      }
    }
  });
}
