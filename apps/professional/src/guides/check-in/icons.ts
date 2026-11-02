// Check-in icons: constants only, never user text. One line weight, round caps, currentColor.
// Approved mockup: docs/mockups/check-in/check-in.html
const line = (paths: string) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

export const CHECK_IN_ICONS = {
  open: line('<path d="M5 5h14v10h-8l-4 3.5V15H5z"/><path d="M10 9.5h4"/>'),
  safety: line('<path d="M12 3.5l7 2.8v5c0 4.3-2.9 7.6-7 9.2-4.1-1.6-7-4.9-7-9.2v-5z"/>'),
  listen: line('<path d="M7.5 10a4.5 4.5 0 0 1 9 0c0 3.2-3.2 3.6-3.2 6.6a2.6 2.6 0 0 1-5.1.6"/><path d="M10.3 10.2a1.7 1.7 0 0 1 3.4 0"/>'),
  hope: line('<path d="M3.5 17.5h17"/><path d="M7 17.5a5 5 0 0 1 10 0"/><path d="M12 7v2.2M5.6 10.4l1.5 1.5M18.4 10.4l-1.5 1.5"/>'),
  help: line('<circle cx="8" cy="8.5" r="2.6"/><circle cx="16" cy="8.5" r="2.6"/><path d="M3.5 18.5a4.5 4.5 0 0 1 9 0M11.5 18.5a4.5 4.5 0 0 1 9 0"/>'),
  side: line('<path d="M6.5 4v16"/><path d="M6.5 12h7a4 4 0 0 0 4-4V5.5"/><path d="M15 7.5l2.5-2.5L20 7.5"/>'),
  handover: line('<path d="M4 12h11"/><path d="M11.5 8l4 4-4 4"/><path d="M19.5 5v14"/>'),
  lock: line('<rect x="5.5" y="11" width="13" height="9" rx="2"/><path d="M8.5 11V8.2a3.5 3.5 0 0 1 7 0V11"/>'),
  check: line('<path d="M5 12.5l4.5 4.5L19 7.5"/>')
} as const;

export type CheckInIcon = keyof typeof CHECK_IN_ICONS;

/** The emblem: a bridge. Two banks, one span. */
export const CHECK_IN_EMBLEM = `<svg viewBox="0 0 44 44" aria-hidden="true"><rect width="44" height="44" rx="12" fill="#e6eee8"/><path d="M14 22.3V30M22 18V30M30 22.3V30" stroke="#8fae9c" stroke-width="2" stroke-linecap="round"/><path class="ci-emblem__span" d="M7 30C12 14 32 14 37 30" fill="none" stroke="#5f7f6e" stroke-width="3" stroke-linecap="round"/><path d="M5.5 30h33" stroke="#1b2230" stroke-width="2.4" stroke-linecap="round"/><path d="M12 35.5c2-1.3 4-1.3 6 0s4 1.3 6 0 4-1.3 6 0" fill="none" stroke="#8fae9c" stroke-width="1.6" stroke-linecap="round"/></svg>`;

export function iconEl(doc: Document, name: CheckInIcon, className = 'ci-ico'): HTMLElement {
  const span = doc.createElement('span');
  span.className = className;
  span.innerHTML = CHECK_IN_ICONS[name];
  return span;
}

export function emblemEl(doc: Document, className = 'guide-emblem ci-emblem'): HTMLElement {
  const span = doc.createElement('span');
  span.className = className;
  span.innerHTML = CHECK_IN_EMBLEM;
  return span;
}
