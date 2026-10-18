/** Inline icons for the classroom tools (stroke follows currentColor). */
import type { ClassroomToolId } from '@/schemas/block';

const svg = (body: string, extra = '') =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"${extra}>${body}</svg>`;

export const ICON: Record<ClassroomToolId | 'gear' | 'close' | 'expand' | 'sound' | 'muted' | 'trash', string> = {
  gear: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>', ' stroke-width="1.8"'),
  timer: svg('<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2M9 2h6"/>'),
  stopwatch: svg('<circle cx="12" cy="14" r="7.5"/><path d="M12 14v-4M10 2.5h4M12 2.5v4M18.5 6.5 20 5"/>'),
  names: svg('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M17 4.5a3.5 3.5 0 0 1 0 7M21.5 20a6 6 0 0 0-3.5-5.5"/>'),
  number: svg('<path d="M9 3 7 21M17 3l-2 18M4 8.5h17M3 15.5h17"/>'),
  groups: svg('<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>'),
  technique: svg('<rect x="3.5" y="3.5" width="17" height="17" rx="3"/><path d="M9 15.5v-7h3.5a2 2 0 0 1 0 4H9M14 15.5l-2-3"/>'),
  scores: svg('<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4zM7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4"/>'),
  coin: svg('<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/>'),
  dice: svg('<rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="8.5" cy="8.5" r="1" fill="currentColor"/><circle cx="12" cy="12" r="1" fill="currentColor"/><circle cx="15.5" cy="15.5" r="1" fill="currentColor"/>'),
  close: svg('<path d="M6 6l12 12M18 6 6 18"/>'),
  expand: svg('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>'),
  sound: svg('<path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/>'),
  muted: svg('<path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M17 9l5 6M22 9l-5 6"/>'),
  trash: svg('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>')
};
