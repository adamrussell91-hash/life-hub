import { mountEntitySearch } from '@/components/entity-search';
import { parseSharedRef } from '@/domain/ids';
import { organisationRoute, personRoute } from '@/app/router';

export function renderRelationshipsView(canvas: HTMLElement): void {
  canvas.replaceChildren();
  const wrap = document.createElement('div');
  wrap.className = 'entity-search-page';

  const intro = document.createElement('p');
  intro.className = 'page-header__supporting';
  intro.textContent = 'Relationships are viewed through a Person or an Organisation — search for one to open its timeline.';
  wrap.append(intro);

  const searchHost = document.createElement('div');
  wrap.append(searchHost);

  mountEntitySearch(searchHost, {
    kinds: 'person,organisation',
    label: 'Search people and organisations',
    placeholder: 'Search by name',
    emptyHint: 'Search for a Person or Organisation to view their relationship timeline.',
    onSelect: (result) => {
      const parsed = parseSharedRef(result.ref);
      if (parsed?.kind === 'person') location.hash = personRoute(parsed.id);
      else if (parsed?.kind === 'organisation') location.hash = organisationRoute(parsed.id);
    }
  });

  canvas.append(wrap);
}
