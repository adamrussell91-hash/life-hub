/**
 * Keep the latest user turn near the top while the assistant reply grows.
 * Scroll-only — a layout spacer that appears and disappears yanks the
 * thread on every send, desktop and mobile.
 */

const SPACER_ATTR = 'data-chat-turn-spacer';
const ANCHOR_ATTR = 'data-chat-turn-anchor';
const TOP_PAD = 8;

/**
 * @param {HTMLElement | null | undefined} list
 * @param {HTMLElement | null | undefined} userItem
 */
function noopAnchor() {
  return { follow() {}, measure() {}, release() {} };
}

function stripLeftoverSpacers(list) {
  for (const spacer of list.querySelectorAll?.(`[${SPACER_ATTR}]`) ?? []) {
    spacer.remove?.();
  }
}

export function appendChatThreadItem(list, item) {
  if (!list || !item) return;
  const spacer = typeof list.querySelector === 'function'
    ? list.querySelector(`[${SPACER_ATTR}]`)
    : null;
  if (spacer && typeof list.insertBefore === 'function') {
    list.insertBefore(item, spacer);
    return;
  }
  if (typeof list.append === 'function') list.append(item);
}

export function beginChatTurnAnchor(list, userItem) {
  if (!list || !userItem) return noopAnchor();

  for (const node of list.querySelectorAll?.(`[${ANCHOR_ATTR}]`) ?? []) {
    node.removeAttribute?.(ANCHOR_ATTR);
  }
  userItem.setAttribute?.(ANCHOR_ATTR, '1');
  stripLeftoverSpacers(list);

  let active = true;

  function follow() {
    if (!active || !userItem.isConnected) return;
    const userTop = userItem.offsetTop || 0;
    const max = Math.max(0, (list.scrollHeight || 0) - (list.clientHeight || 0));
    list.scrollTop = Math.min(max, Math.max(0, userTop - TOP_PAD));
  }

  follow();

  return {
    follow,
    measure() {
      follow();
    },
    release() {
      active = false;
      userItem.removeAttribute?.(ANCHOR_ATTR);
    }
  };
}

export function clearChatTurnAnchors(list) {
  if (!list) return;
  for (const node of list.querySelectorAll?.(`[${ANCHOR_ATTR}]`) ?? []) {
    node.removeAttribute?.(ANCHOR_ATTR);
  }
  stripLeftoverSpacers(list);
}
