// apps/tasks/src/chat/clare-deep-link.ts
/**
 * G-35 Ask Hammond deep link: `#/clare?agent=hammond&prompt=<urlencoded>`
 * Selects the agent and pre-fills the composer. Does not send.
 */

export type ClareDeepLink = {
  agent: string | null;
  prompt: string | null;
};

export function parseClareDeepLink(hash = typeof location !== 'undefined' ? location.hash : ''): ClareDeepLink {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  const qIndex = raw.indexOf('?');
  if (qIndex < 0) return { agent: null, prompt: null };
  const path = raw.slice(0, qIndex);
  if (path !== '/clare' && path !== 'clare') return { agent: null, prompt: null };
  const params = new URLSearchParams(raw.slice(qIndex + 1));
  const agent = params.get('agent');
  const prompt = params.get('prompt');
  return {
    agent: agent && agent.trim() ? agent.trim().toLowerCase() : null,
    prompt: prompt != null && prompt !== '' ? prompt : null
  };
}

export function askHammondHref(prompt: string): string {
  return `#/clare?agent=hammond&prompt=${encodeURIComponent(prompt)}`;
}

/** Apply deep link to a chat view: select agent button + fill composer. */
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
  if (link.prompt) {
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
