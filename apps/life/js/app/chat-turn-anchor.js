/**
 * Keep the latest user turn near the top while the assistant reply grows.
 * Mined from assistant-ui turn-top-anchor — no React.
 *
 * Spacer at the list end creates scroll room so a short reply doesn't leave
 * the user bubble stranded at the bottom.
 */

const SPACER_ATTR = 'data-chat-turn-spacer';
const ANCHOR_ATTR = 'data-chat-turn-anchor';
const TOP_PAD = 8;

/**
 * @param {HTMLElement | null | undefined} list
 * @param {HTMLElement | null | undefined} userItem
 * @param {{ createElement?: typeof document.createElement }} [dom]
 */
function noopAnchor() {
  return { follow() {}, measure() {}, release() {} };
}

export function beginChatTurnAnchor(list, userItem, dom = {}) {
  if (!list || !userItem) return noopAnchor();
  const create = dom.createElement?.bind(dom)
    ?? list.ownerDocument?.createElement?.bind(list.ownerDocument)
    ?? globalThis.document?.createElement?.bind(globalThis.document);
  if (!create) return noopAnchor();

  for (const node of list.querySelectorAll?.(`[${ANCHOR_ATTR}]`) ?? []) {
    node.removeAttribute?.(ANCHOR_ATTR);
  }
  userItem.setAttribute?.(ANCHOR_ATTR, '1');

  let spacer = list.querySelector?.(`[${SPACER_ATTR}]`);
  if (!spacer) {
    spacer = create('li');
    spacer.setAttribute(SPACER_ATTR, '1');
    spacer.className = 'chat-turn-spacer';
    spacer.setAttribute('aria-hidden', 'true');
    list.append?.(spacer);
  }

  let active = true;

  function measure() {
    if (!active || !spacer.isConnected || !userItem.isConnected) return;
    const viewport = list.clientHeight || 0;
    if (!viewport) {
      spacer.style.height = '0px';
      return;
    }
    const spacerHeight = spacer.offsetHeight || 0;
    const contentHeight = (list.scrollHeight || 0) - spacerHeight;
    const userTop = userItem.offsetTop || 0;
    const belowUser = Math.max(0, contentHeight - userTop);
    const next = Math.max(0, viewport - TOP_PAD - belowUser);
    spacer.style.height = `${Math.round(next)}px`;
  }

  function follow() {
    if (!active || !userItem.isConnected) return;
    measure();
    const userTop = userItem.offsetTop || 0;
    list.scrollTop = Math.max(0, userTop - TOP_PAD);
  }

  follow();

  return {
    follow,
    measure,
    release() {
      active = false;
      userItem.removeAttribute?.(ANCHOR_ATTR);
      if (spacer?.isConnected) {
        spacer.style.height = '0px';
        spacer.remove?.();
      }
    }
  };
}

export function clearChatTurnAnchors(list) {
  if (!list) return;
  for (const node of list.querySelectorAll?.(`[${ANCHOR_ATTR}]`) ?? []) {
    node.removeAttribute?.(ANCHOR_ATTR);
  }
  for (const spacer of list.querySelectorAll?.(`[${SPACER_ATTR}]`) ?? []) {
    spacer.remove?.();
  }
}
