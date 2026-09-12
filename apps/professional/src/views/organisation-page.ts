import { renderEntityDetail } from '@/components/entity-detail';
import { organisationRef } from '@/domain/ids';
import type { EntityOverview, OrganisationRecord } from '@/domain/types';

export async function renderOrganisationPage(
  canvas: HTMLElement,
  organisationId: string,
  options: { onTitleReady?: (title: string) => void; isCurrent?: () => boolean } = {}
): Promise<void> {
  await renderEntityDetail(canvas, {
    ref: organisationRef(organisationId),
    backHref: '#/organisations',
    backLabel: 'Back to Organisations',
    onTitleReady: options.onTitleReady,
    isCurrent: options.isCurrent,
    renderExtraFields: (overview: EntityOverview, host: HTMLElement) => {
      const organisation = overview.entity as OrganisationRecord;
      if (organisation.legal_name) {
        const legalName = document.createElement('p');
        legalName.className = 'entity-detail__legal-name';
        legalName.textContent = organisation.legal_name;
        host.append(legalName);
      }
    }
  });
}
