/**
 * Cross-hub chip navigation. Own-domain items follow the hub SPA route;
 * foreign-domain items open the kit popover with an "Open in <Hub>" full-nav link.
 */

const HUB_LABEL = Object.freeze({
  teaching: 'Teaching',
  professional: 'Professional',
  tasks: 'Tasks',
  knowledge: 'Knowledge',
  life: 'Life'
});

const TYPE_HUB = Object.freeze({
  scheduled_lesson: 'teaching',
  professional_meeting: 'professional',
  professional_event: 'professional',
  task: 'tasks',
  work_block: 'tasks',
  knowledge_page: 'knowledge',
  medical: 'life',
  workout: 'life',
  meal: 'life',
  diary: 'life',
  sleep: 'life',
  skincare: 'life',
  calendar_block: 'life'
});

const KIND_HUB = Object.freeze({
  teaching: 'teaching',
  professional: 'professional',
  task: 'tasks',
  health: 'life',
  fitness: 'life',
  corey: 'life',
  study: 'life'
});

/** Hub landing when routeFor / item.href cannot deep-link (visual seed chips often lack type). */
const HUB_LANDING = Object.freeze({
  teaching: '/teaching/calendar',
  professional: '/professional/#/calendar',
  tasks: '/tasks/#/week',
  knowledge: '/knowledge/',
  life: '/#/calendar'
});

/** @param {unknown} item */
export function hubDomainForItem(item) {
  if (!item || typeof item !== 'object') return null;
  const row = /** @type {Record<string, unknown>} */ (item);
  if (typeof row.hub === 'string' && HUB_LABEL[row.hub]) return row.hub;
  if (typeof row.domain === 'string' && HUB_LABEL[row.domain]) return row.domain;
  const source = String(row.source || row.type || row.record?.type || row.chip?.source || '');
  if (TYPE_HUB[source]) return TYPE_HUB[source];
  const kind = String(row.kind || row.chip?.kind || '');
  if (KIND_HUB[kind]) return KIND_HUB[kind];
  if (row.isClass === true || row.chip?.isClass === true) return 'teaching';
  return null;
}

/** @param {string | null | undefined} hub */
export function openInHubLabel(hub) {
  const name = HUB_LABEL[hub || ''] || 'Hub';
  return `Open in ${name}`;
}

/**
 * Same-origin path for full navigation. Prefer adapter routeFor, then item.href,
 * then the owning hub's calendar landing (foreign visual chips often have kind only).
 * @param {unknown} item
 * @param {(item: unknown) => string | null | undefined} [routeFor]
 */
export function openInHubHref(item, routeFor) {
  if (typeof routeFor === 'function') {
    const href = routeFor(item);
    if (typeof href === 'string' && href) return href;
  }
  const row = item && typeof item === 'object' ? /** @type {Record<string, unknown>} */ (item) : null;
  const href = row?.href || row?.record?.href || row?.chip?.href;
  if (typeof href === 'string' && href) return href;
  const domain = hubDomainForItem(item);
  return domain && HUB_LANDING[domain] ? HUB_LANDING[domain] : null;
}

/** @param {unknown} item @param {string} viewerHub */
export function isOwnHubItem(item, viewerHub) {
  const domain = hubDomainForItem(item);
  if (!domain || !viewerHub) return false;
  return domain === viewerHub;
}

/**
 * Popover fragment: full-nav anchor so foreign chips never dead-click or hijack SPA routers.
 * @param {unknown} item
 * @param {{ hub?: string, routeFor?: (item: unknown) => string | null | undefined }} opts
 */
export function openInHubLinkHtml(item, opts = {}) {
  const domain = hubDomainForItem(item);
  if (!domain || domain === (opts.hub || 'life')) return '';
  const href = openInHubHref(item, opts.routeFor);
  if (!href) return '';
  const label = openInHubLabel(domain);
  const safeHref = String(href).replace(/"/g, '&quot;');
  return `<div class="cal-pop__acts"><a class="btn btn--primary" data-part="open-in-hub" href="${safeHref}">${label}</a></div>`;
}
