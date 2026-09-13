import { mountEntitySearch } from '@/components/entity-search';
import { parseSharedRef } from '@/domain/ids';
import { personRoute } from '@/app/router';

export function renderPeopleView(canvas: HTMLElement): void {
  canvas.replaceChildren();
  const wrap = document.createElement('div');
  wrap.className = 'entity-search-page';

  mountEntitySearch(wrap, {
    kinds: 'person',
    label: 'Search people',
    placeholder: 'Search by name',
    emptyHint: 'Search for a person by name to open their page.',
    onSelect: (result) => {
      const parsed = parseSharedRef(result.ref);
      if (parsed?.kind === 'person') location.hash = personRoute(parsed.id);
    }
  });

  canvas.append(wrap);
}
