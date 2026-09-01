import { listHubSections } from './hub-sections.js';

export function renderHubSection(root, sectionId) {
  const section = listHubSections().find(item => item.id === sectionId);
  const host = root.querySelector?.(`[data-hub-open="${sectionId}"]`);
  if (!section || !host) return;
  host.replaceChildren();
  if (!section.origin) return;
  const link = root.createElement('a');
  link.className = 'btn btn--secondary';
  link.href = section.origin;
  link.textContent = `Open ${section.title} Hub`;
  host.append(link);
}
