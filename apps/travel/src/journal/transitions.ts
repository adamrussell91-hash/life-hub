import type { JournalDocument } from '@/api/journal';
import { tripRoute } from '@/app/router';
import type { Item, TicketItem, Trip } from '@/types';
import { attachVisualViewportInset } from '../../design-kit/js/visual-viewport.js';
import { formatDisplayDate } from '../../design-kit/js/format-display-date.js';
import { persistJournalPatch } from '@/journal/journal-sheet-save';
import type {
  JournalLeg,
  JournalTransition,
  JournalTransitionDisplayOverride,
  JournalTransitionMode,
} from '@/journal/types';

export interface TransitionLabelContext {
  legsById: Map<string, JournalLeg>;
  trip?: Trip;
}

export function transitionModeGlyph(mode: JournalTransitionMode): string {
  const map: Record<JournalTransitionMode, string> = {
    flight: '✈',
    train: '🚆',
    car: '🚗',
    ferry: '⛴',
    other: '→',
  };
  return map[mode] ?? '→';
}

export function isVerifiedItineraryTicket(item: Item | undefined): item is TicketItem {
  if (!item || (item.kind !== 'flight' && item.kind !== 'train')) return false;
  return Boolean(
    item.from_code?.trim() &&
      item.to_code?.trim() &&
      item.carrier?.trim() &&
      item.number?.trim(),
  );
}

export function findItineraryTicket(trip: Trip | undefined, itemId?: string): TicketItem | undefined {
  if (!trip || !itemId) return undefined;
  const item = trip.items.find((row) => row.id === itemId);
  return isVerifiedItineraryTicket(item) ? item : undefined;
}

function legDestination(legsById: Map<string, JournalLeg>, legId: string, fallback: string): string {
  return legsById.get(legId)?.destination?.trim() || fallback;
}

function ticketEndpointLabel(
  ticket: TicketItem,
  side: 'departure' | 'arrival',
  destinationFallback: string,
): string {
  const code = side === 'departure' ? ticket.from_code : ticket.to_code;
  const name = side === 'departure' ? ticket.from_name : ticket.to_name;
  if (isVerifiedItineraryTicket(ticket)) {
    const trimmedName = name?.trim();
    if (trimmedName) return `${trimmedName} (${code.trim()})`;
    return code.trim();
  }
  return name?.trim() || destinationFallback;
}

export interface ResolvedTransitionLabels {
  local_date?: string;
  departure: string;
  arrival: string;
}

export function resolveTransitionLabels(
  trn: JournalTransition,
  ctx: TransitionLabelContext,
): ResolvedTransitionLabels {
  const override = trn.display_override;
  const ticketRaw = ctx.trip?.items.find((row) => row.id === trn.itinerary_item_id);
  const ticket = isVerifiedItineraryTicket(ticketRaw) ? ticketRaw : undefined;
  const fromDest = legDestination(ctx.legsById, trn.from_leg_id, 'Departure');
  const toDest = legDestination(ctx.legsById, trn.to_leg_id, 'Arrival');

  const defaultDeparture = ticket
    ? ticketEndpointLabel(ticket, 'departure', fromDest)
    : trn.itinerary_item_id && ticketRaw
      ? fromDest
      : trn.departure_label?.trim() || fromDest;
  const defaultArrival = ticket
    ? ticketEndpointLabel(ticket, 'arrival', toDest)
    : trn.itinerary_item_id && ticketRaw
      ? toDest
      : trn.arrival_label?.trim() || toDest;

  const departure = override?.departure_label?.trim() || defaultDeparture;
  const arrival = override?.arrival_label?.trim() || defaultArrival;

  return {
    local_date: override?.local_date?.trim() || trn.local_date,
    departure,
    arrival,
  };
}

export function transitionForFromLeg(
  journal: { transitions: JournalTransition[] },
  fromLegId: string,
): JournalTransition | undefined {
  return journal.transitions.find(
    (t) => t.lifecycle === 'live' && t.from_leg_id === fromLegId,
  );
}

export function applyTransitionDisplayOverride(
  trn: JournalTransition,
  patch: JournalTransitionDisplayOverride,
): JournalTransition {
  const next: JournalTransitionDisplayOverride = { ...trn.display_override };
  for (const [key, value] of Object.entries(patch) as [keyof JournalTransitionDisplayOverride, string | undefined][]) {
    const trimmed = value?.trim();
    if (trimmed) next[key] = trimmed;
    else delete next[key];
  }
  return {
    ...trn,
    display_override: Object.keys(next).length ? next : undefined,
  };
}

export function journeyDetailsRoute(tripId: string, ticket: TicketItem): string {
  return tripRoute(tripId, ticket.city_id, ticket.date);
}

export interface RenderTransitionOptions {
  trn: JournalTransition;
  ctx: TransitionLabelContext;
  tripId: string;
  journal?: JournalDocument;
  version?: string;
  anchor?: HTMLElement;
  onJournalSaved?: (envelope: { journal: JournalDocument; version: string }) => void;
}

export function renderJournalTransition(options: RenderTransitionOptions): HTMLElement {
  const { trn, ctx, tripId } = options;
  const labels = resolveTransitionLabels(trn, ctx);
  const ticket = findItineraryTicket(ctx.trip, trn.itinerary_item_id);

  const block = document.createElement('div');
  block.className = 'journal-transition';
  block.setAttribute('data-journal-transition', trn.id);
  block.id = trn.id;

  const date = document.createElement('p');
  date.className = 'journal-transition__date num';
  if (labels.local_date) date.textContent = formatDisplayDate(labels.local_date);

  const mode = document.createElement('span');
  mode.className = 'journal-transition__mode';
  mode.setAttribute('aria-hidden', 'true');
  mode.textContent = transitionModeGlyph(trn.mode);

  const route = document.createElement('p');
  route.className = 'journal-transition__route';
  route.textContent = `${labels.departure} → ${labels.arrival}`;

  const actions = document.createElement('div');
  actions.className = 'journal-transition__actions';

  const editBtn = document.createElement('button');
  editBtn.type = 'button';
  editBtn.className = 'btn btn--ghost journal-transition__edit';
  editBtn.textContent = 'Edit labels';
  editBtn.disabled = !options.journal || !options.version || !options.anchor;
  editBtn.title = editBtn.disabled ? 'Labels are read-only in preview' : 'Correct journal labels only';

  const details = document.createElement('button');
  details.type = 'button';
  details.className = 'btn btn--ghost journal-transition__details';
  details.textContent = 'View journey details';
  details.disabled = !ticket;
  details.title = ticket
    ? 'Open itinerary details (bookings are not changed from the journal)'
    : 'Link an itinerary ticket to open booking details';

  if (ticket) {
    details.addEventListener('click', () => {
      location.hash = journeyDetailsRoute(tripId, ticket);
    });
  }

  if (!editBtn.disabled) {
    editBtn.addEventListener('click', () => {
      openTransitionLabelSheet({
        trn,
        tripId,
        journal: options.journal!,
        version: options.version!,
        anchor: options.anchor!,
        ctx: options.ctx,
        onSaved: options.onJournalSaved,
      });
    });
  }

  actions.append(editBtn, details);
  block.append(date, mode, route, actions);
  return block;
}

export interface OpenTransitionLabelSheetOptions {
  trn: JournalTransition;
  tripId: string;
  journal: JournalDocument;
  version: string;
  anchor: HTMLElement;
  ctx: TransitionLabelContext;
  onSaved?: (envelope: { journal: JournalDocument; version: string }) => void;
  onClose?: () => void;
}

export function openTransitionLabelSheet(
  options: OpenTransitionLabelSheetOptions,
): { destroy(): void } {
  attachVisualViewportInset();
  let destroyed = false;
  const labels = resolveTransitionLabels(options.trn, options.ctx);

  const back = document.createElement('div');
  back.className = 'sheet-back';
  const sheet = document.createElement('div');
  sheet.className = 'sheet addform journal-transition-sheet hub-morph-dialog';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.setAttribute('aria-label', 'Edit transition labels');

  const title = document.createElement('h3');
  title.textContent = 'Transition labels';

  const hint = document.createElement('p');
  hint.className = 'journal-sheet__hint';
  hint.textContent =
    'These labels are journal-only. Your itinerary bookings stay unchanged unless you edit them in the trip planner.';

  const form = document.createElement('form');
  form.className = 'addform__form compose';
  form.noValidate = true;
  const scroll = document.createElement('div');
  scroll.className = 'addform__scroll';

  const depLabel = document.createElement('label');
  depLabel.textContent = 'Departure label';
  const depInput = document.createElement('input');
  depInput.className = 'input';
  depInput.name = 'departure';
  depInput.value = labels.departure;

  const arrLabel = document.createElement('label');
  arrLabel.textContent = 'Arrival label';
  const arrInput = document.createElement('input');
  arrInput.className = 'input';
  arrInput.name = 'arrival';
  arrInput.value = labels.arrival;

  const actions = document.createElement('div');
  actions.className = 'addform__actions';
  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'btn btn--secondary';
  cancelBtn.textContent = 'Cancel';
  const saveBtn = document.createElement('button');
  saveBtn.type = 'submit';
  saveBtn.className = 'btn btn--primary';
  saveBtn.textContent = 'Save';

  const status = document.createElement('p');
  status.className = 'journal-sheet__status';
  status.hidden = true;

  function destroy(): void {
    if (destroyed) return;
    destroyed = true;
    back.remove();
    options.onClose?.();
  }

  cancelBtn.addEventListener('click', () => destroy());
  back.addEventListener('click', (ev) => {
    if (ev.target === back) destroy();
  });

  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    void (async () => {
      saveBtn.disabled = true;
      const patched = applyTransitionDisplayOverride(options.trn, {
        departure_label: depInput.value,
        arrival_label: arrInput.value,
      });
      const transitions = options.journal.transitions.map((t) =>
        t.id === options.trn.id ? patched : t,
      );
      const nextJournal: JournalDocument = {
        ...options.journal,
        revision: options.journal.revision + 1,
        transitions,
      };
      try {
        const envelope = await persistJournalPatch(options.tripId, options.version, nextJournal);
        options.onSaved?.(envelope);
        destroy();
      } catch {
        status.hidden = false;
        status.textContent = 'Could not save. Try again.';
        saveBtn.disabled = false;
      }
    })();
  });

  scroll.append(hint, depLabel, depInput, arrLabel, arrInput, status);
  form.append(scroll, actions);
  actions.append(cancelBtn, saveBtn);
  sheet.append(title, form);
  back.append(sheet);
  options.anchor.append(back);
  depInput.focus();

  return { destroy };
}
