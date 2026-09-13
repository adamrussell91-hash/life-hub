import { formatDisplayDate } from '../../design-kit/js/format-display-date.js';
import { getCareer } from '@/api/career';
import { applicationRoute, eventRoute, organisationRoute, personRoute } from '@/app/router';
import type { CareerOverview, CareerSection, CareerSectionItem } from '@/domain/types';
import { isValidApplicationId, isValidEventId, isValidOrganisationId, isValidPersonId } from '@/domain/ids';
import { renderLoadError, showViewLoading } from '@/views/feedback';

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

function hrefForItem(item: CareerSectionItem): string | null {
  if (typeof item.href === 'string' && item.href) {
    if (item.href.startsWith('/professional/#')) return item.href.replace('/professional/', '');
    if (item.href.startsWith('#/')) return item.href;
    return item.href;
  }
  if (item.id && isValidApplicationId(item.id)) return applicationRoute(item.id);
  if (item.id && isValidEventId(item.id)) return eventRoute(item.id);
  if (item.ref?.startsWith('shared:person:')) {
    const id = item.ref.slice('shared:person:'.length);
    if (isValidPersonId(id)) return personRoute(id);
  }
  if (item.ref?.startsWith('shared:organisation:')) {
    const id = item.ref.slice('shared:organisation:'.length);
    if (isValidOrganisationId(id)) return organisationRoute(id);
  }
  if (item.ref?.startsWith('professional:application:')) {
    const id = item.ref.slice('professional:application:'.length);
    if (isValidApplicationId(id)) return applicationRoute(id);
  }
  if (item.ref?.startsWith('professional:event:')) {
    const id = item.ref.slice('professional:event:'.length);
    if (isValidEventId(id)) return eventRoute(id);
  }
  return null;
}

function itemLabel(item: CareerSectionItem): string {
  if (item.position_title) return item.position_title;
  if (item.title) return item.title;
  if (item.display_label) return item.display_label;
  return item.id ?? item.ref ?? 'Item';
}

function itemMeta(item: CareerSectionItem): string | null {
  const bits = [
    item.pipeline_status?.replace(/_/g, ' '),
    item.occurrence_state?.replace(/_/g, ' '),
    item.role,
    item.closing_date ? `closes ${formatDisplayDate(item.closing_date) ?? item.closing_date}` : null,
    item.start ? formatDisplayDate(item.start) ?? item.start.slice(0, 16) : null,
    item.supporting_label
  ].filter(Boolean);
  return bits.length ? bits.join(' · ') : null;
}

function renderSection(host: HTMLElement, title: string, section: CareerSection): void {
  const block = el('section', 'career__section');
  block.append(el('h2', 'career__heading', title));
  if (section.status === 'unavailable') {
    block.append(
      el(
        'p',
        'empty-state career__unavailable',
        `Unavailable${section.reason ? ` · ${section.reason}` : '.'}`
      )
    );
    host.append(block);
    return;
  }
  if (!section.items.length) {
    block.append(el('p', 'empty-state', 'No items.'));
    host.append(block);
    return;
  }
  const list = document.createElement('ul');
  list.className = 'career__list';
  for (const item of section.items) {
    const li = document.createElement('li');
    li.className = 'career__item';
    const href = hrefForItem(item);
    const label = itemLabel(item);
    if (href) {
      const link = el('a', 'career__link', label);
      link.href = href;
      li.append(link);
    } else {
      li.append(el('span', 'career__link', label));
    }
    const meta = itemMeta(item);
    if (meta) li.append(el('p', 'career__meta', meta));
    list.append(li);
  }
  block.append(list);
  host.append(block);
}

export async function renderCareerView(canvas: HTMLElement): Promise<void> {
  showViewLoading(canvas, 'Loading career…');

  async function load(): Promise<void> {
    showViewLoading(canvas, 'Loading career…');
    try {
      const overview = await getCareer();
      paint(overview);
    } catch (err) {
      renderLoadError(canvas, err, () => void load());
    }
  }

  function paint(overview: CareerOverview): void {
    canvas.replaceChildren();
    renderSection(canvas, 'Applications', overview.applications);
    renderSection(canvas, 'Employment', overview.employment);
    renderSection(canvas, 'Professional Development', overview.professional_development);
    renderSection(canvas, 'People', overview.people);
    renderSection(canvas, 'Organisations', overview.organisations);

    const deferred = el('section', 'career__section career__deferred');
    deferred.append(el('h2', 'career__heading', 'Deferred'));
    const labels = (overview.deferred ?? []).map((value) =>
      value.replace(/_/g, ' ').replace(/\b\w/g, (ch) => ch.toUpperCase())
    );
    deferred.append(
      el(
        'p',
        'empty-state',
        labels.length
          ? `Publication and Presentation stay deferred — no authoritative store or active workflow yet (${labels.join(', ')}).`
          : 'Publication and Presentation stay deferred — no authoritative store or active workflow yet.'
      )
    );
    canvas.append(deferred);
  }

  await load();
}
