import {
  attachmentFromEndpoint,
  attachmentKindLabel,
  type TaskAttachment
} from '@/domain/task-attachments';
import { listUniversalLinksForEntity, taskEntityRef } from '@/api/universal-links';

const linkCache = new Map<string, TaskAttachment[]>();
const inflight = new Map<string, Promise<TaskAttachment[]>>();
const generation = new Map<string, number>();

function linkHydrationEnabled(): boolean {
  return !import.meta.env.VITEST;
}

/** Drop a cached link list so the next card paint refetches. */
export function forgetTaskLinkCache(taskId: string): void {
  linkCache.delete(taskId);
  inflight.delete(taskId);
  generation.set(taskId, (generation.get(taskId) ?? 0) + 1);
}

export function attachmentChip(item: TaskAttachment, link = true): HTMLElement {
  const kindLabel = attachmentKindLabel(item.kind);
  const node = link && item.href ? document.createElement('a') : document.createElement('span');
  node.className = 'hub-chip hub-chip--attach';
  node.dataset.attach = item.kind;
  node.title = `${kindLabel} · ${item.label}`;
  if (node instanceof HTMLAnchorElement && item.href) node.href = item.href;
  const kind = document.createElement('span');
  kind.className = 'hub-chip__kind';
  kind.textContent = kindLabel;
  const name = document.createElement('span');
  name.className = 'hub-chip__name';
  name.textContent = item.label;
  node.append(kind, name);
  return node;
}

function chipHost(root: HTMLElement): HTMLElement | null {
  const existing = root.querySelector<HTMLElement>('.hub-chips');
  if (existing) return existing;
  if (root.classList.contains('dashboard-row')) {
    const host = document.createElement('div');
    host.className = 'hub-chips dashboard-row__attach';
    root.append(host);
    return host;
  }
  const next = root.querySelector('.dashboard-next__body');
  if (!next) return null;
  const host = document.createElement('div');
  host.className = 'hub-chips dashboard-next__attach';
  next.append(host);
  return host;
}

/** Paint link pills onto a card that is already on screen. Skips duplicates. */
export function applyLinkAttachments(root: HTMLElement, items: TaskAttachment[]): void {
  if (!root.isConnected || !items.length) return;
  const host = chipHost(root);
  if (!host) return;
  const nestedInLink = Boolean(host.closest('a'));
  const existing = new Set(
    [...host.querySelectorAll<HTMLElement>('[data-attach]')].map((node) => {
      const name = node.querySelector('.hub-chip__name')?.textContent ?? '';
      return `${node.dataset.attach}:${name.toLowerCase()}`;
    })
  );
  for (const item of items) {
    const key = `${item.kind}:${item.label.toLowerCase()}`;
    if (existing.has(key)) continue;
    existing.add(key);
    host.append(attachmentChip(item, !nestedInLink));
  }
}

function attachmentsFromLinkPayload(payload: {
  outgoing: Array<{
    link: { status: string; relationship_type: string };
    endpoint: { kind: string; display_label: string; href?: string | null };
  }>;
  incoming: Array<{
    link: { status: string; relationship_type: string };
    endpoint: { kind: string; display_label: string; href?: string | null };
  }>;
}): TaskAttachment[] {
  const items: TaskAttachment[] = [];
  for (const entry of [...payload.outgoing, ...payload.incoming]) {
    const item = attachmentFromEndpoint({
      status: entry.link.status,
      relationshipType: entry.link.relationship_type,
      kind: entry.endpoint.kind,
      label: entry.endpoint.display_label,
      href: entry.endpoint.href
    });
    if (item) items.push(item);
  }
  return items;
}

function loadLinkAttachments(taskId: string): Promise<TaskAttachment[]> {
  const cached = linkCache.get(taskId);
  if (cached) return Promise.resolve(cached);
  const pending = inflight.get(taskId);
  if (pending) return pending;
  const gen = generation.get(taskId) ?? 0;
  // ponytail: one GET per task per session. A bulk links read would replace this.
  const request = listUniversalLinksForEntity(taskEntityRef(taskId))
    .then((payload) => {
      const items = attachmentsFromLinkPayload(payload);
      if ((generation.get(taskId) ?? 0) === gen) linkCache.set(taskId, items);
      return items;
    })
    .catch(() => {
      if ((generation.get(taskId) ?? 0) === gen) linkCache.set(taskId, []);
      return [] as TaskAttachment[];
    })
    .finally(() => {
      if (inflight.get(taskId) === request) inflight.delete(taskId);
    });
  inflight.set(taskId, request);
  return request;
}

/**
 * Fill event / person / lesson pills from universal links.
 * Structural pills (project, excursion, parent task) are already on the card.
 */
export function hydrateTaskLinkPills(root: HTMLElement, taskId: string): void {
  if (!linkHydrationEnabled()) return;
  const cached = linkCache.get(taskId);
  if (cached) {
    applyLinkAttachments(root, cached);
    return;
  }
  void loadLinkAttachments(taskId).then((items) => {
    applyLinkAttachments(root, items);
  });
}
