const REFRESH_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M21 12a9 9 0 1 1-2.6-6.3" />
      <path d="M21 3v6h-6" />
    </svg>`;

/** Refresh, top-right of the page header. Sign out is not page chrome. */
export function hubUtilitiesHtml(): string {
  return `<div class="hub-utilities">
  <button class="hub-icon-btn" type="button" data-hub-refresh aria-label="Refresh" title="Refresh">
    ${REFRESH_ICON}
  </button>
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
