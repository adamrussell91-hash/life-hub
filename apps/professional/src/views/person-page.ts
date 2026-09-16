import { renderEntityDetail } from '@/components/entity-detail';
import { buildPersonTabs } from '@/components/person-tabs';
import { personRef } from '@/domain/ids';
import type { EntityOverview, PersonRecord } from '@/domain/types';

export async function renderPersonPage(
  canvas: HTMLElement,
  personId: string,
  options: { onTitleReady?: (title: string) => void; isCurrent?: () => boolean } = {}
): Promise<void> {
  // A role edit needs a full overview refetch, exactly like today's flat
  // page — re-invoking `renderPersonPage` itself achieves that without
  // `entity-detail.ts` needing to expose any reload hook beyond the
  // `TabDef` contract's `{ isCurrent }`.
  const reload = (): void => {
    void renderPersonPage(canvas, personId, options);
  };

  await renderEntityDetail(canvas, {
    ref: personRef(personId),
    backHref: '#/people',
    backLabel: 'Back to People',
    onTitleReady: options.onTitleReady,
    isCurrent: options.isCurrent,
    tabs: buildPersonTabs(reload),
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
