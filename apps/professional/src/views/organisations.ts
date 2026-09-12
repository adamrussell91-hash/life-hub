import { mountEntitySearch } from '@/components/entity-search';
import { parseSharedRef } from '@/domain/ids';
import { organisationRoute } from '@/app/router';

export function renderOrganisationsView(canvas: HTMLElement): void {
  canvas.replaceChildren();
  const wrap = document.createElement('div');
  wrap.className = 'entity-search-page';

  mountEntitySearch(wrap, {
    kinds: 'organisation',
    label: 'Search organisations',
    placeholder: 'Search by name',
    emptyHint: 'Search for an organisation by name to open its page.',
    onSelect: (result) => {
      const parsed = parseSharedRef(result.ref);
      if (parsed?.kind === 'organisation') location.hash = organisationRoute(parsed.id);
    }
  });

  canvas.append(wrap);
}
