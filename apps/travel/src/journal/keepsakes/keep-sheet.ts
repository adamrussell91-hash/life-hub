import type { JournalDocument } from '@/api/journal';
import { bootstrapJournalForFirstMoment } from '@/journal/capture-context';
import { dropQueuedJournalMedia, flushJournalOutbox, queueJournalMedia } from '@/journal/journal-outbox';
import { isFixtureVersion, persistJournalPatch } from '@/journal/journal-sheet-save';
import { addPhotoKeepsake, type KeepsakeKind } from '@/journal/keepsakes/model';
import { configureJournalImage, rememberLocalJournalMedia } from '@/journal/media-loading';
import { buildJournalMediaRow, makeMediaId, normalizeMediaContentType } from '@/journal/media-upload';
import { button, el, ICONS } from '@/journal/story/dom';
import { openStorySheet, sheetRow, type StorySheetHandle } from '@/journal/story/sheet';
import type { JournalCoordinates, JournalMedia, JournalMoment } from '@/journal/types';

export interface KeepKindChoice {
  kind: KeepsakeKind;
  label: string;
  hint: string;
  /** The name a keepsake gets when the traveller types none. */
  fallbackName: string;
  placeholder: string;
}

export const KEEP_KINDS: readonly KeepKindChoice[] = [
  { kind: 'ticket', label: 'Ticket or pass', hint: 'Tram, museum, gig, boarding pass', fallbackName: 'Ticket', placeholder: 'Tram ticket' },
  { kind: 'poster', label: 'Poster or flyer', hint: 'Tall things from walls and doorways', fallbackName: 'Poster', placeholder: 'Concert poster' },
  { kind: 'round', label: 'Coaster or label', hint: 'Round things from bars and bottles', fallbackName: 'Coaster', placeholder: 'Bar coaster' },
  { kind: 'other', label: 'Anything else', hint: 'A receipt, a map, a pressed flower', fallbackName: 'Keepsake', placeholder: 'What is it?' },
];

export interface OpenKeepSheetOptions {
  anchor: HTMLElement;
  tripId: string;
  journal: JournalDocument;
  version: string;
  /** Where it is filed when there is no moment: the current city and today. */
  legId: string;
  localDate: string;
  timeZone?: string;
  tripTitle?: string;
  /** "Keep as a keepsake" on a moment: linked to it, and using its first photo when it has one. */
  moment?: JournalMoment;
  momentPhoto?: JournalMedia;
  onSaved: (envelope: { journal: JournalDocument; version: string }) => void;
  onClose?: () => void;
}

function clockIn(timeZone: string | undefined): string | undefined {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: timeZone || undefined,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(new Date());
    const hour = parts.find((p) => p.type === 'hour')?.value;
    const minute = parts.find((p) => p.type === 'minute')?.value;
    return hour && minute ? `${hour === '24' ? '00' : hour}:${minute}` : undefined;
  } catch {
    return undefined;
  }
}

/** The phone's place, only when the traveller has already allowed it. Never asks. */
async function quietLocation(): Promise<JournalCoordinates | undefined> {
  try {
    if (!navigator.geolocation || !navigator.permissions) return undefined;
    const status = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
    if (status.state !== 'granted') return undefined;
    return await new Promise((resolve) => {
      const timer = setTimeout(() => resolve(undefined), 2500);
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          clearTimeout(timer);
          resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude });
        },
        () => {
          clearTimeout(timer);
          resolve(undefined);
        },
        { maximumAge: 120000, timeout: 2500 },
      );
    });
  } catch {
    return undefined;
  }
}

function ensureDay(journal: JournalDocument, legId: string, localDate: string): JournalDocument {
  if (journal.days.some((d) => d.leg_id === legId && d.local_date === localDate)) return journal;
  const id = `day_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
  return { ...journal, days: [...journal.days, { id, leg_id: legId, local_date: localDate, lifecycle: 'live' }] };
}

/**
 * Keep something: choose what it is, photograph it (or choose a photo), name it if you like.
 * A failed save keeps the sheet open and says why.
 */
export function openKeepSheet(options: OpenKeepSheetOptions): StorySheetHandle {
  const sheet = openStorySheet({
    anchor: options.anchor,
    label: options.moment ? 'Keep as a keepsake' : 'Keep something',
    title: options.moment ? 'Keep as a keepsake' : 'Keep something',
    subtitle: options.moment ? 'It stays with this moment' : 'What is it?',
    onClose: () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      options.onClose?.();
    },
  });

  let previewUrl = '';
  let chosen: KeepKindChoice = KEEP_KINDS[0]!;

  const picker = el('input');
  picker.type = 'file';
  picker.accept = 'image/*';
  picker.hidden = true;
  picker.setAttribute('aria-hidden', 'true');
  picker.tabIndex = -1;

  const choices = el('div', 'keep-choices');
  const form = el('form', 'keep-form');
  form.noValidate = true;
  form.hidden = true;
  sheet.body.append(choices, form, picker);

  for (const choice of KEEP_KINDS) {
    choices.append(
      sheetRow({
        label: choice.label,
        hint: choice.hint,
        paths: ICONS.keepsake,
        onSelect: () => {
          chosen = choice;
          if (options.momentPhoto) showForm({ media: options.momentPhoto });
          else picker.click();
        },
      }),
    );
  }
  choices.append(
    sheetRow({
      label: 'No photo, just a name',
      paths: ICONS.pen,
      onSelect: () => {
        chosen = KEEP_KINDS[3]!;
        showForm({});
      },
    }),
  );

  picker.addEventListener('change', () => {
    const file = picker.files?.[0];
    picker.value = '';
    if (file) showForm({ file });
  });

  function showForm(source: { file?: File; media?: JournalMedia }): void {
    choices.hidden = true;
    form.hidden = false;
    form.replaceChildren();

    if (source.file || source.media) {
      const preview = el('div', 'keep-form__preview');
      const object = el('span', `keepsake keepsake--photo is-${chosen.kind}`);
      const inner = el('span', 'keepsake__in');
      const img = el('img');
      img.alt = '';
      if (source.file) {
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        previewUrl = URL.createObjectURL(source.file);
        img.src = previewUrl;
      } else if (source.media) {
        configureJournalImage(img, { tripId: options.tripId, media: source.media, layout: 'pair', eager: true });
      }
      inner.append(img);
      object.append(inner);
      preview.append(object);
      form.append(preview);
    }

    const nameLabel = el('label', undefined, source.file || source.media ? 'Name (optional)' : 'Name');
    const name = el('input');
    name.type = 'text';
    name.autocomplete = 'off';
    name.maxLength = 80;
    name.placeholder = chosen.placeholder;
    nameLabel.append(name);

    const noteLabel = el('label', undefined, 'Note (optional)');
    const note = el('input');
    note.type = 'text';
    note.autocomplete = 'off';
    note.maxLength = 200;
    note.placeholder = 'Where it came from, who it is for';
    noteLabel.append(note);

    const status = el('p', 'keep-form__status');
    status.setAttribute('role', 'alert');
    status.hidden = true;

    const actions = el('div', 'keep-form__actions');
    const backBtn = button('btn btn--secondary', 'Back');
    const save = button('btn btn--primary', 'Keep it');
    save.type = 'submit';
    actions.append(backBtn, save);
    form.append(nameLabel, noteLabel, status, actions);

    backBtn.addEventListener('click', () => {
      form.hidden = true;
      choices.hidden = false;
    });

    const fail = (message: string): void => {
      save.disabled = false;
      save.textContent = 'Keep it';
      status.hidden = false;
      status.textContent = message;
    };

    form.onsubmit = (ev) => {
      ev.preventDefault();
      const title = name.value.trim() || (source.file || source.media ? chosen.fallbackName : '');
      if (!title) {
        name.focus();
        return;
      }
      save.disabled = true;
      save.textContent = 'Keeping…';
      status.hidden = true;
      void keep(title, note.value.trim() || undefined, source, fail);
    };

    if (!source.file && !source.media) name.focus();
  }

  async function keep(
    title: string,
    note: string | undefined,
    source: { file?: File; media?: JournalMedia },
    fail: (message: string) => void,
  ): Promise<void> {
    const live = !isFixtureVersion(options.version);
    let journal = options.journal;
    let mediaId = source.media?.id;

    if (source.file) {
      const contentType = normalizeMediaContentType(source.file);
      mediaId = makeMediaId();
      try {
        const row = await buildJournalMediaRow(mediaId, source.file, contentType);
        if (live) await queueJournalMedia({ tripId: options.tripId, mediaId, blob: source.file, contentType }, { flush: false });
        journal = { ...journal, media: [...journal.media, row] };
      } catch {
        await dropQueuedJournalMedia([mediaId]);
        fail('This phone is out of space for the photo. Nothing was lost: free some space and try again.');
        return;
      }
    }

    const moment = options.moment;
    if (!moment) {
      journal = ensureDay(
        bootstrapJournalForFirstMoment(journal, options.legId, options.localDate, options.tripTitle?.trim() || 'Trip'),
        options.legId,
        options.localDate,
      );
    }
    const coordinates = moment ? undefined : await quietLocation();
    const next = addPhotoKeepsake(journal, {
      kind: chosen.kind,
      title,
      note,
      mediaId,
      momentId: moment?.id,
      legId: moment ? undefined : options.legId,
      localDate: moment ? undefined : options.localDate,
      localTime: moment ? undefined : clockIn(options.timeZone),
      coordinates,
    });

    try {
      const envelope = await persistJournalPatch(options.tripId, options.version, next);
      if (source.file && mediaId) {
        rememberLocalJournalMedia(mediaId, source.file);
        if (live) void flushJournalOutbox();
      }
      options.onSaved(envelope);
      sheet.close();
    } catch {
      if (source.file && mediaId) await dropQueuedJournalMedia([mediaId]);
      fail('Could not save. Check your connection and try again.');
    }
  }

  return sheet;
}
