// apps/tasks/src/chat/clare-deep-link.ts
/**
 * G-35 Ask Hammond deep link: `#/clare?agent=hammond&prompt=<urlencoded>`
 * Selects the agent and pre-fills the composer. Does not send.
 *
 * `&send=1` sends the prompt instead of pre-filling it. Other hubs use this to
 * hand Clare a request only Tasks can act on (meetings, calendar, reminders).
 */

export type ClareDeepLink = {
  agent: string | null;
  prompt: string | null;
  send: boolean;
};

const NO_LINK: ClareDeepLink = { agent: null, prompt: null, send: false };

export function parseClareDeepLink(hash = typeof location !== 'undefined' ? location.hash : ''): ClareDeepLink {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  const qIndex = raw.indexOf('?');
  if (qIndex < 0) return NO_LINK;
  const path = raw.slice(0, qIndex);
  if (path !== '/clare' && path !== 'clare') return NO_LINK;
  const params = new URLSearchParams(raw.slice(qIndex + 1));
  const agent = params.get('agent');
  const prompt = params.get('prompt');
  const cleanPrompt = prompt != null && prompt.trim() !== '' ? prompt : null;
  return {
    agent: agent && agent.trim() ? agent.trim().toLowerCase() : null,
    prompt: cleanPrompt,
    send: params.get('send') === '1' && cleanPrompt !== null
  };
}

export function askHammondHref(prompt: string): string {
  return `#/clare?agent=hammond&prompt=${encodeURIComponent(prompt)}`;
}

/** Drop the query so a reload or Back does not send the same request twice. */
export function clearClareDeepLink(): void {
  if (typeof history === 'undefined' || typeof location === 'undefined') return;
  history.replaceState(history.state, '', `${location.pathname}${location.search}#/clare`);
}

/** Apply deep link to a chat view: select agent button + fill composer (unless it will be sent). */
export function applyClareDeepLink(
  root: HTMLElement,
  link: ClareDeepLink
): void {
  if (link.agent) {
    const btn =
      root.querySelector<HTMLButtonElement>(`[data-agent="${link.agent}"]`) ??
      [...root.querySelectorAll<HTMLButtonElement>('button')].find(
        (b) => b.textContent?.trim().toLowerCase() === link.agent
      );
    btn?.click();
  }
  if (link.prompt && !link.send) {
    const composer =
      root.querySelector<HTMLTextAreaElement>('textarea[name="message"]') ??
      root.querySelector<HTMLTextAreaElement>('textarea.clare-composer__input') ??
      root.querySelector<HTMLTextAreaElement>('textarea');
    if (composer) {
      composer.value = link.prompt;
      composer.dispatchEvent(new Event('input', { bubbles: true }));
      composer.focus();
    }
  }
}

/** Apply the link, then send its prompt once when it asked to be sent. */
export async function runClareDeepLink(
  root: HTMLElement,
  send: (text: string) => Promise<void>,
  link: ClareDeepLink = parseClareDeepLink()
): Promise<void> {
  applyClareDeepLink(root, link);
  if (!link.send || !link.prompt) return;
  clearClareDeepLink();
  await send(link.prompt);
}
