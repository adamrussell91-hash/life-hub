import { renderEntityDetail, renderPersonSummaryCard } from '@/components/entity-detail';
import { mountIdentityEditor } from '@/components/person-identity-editor';
import { buildPersonTabs } from '@/components/person-tabs';
import { personBriefRoute } from '@/app/router';
import { personRef } from '@/domain/ids';
import { renderProfessionalProfileSummary } from '@/components/professional-profile';
import type { EntityOverview } from '@/domain/types';

export interface PersonDetailHeader {
  title: string;
  actions: HTMLElement;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export async function renderPersonPage(
  canvas: HTMLElement,
  personId: string,
  options: {
    onTitleReady?: (title: string) => void;
    onHeaderReady?: (header: PersonDetailHeader) => void;
    isCurrent?: () => boolean;
  } = {}
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
      const person = overview.entity;
      if (person.kind !== 'person') return;
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
      renderProfessionalProfileSummary(host, person.professional_profile);
      const shared = overview.shared_contexts_with_self ?? [];
      if (!person.is_self && shared.length) {
        const connection = document.createElement('p');
        connection.className = 'entity-detail__shared-context';
        const names = shared.map((item) => item.display_label);
        connection.textContent =
          names.length === 1
            ? `You know them through ${names[0]}.`
            : `You know them through ${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}.`;
        host.append(connection);
      }
      // Brief section 19 / BUILD-PLAN.md Feature 1.3's "Open Person Brief"
      // quick action — links to the Phase 3 Person Brief reading sheet
      // (`#/person/<id>/brief`, `views/person-brief.ts`).
      const brief = document.createElement('a');
      brief.className = 'btn btn--secondary entity-detail__brief-link';
      brief.href = personBriefRoute(person.id);
      brief.textContent = 'Open Person Brief';

      const editor = mountIdentityEditor(person, reload);
      const actions = el('div', 'entity-detail__profile-actions');
      actions.append(brief, editor.button);
      if (options.onHeaderReady) {
        options.onHeaderReady({ title: person.display_name, actions });
      } else {
        host.append(actions);
      }
      host.append(editor.form);
      renderPersonSummaryCard(host, overview, brief.href, reload);
    }
  });
}
