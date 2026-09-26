import { formatDisplayDate } from '../../design-kit/js/format-display-date.js';
import type { ProfessionalProfile, ProfessionalProfileReference } from '@/domain/types';

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

function safeExternalUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

function safeHref(reference: ProfessionalProfileReference): string | null {
  if (typeof reference.hub_href === 'string' && (reference.hub_href.startsWith('#/') || /^\/(?!\/)/.test(reference.hub_href))) {
    return reference.hub_href;
  }
  return safeExternalUrl(reference.source_url);
}

function appendContactLink(host: HTMLElement, href: string, label: string): void {
  const link = document.createElement('a');
  link.href = href;
  link.textContent = label;
  host.append(link);
}

export function renderProfessionalProfileSummary(host: HTMLElement, profile: ProfessionalProfile | undefined): void {
  if (!profile) return;
  if (profile.summary) host.append(el('p', 'professional-profile__summary', profile.summary));

  const facts = el('div', 'professional-profile__facts');
  if (profile.contact.email) appendContactLink(facts, `mailto:${profile.contact.email}`, profile.contact.email);
  if (profile.contact.phone) appendContactLink(facts, `tel:${profile.contact.phone.replace(/\s+/g, '')}`, profile.contact.phone);
  const linkedinUrl = safeExternalUrl(profile.contact.linkedin_url);
  if (linkedinUrl) appendContactLink(facts, linkedinUrl, 'LinkedIn');
  if (profile.current_workplace.length) facts.append(el('span', 'professional-profile__fact', profile.current_workplace.join(', ')));
  if (profile.last_contacted) facts.append(el('span', 'professional-profile__fact', `Last contacted ${formatDisplayDate(profile.last_contacted)}`));
  if (facts.childNodes.length) host.append(facts);
}

function appendTextSection(host: HTMLElement, heading: string, text: string | null, className = ''): void {
  if (!text) return;
  const section = el('section', `professional-profile__section ${className}`.trim());
  section.append(el('h2', 'entity-detail__heading', heading), el('p', 'professional-profile__text', text));
  host.append(section);
}

function appendReferenceGroup(host: HTMLElement, heading: string, entries: ProfessionalProfileReference[]): void {
  if (!entries.length) return;
  const section = el('section', 'professional-profile__section');
  section.append(el('h2', 'entity-detail__heading', heading));
  const list = document.createElement('ul');
  list.className = 'professional-profile__references';
  for (const reference of entries) {
    const item = document.createElement('li');
    const href = safeHref(reference);
    if (href) appendContactLink(item, href, reference.label);
    else item.textContent = reference.label;
    list.append(item);
  }
  section.append(list);
  host.append(section);
}

function appendSourceDetails(host: HTMLElement, profile: ProfessionalProfile): void {
  const details = document.createElement('details');
  details.className = 'professional-profile__source-details';
  details.append(el('summary', undefined, 'Imported source details'));
  const list = document.createElement('dl');
  for (const [label, value] of Object.entries(profile.source.properties)) {
    list.append(el('dt', undefined, label), el('dd', undefined, value));
  }
  details.append(list);
  host.append(details);
}

export function renderProfessionalProfileTab(host: HTMLElement, profile: ProfessionalProfile | undefined): void {
  host.replaceChildren();
  if (!profile) {
    host.append(el('p', 'empty-state', 'No imported profile information.'));
    return;
  }
  appendTextSection(host, 'Summary', profile.summary);
  appendReferenceGroup(host, 'Communications', profile.references.communications ?? []);
  appendReferenceGroup(host, 'Books', profile.references.books ?? []);
  appendReferenceGroup(host, 'Podcasts', profile.references.podcasts ?? []);
  appendReferenceGroup(host, 'Notes', profile.references.notes ?? []);
  if (profile.body_markdown) {
    const section = el('section', 'professional-profile__section');
    section.append(el('h2', 'entity-detail__heading', 'Imported profile'));
    section.append(el('div', 'professional-profile__body', profile.body_markdown));
    host.append(section);
  }
  appendSourceDetails(host, profile);
}
