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
  return {
    id,
    slug: typeof entry.slug === 'string' ? entry.slug : '',
    createdAt: typeof entry.createdAt === 'string' ? entry.createdAt : '',
    status: typeof entry.status === 'string' ? entry.status : 'pending',
    ...(calendarGhostId ? { calendarGhostId } : {}),
    proposal: {
      intent: typeof proposal.intent === 'string' ? proposal.intent : 'Proposed durable write',
      agent: typeof proposal.agent === 'string' ? proposal.agent : undefined,
      surfaces: Array.isArray(proposal.surfaces) ? proposal.surfaces : undefined,
      capability: typeof proposal.capability === 'string' ? proposal.capability : undefined,
      writes
    }
  };
}

export function ensureChatPendingConfirmsTray(root) {
  if (!root) return null;
  const existing = root.querySelector?.(`#${CHAT_PENDING_CONFIRMS_ID}`);
  if (existing) {
    const doc = root.ownerDocument || (typeof document !== 'undefined' ? document : null);
    const create = typeof root.createElement === 'function'
      ? root.createElement.bind(root)
      : doc?.createElement?.bind(doc);
    if (!existing.querySelector(`#${CHAT_PENDING_CONFIRMS_LIST_ID}`) && create) {
      const list = create('ul');
      list.id = CHAT_PENDING_CONFIRMS_LIST_ID;
      list.className = 'chat-pending-confirms__list';
      existing.append(list);
    }
    return existing;
  }

  const view =
    root.querySelector?.('#chat-view')
    || (root.id === 'chat-view' ? root : null)
    || (root.classList?.contains?.('chat-view') ? root : null);
  const form = root.querySelector?.('#chat-form') || view?.querySelector?.('#chat-form');
  const doc = root.ownerDocument || view?.ownerDocument || (typeof document !== 'undefined' ? document : null);
  const create = typeof root.createElement === 'function'
    ? root.createElement.bind(root)
    : doc?.createElement?.bind(doc);
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

  const list = create('ul');
  list.id = CHAT_PENDING_CONFIRMS_LIST_ID;
  list.className = 'chat-pending-confirms__list';
  tray.append(list);

  if (typeof form.parentElement?.insertBefore === 'function') {
    form.parentElement.insertBefore(tray, form);
  } else if (typeof form.parent?.insertBefore === 'function') {
    form.parent.insertBefore(tray, form);
  } else if (typeof view.insertBefore === 'function') {
    view.insertBefore(tray, form);
  } else {
    // FakeElement / odd hosts: rebuild children with tray before form.
    const kids = [...(view.children || [])];
    const idx = kids.indexOf(form);
    if (idx >= 0) {
      view.replaceChildren(...kids.slice(0, idx), tray, ...kids.slice(idx));
    } else {
      view.append(tray);
    }
  }

  return tray;
}

export function syncChatPendingConfirmsVisibility(root) {
  const tray = root?.querySelector?.(`#${CHAT_PENDING_CONFIRMS_ID}`);
  if (!tray) return;
  const list = tray.querySelector(`#${CHAT_PENDING_CONFIRMS_LIST_ID}`) || tray;
  let count = 0;
  for (const child of list.children ?? []) {
    const classes = (child.className ?? '').split(/\s+/);
    if (classes.includes('confirm-card') || classes.includes('record-proposal')) count += 1;
  }
  if (!count && typeof list.querySelectorAll === 'function') {
    count = list.querySelectorAll('.confirm-card').length
      || list.querySelectorAll('.record-proposal').length
      || 0;
  }
  tray.hidden = count === 0;
  const label = tray.querySelector?.('.chat-pending-confirms__label');
  if (label) {
    label.textContent = count <= 1 ? 'Waiting on Confirm' : `Waiting on Confirm (${count})`;
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
  const list = tray.querySelector(`#${CHAT_PENDING_CONFIRMS_LIST_ID}`) || tray;
  const rows = selectLivePendingActions(pending)
    .map(pendingConfirmPublicFields)
    .filter(Boolean);

  if (reconcile) {
    const keep = new Set(rows.map((row) => row.id));
    for (const card of [...(list.querySelectorAll?.('[data-pending-id]') ?? list.children ?? [])]) {
      const id = card.dataset?.pendingId || card.getAttribute?.('data-pending-id');
      if (id && !keep.has(id) && card.dataset?.pendingSource !== 'session') {
        card.remove?.();
        if (card.parent) {
          card.parent.children = card.parent.children.filter((c) => c !== card);
        }
      }
    }
  }

  const mounted = [];
  for (const row of rows) {
    const existing = list.querySelector?.(`[data-pending-id="${cssEscape(row.id)}"]`);
    if (existing) {
      mounted.push({ card: existing, id: row.id, reused: true });
      continue;
    }
    // Point append helper at the tray list for this card.
    const proposalUi = appendActionProposal(root, {
      proposal: row.proposal,
      host: list,
      pendingId: row.id
    });
    if (!proposalUi?.card) continue;
    proposalUi.card.dataset.pendingId = row.id;
    proposalUi.card.setAttribute('data-pending-id', row.id);
    if (row.slug) proposalUi.card.dataset.agentSlug = row.slug;
    bindActionProposal(proposalUi, row.proposal, row.id);
    mounted.push({ card: proposalUi.card, id: row.id, reused: false, proposalUi });
  }

  syncChatPendingConfirmsVisibility(root);
  return mounted;
}

function cssEscape(value) {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(value);
  return String(value).replace(/["\\]/g, '\\$&');
}

/** Place a live SSE Confirm into the sticky tray (not the scrollable thread). */
export function appendActionProposalToPendingTray(root, { proposal, id }, { appendActionProposal, bindActionProposal }) {
  const tray = ensureChatPendingConfirmsTray(root);
  if (!tray) return null;
  const list = tray.querySelector(`#${CHAT_PENDING_CONFIRMS_LIST_ID}`) || tray;
  if (id) {
    const existing = list.querySelector?.(`[data-pending-id="${cssEscape(id)}"]`);
    if (existing) {
      syncChatPendingConfirmsVisibility(root);
      return { card: existing, reused: true };
    }
  }
  const proposalUi = appendActionProposal(root, { proposal, host: list, pendingId: id });
  if (!proposalUi?.card) return null;
  if (id) {
    proposalUi.card.dataset.pendingId = id;
    proposalUi.card.setAttribute('data-pending-id', id);
  } else {
    proposalUi.card.dataset.pendingSource = 'session';
  }
  bindActionProposal(proposalUi, proposal, id ?? null);
  syncChatPendingConfirmsVisibility(root);
  return proposalUi;
}

export function removePendingConfirmCard(root, id) {
  if (!id) return;
  const tray = root?.querySelector?.(`#${CHAT_PENDING_CONFIRMS_ID}`);
  const card = tray?.querySelector?.(`[data-pending-id="${cssEscape(id)}"]`);
  card?.remove?.();
  syncChatPendingConfirmsVisibility(root);
}
