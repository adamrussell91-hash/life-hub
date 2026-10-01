/**
 * Sticky Confirm tray — pending OS actions stay above the composer until
 * Confirm/Discard, across New chat and scroll. Hydrated from /api/chat/pending.
 */

export const CHAT_PENDING_CONFIRMS_ID = 'chat-pending-confirms';
export const CHAT_PENDING_CONFIRMS_LIST_ID = 'chat-pending-confirms-list';

const TERMINAL = new Set(['consumed', 'dismissed']);

function isLivePending(entry) {
  if (!entry || typeof entry !== 'object') return false;
  const status = typeof entry.status === 'string' ? entry.status.trim() : '';
  return !TERMINAL.has(status || 'pending');
}

/** Live queue rows only (pending / executing / legacy missing status). */
export function selectLivePendingActions(list) {
  if (!Array.isArray(list)) return [];
  return list.filter((entry) => entry && typeof entry.id === 'string' && entry.id.trim() && isLivePending(entry));
}

/**
 * Client-safe projection: keep Confirm UI fields, drop write `content` bodies.
 */
export function pendingConfirmPublicFields(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const id = typeof entry.id === 'string' ? entry.id.trim() : '';
  if (!id) return null;
  const proposal = entry.proposal && typeof entry.proposal === 'object' ? entry.proposal : {};
  const writes = Array.isArray(proposal.writes)
    ? proposal.writes.map((write) => ({
      path: typeof write?.path === 'string' ? write.path : '',
      mode: typeof write?.mode === 'string' ? write.mode : 'write',
      diff: typeof write?.diff === 'string' ? write.diff : ''
    }))
    : [];
  const calendarGhostId =
    (typeof entry.calendarGhostId === 'string' && entry.calendarGhostId.trim())
    || (entry.extras && typeof entry.extras.calendarGhostId === 'string' && entry.extras.calendarGhostId.trim())
    || null;
  const calendarGhostIds = [
    ...(Array.isArray(entry.calendarGhostIds) ? entry.calendarGhostIds : []),
    ...(entry.extras && Array.isArray(entry.extras.calendarGhostIds) ? entry.extras.calendarGhostIds : [])
  ].filter((id) => typeof id === 'string' && id.trim());
  return {
    id,
    slug: typeof entry.slug === 'string' ? entry.slug : '',
    createdAt: typeof entry.createdAt === 'string' ? entry.createdAt : '',
    status: typeof entry.status === 'string' ? entry.status : 'pending',
    ...(calendarGhostId ? { calendarGhostId } : {}),
    ...(calendarGhostIds.length ? { calendarGhostIds: [...new Set(calendarGhostIds)] } : {}),
    proposal: {
      intent: typeof proposal.intent === 'string' ? proposal.intent : 'Proposed durable write',
      agent: typeof proposal.agent === 'string' ? proposal.agent : undefined,
      surfaces: Array.isArray(proposal.surfaces) ? proposal.surfaces : undefined,
      capability: typeof proposal.capability === 'string' ? proposal.capability : undefined,
      writes
    }
  };
}

function cssEscape(value) {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(value);
  return String(value).replace(/["\\]/g, '\\$&');
}

function resolveCreateElement(root, fallback = null) {
  if (typeof root?.createElement === 'function') return root.createElement.bind(root);
  if (typeof fallback?.createElement === 'function') return fallback.createElement.bind(fallback);
  const doc =
    root?.ownerDocument
    || fallback?.ownerDocument
    || (typeof document !== 'undefined' ? document : null);
  return typeof doc?.createElement === 'function' ? doc.createElement.bind(doc) : null;
}

function trayList(tray) {
  return tray?.querySelector?.(`#${CHAT_PENDING_CONFIRMS_LIST_ID}`) || tray;
}

function findCardByPendingId(host, id) {
  if (!host || !id) return null;
  return host.querySelector?.(`[data-pending-id="${cssEscape(id)}"]`) ?? null;
}

/** FakeElement tests need both dataset and the attribute for selector lookups. */
function tagPendingId(card, id) {
  if (!card || !id) return;
  card.dataset.pendingId = id;
  card.setAttribute?.('data-pending-id', id);
}

function countConfirmCards(list) {
  let count = 0;
  for (const child of list.children ?? []) {
    const classes = (child.className ?? '').split(/\s+/);
    if (classes.includes('confirm-card') || classes.includes('record-proposal')) count += 1;
  }
  if (count || typeof list.querySelectorAll !== 'function') return count;
  return list.querySelectorAll('.confirm-card').length
    || list.querySelectorAll('.record-proposal').length
    || 0;
}

function insertTrayBeforeForm(view, form, tray) {
  if (typeof form.parentElement?.insertBefore === 'function') {
    form.parentElement.insertBefore(tray, form);
    return;
  }
  if (typeof form.parent?.insertBefore === 'function') {
    form.parent.insertBefore(tray, form);
    return;
  }
  if (typeof view.insertBefore === 'function') {
    view.insertBefore(tray, form);
    return;
  }
  // FakeElement / odd hosts: rebuild children with tray before form.
  const kids = [...(view.children || [])];
  const idx = kids.indexOf(form);
  if (idx >= 0) view.replaceChildren(...kids.slice(0, idx), tray, ...kids.slice(idx));
  else view.append(tray);
}

function ensureListElement(tray, create) {
  if (tray.querySelector(`#${CHAT_PENDING_CONFIRMS_LIST_ID}`) || !create) return;
  const list = create('ul');
  list.id = CHAT_PENDING_CONFIRMS_LIST_ID;
  list.className = 'chat-pending-confirms__list';
  tray.append(list);
}

export function ensureChatPendingConfirmsTray(root) {
  if (!root) return null;
  const existing = root.querySelector?.(`#${CHAT_PENDING_CONFIRMS_ID}`);
  if (existing) {
    ensureListElement(existing, resolveCreateElement(root));
    return existing;
  }

  const view =
    root.querySelector?.('#chat-view')
    || (root.id === 'chat-view' ? root : null)
    || (root.classList?.contains?.('chat-view') ? root : null);
  const form = root.querySelector?.('#chat-form') || view?.querySelector?.('#chat-form');
  const create = resolveCreateElement(root, view);
  if (!view || !form || typeof create !== 'function') return null;

  const tray = create('aside');
  tray.id = CHAT_PENDING_CONFIRMS_ID;
  tray.className = 'chat-pending-confirms';
  tray.hidden = true;
  tray.setAttribute('aria-label', 'Waiting on Confirm');

  const label = create('p');
  label.className = 'chat-pending-confirms__label';
  label.textContent = 'Waiting on Confirm';
  tray.append(label);

  ensureListElement(tray, create);
  insertTrayBeforeForm(view, form, tray);
  return tray;
}

export function syncChatPendingConfirmsVisibility(root) {
  const tray = root?.querySelector?.(`#${CHAT_PENDING_CONFIRMS_ID}`);
  if (!tray) return;
  const count = countConfirmCards(trayList(tray));
  tray.hidden = count === 0;
  const label = tray.querySelector?.('.chat-pending-confirms__label');
  if (label) {
    label.textContent = count <= 1 ? 'Waiting on Confirm' : `Waiting on Confirm (${count})`;
  }
}

function dropStaleDurableCards(list, keepIds) {
  const cards = [...(list.querySelectorAll?.('[data-pending-id]') ?? list.children ?? [])];
  for (const card of cards) {
    const id = card.dataset?.pendingId || card.getAttribute?.('data-pending-id');
    if (!id || keepIds.has(id) || card.dataset?.pendingSource === 'session') continue;
    card.remove?.();
    if (card.parent) {
      card.parent.children = card.parent.children.filter((child) => child !== card);
    }
  }
}

/**
 * Mount (or refresh) durable pending action Confirm cards into the sticky tray.
 * Dedupes by data-pending-id. Does not clear the tray of session-only cards
 * that lack a matching id in `pending` — call `reconcile` to drop stale durable ones.
 */
export function mountPendingActionCards(root, pending, {
  appendActionProposal,
  bindActionProposal,
  reconcile = false
} = {}) {
  if (typeof appendActionProposal !== 'function' || typeof bindActionProposal !== 'function') {
    return [];
  }
  const tray = ensureChatPendingConfirmsTray(root);
  if (!tray) return [];
  const list = trayList(tray);
  const rows = selectLivePendingActions(pending)
    .map(pendingConfirmPublicFields)
    .filter(Boolean);

  if (reconcile) dropStaleDurableCards(list, new Set(rows.map((row) => row.id)));

  const mounted = [];
  for (const row of rows) {
    const existing = findCardByPendingId(list, row.id);
    if (existing) {
      // Refresh only when a same-turn batch grew the write list.
      const priorWrites = Number(existing.dataset?.writeCount || 0)
        || existing.querySelectorAll?.('.action-proposal__write')?.length
        || existing.querySelectorAll?.('.hub-chips .chip')?.length
        || 0;
      const nextWrites = Array.isArray(row.proposal?.writes) ? row.proposal.writes.length : 0;
      if (nextWrites <= priorWrites) {
        mounted.push({ card: existing, id: row.id, reused: true });
        continue;
      }
      existing.remove?.();
    }
    const proposalUi = appendActionProposal(root, {
      proposal: row.proposal,
      host: list,
      pendingId: row.id
    });
    if (!proposalUi?.card) continue;
    tagPendingId(proposalUi.card, row.id);
    const writeCount = Array.isArray(row.proposal?.writes) ? row.proposal.writes.length : 0;
    proposalUi.card.dataset.writeCount = String(writeCount);
    if (row.slug) proposalUi.card.dataset.agentSlug = row.slug;
    bindActionProposal(proposalUi, row.proposal, row.id);
    mounted.push({ card: proposalUi.card, id: row.id, reused: false, proposalUi });
  }

  syncChatPendingConfirmsVisibility(root);
  return mounted;
}

/** Place a live SSE Confirm into the sticky tray (not the scrollable thread). */
export function appendActionProposalToPendingTray(root, { proposal, id }, { appendActionProposal, bindActionProposal }) {
  const tray = ensureChatPendingConfirmsTray(root);
  if (!tray) return null;
  const list = trayList(tray);
  const nextWrites = Array.isArray(proposal?.writes) ? proposal.writes.length : 0;
  if (id) {
    const existing = findCardByPendingId(list, id);
    if (existing) {
      const priorWrites = Number(existing.dataset?.writeCount || 0)
        || existing.querySelectorAll?.('.action-proposal__write')?.length
        || existing.querySelectorAll?.('.hub-chips .chip')?.length
        || 0;
      if (nextWrites <= priorWrites) {
        syncChatPendingConfirmsVisibility(root);
        return { card: existing, reused: true };
      }
      // Same pending id grew (batched schedule move) — rebuild so Confirm applies all.
      existing.remove?.();
    }
  }
  const proposalUi = appendActionProposal(root, { proposal, host: list, pendingId: id });
  if (!proposalUi?.card) return null;
  if (id) tagPendingId(proposalUi.card, id);
  else proposalUi.card.dataset.pendingSource = 'session';
  proposalUi.card.dataset.writeCount = String(nextWrites);
  bindActionProposal(proposalUi, proposal, id ?? null);
  syncChatPendingConfirmsVisibility(root);
  return proposalUi;
}

export function removePendingConfirmCard(root, id) {
  if (!id) return;
  const tray = root?.querySelector?.(`#${CHAT_PENDING_CONFIRMS_ID}`);
  findCardByPendingId(tray, id)?.remove?.();
  syncChatPendingConfirmsVisibility(root);
}
