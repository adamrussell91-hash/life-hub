import { USE_LOCAL_DATA } from "../api/client";

const REFRESH_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M21 12a9 9 0 1 1-2.6-6.3" />
      <path d="M21 3v6h-6" />
    </svg>`;

const SIGN_OUT_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M10 7V6a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-7a2 2 0 0 1-2-2v-1" />
      <path d="M15 12H3" />
      <path d="m7 8-4 4 4 4" />
    </svg>`;

/**
 * Discrete canvas top-right utilities. Refresh always; sign-out when a
 * session exists. Keep `data-logout` / `data-hub-refresh` for the shell.
 */
export function hubUtilitiesHtml(): string {
  const signOut = USE_LOCAL_DATA
    ? ""
    : `<button class="hub-icon-btn" type="button" data-logout aria-label="Sign out" title="Sign out">
    ${SIGN_OUT_ICON}
  </button>`;
  return `<div class="hub-utilities">
  <button class="hub-icon-btn" type="button" data-hub-refresh aria-label="Refresh" title="Refresh">
    ${REFRESH_ICON}
  </button>
  ${signOut}
</div>`;
}

/** Wrap utilities in `.page-header__actions` when present. */
export function hubUtilitiesActionsHtml(): string {
  const utilities = hubUtilitiesHtml();
  return utilities ? `<div class="page-header__actions">${utilities}</div>` : "";
}

export function titleRowHtml(title: string): string {
  return `<div class="page-header__title-row"><h1 class="page-header__title hub-kinetic">${title}</h1></div>`;
}
