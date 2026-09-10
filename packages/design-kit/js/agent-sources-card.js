/**
 * Compact citation / sources card (Tool UI citation pattern, Cotton Glass).
 */

/**
 * @typedef {{ id?: string, title: string, url?: string, snippet?: string }} AgentSource
 */

/**
 * @param {ParentNode & { createElement: typeof document.createElement }} root
 * @param {{ heading?: string, sources: AgentSource[] }} options
 */
export function createAgentSourcesCard(root, options) {
  const create = root.createElement?.bind(root) ?? globalThis.document.createElement.bind(globalThis.document);
  const card = create('section');
  card.className = 'agent-sources-card';
  card.setAttribute('role', 'region');
  card.setAttribute('aria-label', options.heading || 'Sources');

  const heading = create('h2');
  heading.className = 'agent-sources-card__heading';
  heading.textContent = options.heading || 'Sources';
  card.append(heading);

  const list = create('ul');
  list.className = 'agent-sources-card__list';
  card.append(list);

  for (const source of options.sources ?? []) {
    const item = create('li');
    item.className = 'agent-sources-card__item';
    if (source.url) {
      const link = create('a');
      link.className = 'agent-sources-card__link';
      link.href = source.url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = source.title || source.url;
      item.append(link);
    } else {
      const title = create('span');
      title.className = 'agent-sources-card__title';
      title.textContent = source.title || 'Source';
      item.append(title);
    }
    if (source.snippet) {
      const snippet = create('p');
      snippet.className = 'agent-sources-card__snippet';
      snippet.textContent = source.snippet;
      item.append(snippet);
    }
    list.append(item);
  }

  return card;
}
