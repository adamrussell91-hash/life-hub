/**
 * The guide to the Returned work tab: shows itself the first time a student opens the tab, then
 * shrinks into the small ? button in the corner, which replays it. One per page.
 */
import { mountTour, type TourHandle } from '@/app/tour';

export const RETURNED_TOUR_KEY = 'returned-feedback-tour:v1';

let live: TourHandle | null = null;

/** `panel`: the tab's panel. A step whose part isn't on the page is left out. */
export function mountReturnedTour(panel: HTMLElement): TourHandle {
  live?.dispose();
  const at = (key: string) => () => panel.querySelector<HTMLElement>(`[data-tour="${key}"]`);
  live = mountTour({
    host: panel.closest<HTMLElement>('.pm-profile') ?? panel,
    storageKey: RETURNED_TOUR_KEY,
    // Inside the tab's panel, so the ? button only shows on this tab and leaves with the page.
    helpParent: panel,
    steps: [
      { title: 'Your feedback', body: 'This is where your work comes back from your teacher. Here is what each part is.' },
      { target: at('unread'), title: 'New for you', body: 'Work your teacher has sent back that you have yet to open. Each card says how it went. Tap one to read it.' },
      { target: at('patterns'), title: 'What your teacher keeps saying', body: 'The things that come up most. Gold is something to work on. Green is something you do well. Tap one to see where it came up.' },
      { target: at('timeline'), title: 'Every piece, in order', body: 'Each dot is one piece of feedback, oldest on the left. Blue is written, purple is spoken, orange is short answer. A ring is new. Tap a dot, then Open.' },
      { target: at('trends'), title: 'How you’re going', body: 'Where you started, where you are now, and the one thing to focus on next.' },
      { target: at('more'), title: 'More detail', body: 'Your skills, step by step, for when you want a closer look.' }
    ]
  });
  return live;
}
