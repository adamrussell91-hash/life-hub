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
    return url.protocol === 'https:' && !/(^|\.)notion\.(so|com)$/i.test(url.hostname) ? url.href : null;
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
  if (profile.summary) host.append(el('p', 'professional-profile__summary', readableText(profile.summary)));

  const facts = el('div', 'professional-profile__facts');
  if (profile.contact.email) appendContactLink(facts, `mailto:${profile.contact.email}`, profile.contact.email);
  if (profile.contact.phone) appendContactLink(facts, `tel:${profile.contact.phone.replace(/\s+/g, '')}`, profile.contact.phone);
  const linkedinUrl = safeExternalUrl(profile.contact.linkedin_url);
  if (linkedinUrl) appendContactLink(facts, linkedinUrl, 'LinkedIn');
  const properties = profile.source.properties;
  if (properties['First met']) facts.append(el('span','professional-profile__fact',`First met ${monthLabel(properties['First met'])}`));
  const context = properties['Relationship to Adam'] || properties['How we know each other'];
  if (context) facts.append(el('span','professional-profile__fact',readableText(context)));
  if (profile.current_workplace.length) facts.append(el('span', 'professional-profile__fact', profile.current_workplace.map(readableText).join(', ')));
  if (profile.last_contacted) {
    const start=properties['Last contacted range start'], end=properties['Last contacted range end'];
    const date=properties['Last contacted precision']==='week' && start && end
      ? `${formatDisplayDate(start)}–${formatDisplayDate(end)} (week)`
      : formatDisplayDate(profile.last_contacted);
    facts.append(el('span', 'professional-profile__fact', `Last contacted ${date}`));
  }
  if (facts.childNodes.length) host.append(facts);
}

function monthLabel(value: string): string {
  const match=value.match(/^(\d{4})-(\d{2})$/);
  if (!match || Number(match[2])<1 || Number(match[2])>12) return readableText(value);
  return new Intl.DateTimeFormat('en-AU',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(`${value}-01T00:00:00Z`));
}

// Legacy export URLs are internal provenance, not destinations in the Hub.
// Render all content as text nodes so imported markup cannot execute.
function readableText(value: string): string {
  return value
    .replace(/\[([^\]]+)\]\(https?:\/\/[^)]*notion\.(?:so|com)[^)]*\)/gi,'$1')
    .replace(/\s*\(?https?:\/\/[^\s)]*notion\.(?:so|com)[^\s)]*\)?/gi,'')
    .replace(/\bNotion\b/gi,'source').trim();
}

function appendTextSection(host: HTMLElement, heading: string, text: string | null, className = ''): void {
  if (!text) return;
  const section = el('section', `professional-profile__section ${className}`.trim());
  section.append(el('h2', 'entity-detail__heading', heading), el('p', 'professional-profile__text', readableText(text)));
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
    if (href) appendContactLink(item, href, readableText(reference.label));
    else item.textContent = readableText(reference.label);
    list.append(item);
  }
  section.append(list);
  host.append(section);
}

function appendSourceDetails(host: HTMLElement, profile: ProfessionalProfile): void {
  const details = document.createElement('details');
  details.className = 'professional-profile__source-details';
  details.append(el('summary', undefined, 'Profile details and evidence'));
  const list = document.createElement('dl');
  for (const [label, value] of Object.entries(profile.source.properties)) {
    if (!value || label==='Back end' || /^(AI summary|Pre-enrichment summary)/i.test(label)) continue;
    list.append(el('dt', undefined, readableText(label)), el('dd', undefined, label==='First met' ? monthLabel(value) : readableText(value)));
  }
  details.append(list);
  host.append(details);
}

export function renderProfessionalProfileTab(host: HTMLElement, profile: ProfessionalProfile | undefined): void {
  host.replaceChildren();
  if (!profile) {
    host.append(el('p', 'empty-state', 'No profile information recorded.'));
    return;
  }
  appendTextSection(host, 'Summary', profile.summary);
  appendReferenceGroup(host, 'Communications', profile.references.communications ?? []);
  appendReferenceGroup(host, 'Books', profile.references.books ?? []);
  appendReferenceGroup(host, 'Podcasts', profile.references.podcasts ?? []);
  appendReferenceGroup(host, 'Notes', profile.references.notes ?? []);
  appendReferenceGroup(host, 'Sources', profile.references.profile_sources ?? []);
  if (profile.body_markdown) {
    const section = el('section', 'professional-profile__section');
    section.append(el('h2', 'entity-detail__heading', 'Professional history and notes'));
    const body=el('div','professional-profile__body');
    let fenced=false;
    for (const line of readableText(profile.body_markdown).split('\n')) {
      if (line.trim().startsWith('```')) { fenced=!fenced; continue; }
      if (fenced || !line.trim() || /^---+$/.test(line.trim())) continue;
      const heading=line.match(/^#{1,6}\s+(.+)/);
      body.append(el(heading ? 'h3' : 'p',undefined,(heading ? heading[1]! : line).replace(/\*\*([^*]+)\*\*/g,'$1')));
    }
    section.append(body);
    host.append(section);
  }
  appendSourceDetails(host, profile);
}
