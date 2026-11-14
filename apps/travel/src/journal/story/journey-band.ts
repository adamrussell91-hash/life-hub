import type { JournalDocument } from '@/api/journal';
import type { JournalTransition, JournalTransitionMode } from '@/journal/types';
import {
  findItineraryTicket,
  journeyDetailsRoute,
  openTransitionLabelSheet,
  resolveTransitionLabels,
  type TransitionLabelContext,
} from '@/journal/transitions';
import { clock12, longDate } from '@/journal/trip-days';
import { ICONS, button, el, icon } from '@/journal/story/dom';

const MODE: Record<JournalTransitionMode, { label: string; paths: string | string[] }> = {
  flight: { label: 'Flight', paths: ICONS.plane },
  train: { label: 'Train', paths: ICONS.train },
  car: { label: 'Drive', paths: ICONS.car },
  ferry: { label: 'Ferry', paths: ICONS.ferry },
  other: { label: 'Journey', paths: ICONS.next },
};

export interface JourneyBandOptions {
  trn: JournalTransition;
  ctx: TransitionLabelContext;
  tripId: string;
  journal?: JournalDocument;
  version?: string;
  anchor?: HTMLElement;
  onJournalSaved?: (envelope: { journal: JournalDocument; version: string }) => void;
}

/** The journey between two cities: date, mode, both ends, and the booking's times when there is one. */
export function renderJourneyBand(options: JourneyBandOptions): HTMLElement {
  const { trn, ctx, tripId } = options;
  const labels = resolveTransitionLabels(trn, ctx);
  const ticket = findItineraryTicket(ctx.trip, trn.itinerary_item_id);
  const mode = MODE[trn.mode] ?? MODE.other;
  const from = ctx.legsById.get(trn.from_leg_id)?.destination?.trim() || labels.departure;
  const to = ctx.legsById.get(trn.to_leg_id)?.destination?.trim() || labels.arrival;

  const band = el('section', 'story-journey');
  band.id = trn.id;
  band.setAttribute('data-journal-transition', trn.id);

  const eyebrow = [labels.local_date ? longDate(labels.local_date) : '', mode.label].filter(Boolean).join(' · ');
  band.append(el('p', 'story-eyebrow story-journey__eyebrow num', eyebrow));
  band.append(el('h3', 'story-journey__title', `${from} to ${to}`));

  const line = el('div', 'story-journey__line');
  line.setAttribute('aria-hidden', 'true');
  const glyph = el('span', 'story-journey__glyph');
  glyph.append(icon(mode.paths));
  line.append(glyph);
  band.append(line);

  const ends = el('div', 'story-journey__ends');
  const end = (time: string, place: string, side: 'from' | 'to'): HTMLElement => {
    const box = el('div', `story-journey__end story-journey__end--${side}`);
    if (time) box.append(el('b', 'num', time));
    box.append(el('span', undefined, place));
    return box;
  };
  ends.append(
    end(ticket ? clock12(ticket.depart_time) : '', labels.departure, 'from'),
    end(ticket ? clock12(ticket.arrive_time) : '', labels.arrival, 'to'),
  );
  band.append(ends);

  const actions = el('div', 'story-journey__actions');
  const canEdit = Boolean(options.journal && options.version && options.anchor);
  if (canEdit) {
    const edit = button('story-journey__action', 'Edit labels');
    edit.addEventListener('click', () => {
      openTransitionLabelSheet({
        trn,
        tripId,
        journal: options.journal!,
        version: options.version!,
        anchor: options.anchor!,
        ctx,
        onSaved: options.onJournalSaved,
      });
    });
    actions.append(edit);
  }
  if (ticket) {
    const details = button('story-journey__action', 'Journey details');
    details.addEventListener('click', () => {
      location.hash = journeyDetailsRoute(tripId, ticket);
    });
    actions.append(details);
  }
  if (actions.childElementCount) band.append(actions);
  return band;
}
