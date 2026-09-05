/** Shared sign-out utilities — mounted into `.page-header__actions` per design kit. */

let utilitiesRoot: HTMLElement | null = null;

export function registerHubUtilities(el: HTMLElement | null): void {
  utilitiesRoot = el;
}

export function getHubUtilities(): HTMLElement | null {
  return utilitiesRoot;
}

/** Append the registered utilities block as the last child of page-header actions. */
export function appendHubUtilitiesToActions(actions: HTMLElement): void {
  if (!utilitiesRoot) return;
  if (!actions.contains(utilitiesRoot)) {
    actions.append(utilitiesRoot);
  }
}
