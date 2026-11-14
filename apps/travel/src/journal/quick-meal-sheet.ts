/**
 * "Log meal" from a food stop: one short sheet. Dish and stars up front, an
 * optional photo, everything else folded under More. Saving makes the journal
 * moment for the stop and the Food Journal visit together.
 */
import { ensureJournal, getJournal, type JournalDocument, type JournalEnvelope } from '@/api/journal';
import { getTravelMeal, putTravelMeal, type MealPutBody, type MealRead, type MealWrite } from '@/api/travel-meal';
import { persistJournalPatch, type PersistedJournal } from '@/journal/journal-sheet-save';
import {
  dropQueuedJournalMedia,
  flushJournalOutbox,
  queueJournalMedia,
} from '@/journal/journal-outbox';
import { buildJournalMediaRow, makeMediaId, normalizeMediaContentType } from '@/journal/media-upload';
import { rememberLocalJournalMedia } from '@/journal/media-loading';
import { applyAttachmentEdits, type NewAttachment } from '@/journal/moment-attachments';
import {
  EXTRA_MAX,
  MEAL_MESSAGES,
  MEAL_TYPES,
  mealPayload,
  saveErrorMessage,
  type MealDishState,
  type MealState,
} from '@/journal/meal-section';
import { buildMealMoment, inferMealType, withFromTitle } from '@/journal/quick-meal';
import { formatWeekdayDate } from '@/lib/date-label';
import type { Item } from '@/types';
import { showHubToast } from '../../design-kit/js/hub-feedback.js';
import { attachVisualViewportInset } from '../../design-kit/js/visual-viewport.js';

export interface QuickMealDeps {
  ensureJournal(tripId: string): Promise<JournalEnvelope>;
  getJournal(tripId: string): Promise<JournalEnvelope>;
  persist(tripId: string, version: string, journal: JournalDocument): Promise<PersistedJournal>;
  getMeal(tripId: string, momentId: string): Promise<MealRead>;
  putMeal(tripId: string, momentId: string, body: MealPutBody): Promise<MealWrite>;
  queueMedia(job: { tripId: string; mediaId: string; blob: Blob; contentType: string }): Promise<void>;
  dropMedia(ids: string[]): Promise<void>;
  flush(): Promise<void>;
}

const defaultDeps: QuickMealDeps = {
  ensureJournal,
  getJournal,
  persist: persistJournalPatch,
  getMeal: getTravelMeal,
  putMeal: putTravelMeal,
  queueMedia: (job) => queueJournalMedia(job, { flush: false }),
  dropMedia: dropQueuedJournalMedia,
  flush: flushJournalOutbox,
};

export interface OpenQuickMealOptions {
  tripId: string;
  item: Item;
  /** The city's zone: "today" and the logged time are read there. */
  timeZone: string;
  /** Set when the stop already has a meal: the sheet opens it to edit. */
  momentId?: string;
  tripTitle?: string;
  deps?: Partial<QuickMealDeps>;
  now?: () => Date;
  onSaved?: (momentId: string) => void;
  onClose?: () => void;
}

const STARS = [1, 2, 3, 4, 5];

export function openQuickMealSheet(options: OpenQuickMealOptions): { destroy(): void } {
  attachVisualViewportInset();
  const deps: QuickMealDeps = { ...defaultDeps, ...options.deps };
  const now = options.now ?? (() => new Date());
  const item = options.item;
  const place = 'place' in item ? item.place : undefined;

  let mealType: string = inferMealType(item.title, item.time);
  const state: MealState = {
    title: place?.name ?? item.title,
    dishes: [{ title: '', meal_type: mealType, rating: null }],
    extras: { mood: '', vibe: '', with: withFromTitle(item.title) },
  };
  let momentId = options.momentId ?? null;
  let foodVersion: string | null = null;
  // After the moment is saved, a retry only repeats the meal call.
  let momentSaved = Boolean(options.momentId);
  let travelVersion: string | null = null;
  let loading = Boolean(options.momentId);
  let saving = false;
  let destroyed = false;
  const photos: (NewAttachment & { url: string })[] = [];
  const reading = new Set<Promise<void>>();

  const host = document.createElement('div');
  document.body.append(host);
  const back = document.createElement('div');
  back.className = 'sheet-back';
  const sheet = document.createElement('div');
  sheet.className = 'sheet addform quick-meal';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.setAttribute('aria-label', 'Log meal');

  const heading = document.createElement('h3');
  heading.textContent = item.title;
  const where = document.createElement('p');
  where.className = 'quick-meal__where';

  const form = document.createElement('form');
  form.className = 'addform__form';
  form.noValidate = true;
  const scroll = document.createElement('div');
  scroll.className = 'addform__scroll';

  const dishList = document.createElement('div');
  dishList.className = 'quick-meal__dishes';
  const addDish = document.createElement('button');
  addDish.type = 'button';
  addDish.className = 'btn btn--ghost quick-meal__add-dish';
  addDish.textContent = '+ Another dish';

  // Photo: one picker, so iOS offers camera or library.
  const photoRow = document.createElement('div');
  photoRow.className = 'quick-meal__photos';
  const thumbs = document.createElement('div');
  thumbs.className = 'journal-capture__thumbs';
  const photoInput = document.createElement('input');
  photoInput.type = 'file';
  photoInput.accept = 'image/*';
  photoInput.multiple = true;
  photoInput.hidden = true;
  const addPhoto = document.createElement('button');
  addPhoto.type = 'button';
  addPhoto.className = 'btn btn--ghost quick-meal__add-photo';
  addPhoto.textContent = 'Add photo';
  photoRow.append(thumbs, addPhoto, photoInput);

  const more = document.createElement('details');
  more.className = 'quick-meal__more';
  const moreSummary = document.createElement('summary');
  moreSummary.textContent = 'More';
  const typeSelect = document.createElement('select');
  typeSelect.name = 'meal_type';
  for (const t of MEAL_TYPES) {
    const o = document.createElement('option');
    o.value = t;
    o.textContent = t;
    typeSelect.append(o);
  }
  typeSelect.value = mealType;
  more.append(
    moreSummary,
    labelled('Meal', typeSelect),
    labelled('Who with', textInput('with', state.extras.with, EXTRA_MAX.with, (v) => (state.extras.with = v))),
    labelled('Mood', textInput('mood', state.extras.mood, EXTRA_MAX.mood, (v) => (state.extras.mood = v))),
    labelled('Vibe', textInput('vibe', state.extras.vibe, EXTRA_MAX.vibe, (v) => (state.extras.vibe = v))),
  );

  const errorNote = document.createElement('p');
  errorNote.className = 'hint';
  errorNote.hidden = true;
  errorNote.setAttribute('role', 'alert');

  scroll.append(dishList, addDish, photoRow, more, errorNote);

  const actions = document.createElement('div');
  actions.className = 'addform__actions';
  const saveBtn = document.createElement('button');
  saveBtn.type = 'submit';
  saveBtn.className = 'btn';
  saveBtn.textContent = 'Save meal';
  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'btn ghost';
  cancelBtn.textContent = 'Cancel';
  actions.append(saveBtn, cancelBtn);
  form.append(scroll, actions);
  sheet.append(heading, where, form);
  back.append(sheet);
  host.append(back);

  function labelled(text: string, control: HTMLElement): HTMLLabelElement {
    const label = document.createElement('label');
    label.className = 'quick-meal__field';
    const span = document.createElement('span');
    span.className = 'flabel';
    span.textContent = text;
    label.append(span, control);
    return label;
  }

  function textInput(name: string, value: string, max: number, onInput: (v: string) => void): HTMLInputElement {
    const input = document.createElement('input');
    input.type = 'text';
    input.name = name;
    input.value = value;
    input.maxLength = max;
    input.addEventListener('input', () => onInput(input.value));
    return input;
  }

  function renderWhere(): void {
    where.textContent = [mealType, place?.name, formatWeekdayDate(item.date)].filter(Boolean).join(' · ');
  }

  function refreshSave(): void {
    const named = state.dishes.some((d) => d.title.trim());
    saveBtn.disabled = loading || saving || !named;
  }

  function dishRow(dish: MealDishState, index: number): HTMLElement {
    const row = document.createElement('div');
    row.className = 'quick-meal__dish';
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = index === 0 ? 'What did you have?' : 'Another dish';
    input.setAttribute('aria-label', `Dish ${index + 1}`);
    input.value = dish.title;
    input.addEventListener('input', () => {
      dish.title = input.value;
      refreshSave();
    });

    const stars = document.createElement('div');
    stars.className = 'quick-meal__stars';
    stars.setAttribute('role', 'group');
    stars.setAttribute('aria-label', `Rating for dish ${index + 1}`);
    const paint = () => {
      stars.querySelectorAll<HTMLButtonElement>('button').forEach((b, i) => {
        const value = STARS[i]!;
        const on = dish.rating !== null && value <= Math.round(dish.rating);
        b.textContent = on ? '★' : '☆';
        b.setAttribute('aria-pressed', dish.rating !== null && Math.round(dish.rating) === value ? 'true' : 'false');
      });
    };
    for (const value of STARS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'quick-meal__star';
      b.setAttribute('aria-label', `${value} star${value === 1 ? '' : 's'}`);
      b.addEventListener('click', () => {
        dish.rating = dish.rating !== null && Math.round(dish.rating) === value ? null : value;
        paint();
      });
      stars.append(b);
    }
    paint();
    row.append(input, stars);

    if (index > 0 && !dish.counted) {
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'quick-meal__remove';
      remove.setAttribute('aria-label', `Remove dish ${index + 1}`);
      remove.textContent = '×';
      remove.addEventListener('click', () => {
        state.dishes = state.dishes.filter((d) => d !== dish);
        renderDishes();
      });
      row.append(remove);
    } else {
      // Keeps every row's input the same width.
      row.append(Object.assign(document.createElement('span'), { className: 'quick-meal__remove-space' }));
    }
    return row;
  }

  function renderDishes(): void {
    dishList.replaceChildren(...state.dishes.map((d, i) => dishRow(d, i)));
    refreshSave();
  }

  function renderPhotos(): void {
    thumbs.replaceChildren(
      ...photos.map((p, index) => {
        const cell = document.createElement('div');
        cell.className = 'journal-capture__thumb';
        const img = document.createElement('img');
        img.src = p.url;
        img.alt = `Photo ${index + 1}`;
        const x = document.createElement('button');
        x.type = 'button';
        x.className = 'journal-capture__thumb-remove';
        x.setAttribute('aria-label', `Remove photo ${index + 1}`);
        x.textContent = '×';
        x.addEventListener('click', () => {
          URL.revokeObjectURL(p.url);
          photos.splice(photos.indexOf(p), 1);
          renderPhotos();
        });
        cell.append(img, x);
        return cell;
      }),
    );
    thumbs.hidden = photos.length === 0;
  }

  addDish.addEventListener('click', () => {
    state.dishes.push({ title: '', meal_type: mealType, rating: null });
    renderDishes();
    dishList.querySelector<HTMLInputElement>('.quick-meal__dish:last-child input')?.focus();
  });
  typeSelect.addEventListener('change', () => {
    mealType = typeSelect.value;
    for (const d of state.dishes) d.meal_type = mealType;
    renderWhere();
  });
  addPhoto.addEventListener('click', () => photoInput.click());
  photoInput.addEventListener('change', () => {
    const files = photoInput.files ? [...photoInput.files] : [];
    photoInput.value = '';
    for (const file of files) {
      const mediaId = makeMediaId();
      const work = buildJournalMediaRow(mediaId, file, normalizeMediaContentType(file)).then((row) => {
        photos.push({ mediaId, row, blob: file, url: URL.createObjectURL(file) });
        renderPhotos();
      });
      reading.add(work);
      void work.finally(() => reading.delete(work));
    }
  });

  function close(): void {
    if (destroyed) return;
    destroyed = true;
    for (const p of photos) URL.revokeObjectURL(p.url);
    host.remove();
    options.onClose?.();
  }
  cancelBtn.addEventListener('click', close);
  back.addEventListener('click', (e) => {
    if (e.target === back && !saving) close();
  });

  function fail(message: string): void {
    saving = false;
    saveBtn.textContent = 'Save meal';
    errorNote.hidden = false;
    errorNote.textContent = message;
    errorNote.scrollIntoView?.({ block: 'nearest' });
    refreshSave();
  }

  /** New files wait in the device outbox, then the moment that shows them is saved. */
  async function saveMoment(): Promise<{ version: string; queued?: boolean } | null> {
    const added = photos.map(({ mediaId, row, blob }) => ({ mediaId, row, blob }));
    if (momentSaved && added.length === 0) return { version: travelVersion ?? '' };
    const env = await deps.ensureJournal(options.tripId);
    try {
      for (const a of added) {
        await deps.queueMedia({ tripId: options.tripId, mediaId: a.mediaId, blob: a.blob, contentType: a.row.content_type ?? 'image/jpeg' });
      }
    } catch {
      await deps.dropMedia(added.map((a) => a.mediaId));
      fail('This phone is out of space for the photo. Your meal is still here.');
      return null;
    }
    let next: JournalDocument;
    if (momentId && momentSaved) {
      next = applyAttachmentEdits(env.journal, momentId, added, []);
    } else {
      const id = momentId ?? `mom_${makeMediaId().slice(4)}`;
      const built = buildMealMoment(env.journal, item, {
        now: now(),
        timeZone: options.timeZone,
        mediaIds: [],
        momentId: id,
        tripTitle: options.tripTitle,
      });
      next = applyAttachmentEdits(built.journal, id, added, []);
      momentId = id;
    }
    let saved: PersistedJournal;
    try {
      saved = await deps.persist(options.tripId, env.version, next);
    } catch (err) {
      await deps.dropMedia(added.map((a) => a.mediaId));
      throw err;
    }
    momentSaved = true;
    for (const a of added) rememberLocalJournalMedia(a.mediaId, a.blob);
    photos.length = 0;
    renderPhotos();
    if (added.length && !saved.queued) {
      // Upload now so the Food Journal can copy the photo on this save.
      await deps.flush();
      const latest = await deps.getJournal(options.tripId);
      return { version: latest.version };
    }
    return { version: saved.version, queued: saved.queued };
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    void submit();
  });

  async function submit(): Promise<void> {
    if (saving || loading) return;
    if (!state.dishes.some((d) => d.title.trim())) return;
    saving = true;
    errorNote.hidden = true;
    saveBtn.textContent = 'Saving…';
    refreshSave();
    await Promise.all([...reading]);
    let step: 'moment' | 'meal' = 'moment';
    try {
      const moment = await saveMoment();
      if (!moment) return;
      if (moment.queued) {
        showHubToast(MEAL_MESSAGES.queued);
        options.onSaved?.(momentId!);
        close();
        return;
      }
      travelVersion = moment.version;
      step = 'meal';
      const result = await deps.putMeal(
        options.tripId,
        momentId!,
        mealPayload(state, { travel_version: travelVersion, food_version: foodVersion }),
      );
      if (result.photo_failed) showHubToast(MEAL_MESSAGES.photoFailed);
      else showHubToast('Meal saved.');
      options.onSaved?.(momentId!);
      close();
    } catch (err) {
      fail(saveErrorMessage(err, step));
    }
  }

  renderWhere();
  renderDishes();
  renderPhotos();

  if (options.momentId) {
    saveBtn.textContent = 'Loading…';
    Promise.all([deps.getMeal(options.tripId, options.momentId), deps.ensureJournal(options.tripId)])
      .then(([read, env]) => {
        if (destroyed) return;
        foodVersion = read.food_version;
        travelVersion = env.version;
        const moment = env.journal.moments.find((m) => m.id === options.momentId);
        if (read.visit) {
          state.title = read.visit.title || state.title;
          state.dishes = read.visit.dishes.map((d) => ({ ...d, rating: d.rating ?? null }));
          if (state.dishes[0]) {
            mealType = state.dishes[0].meal_type;
            typeSelect.value = mealType;
          }
        }
        if (moment?.meal) {
          state.extras = { mood: moment.meal.mood ?? '', vibe: moment.meal.vibe ?? '', with: moment.meal.with ?? '' };
          for (const key of ['with', 'mood', 'vibe'] as const) {
            const input = more.querySelector<HTMLInputElement>(`input[name="${key}"]`);
            if (input) input.value = state.extras[key];
          }
        }
        if (!state.dishes.length) state.dishes = [{ title: '', meal_type: mealType, rating: null }];
        loading = false;
        saveBtn.textContent = 'Save meal';
        renderWhere();
        renderDishes();
      })
      .catch(() => {
        if (destroyed) return;
        loading = false;
        saveBtn.textContent = 'Save meal';
        fail("Couldn't load the meal. Check your signal and try again.");
        saveBtn.disabled = true;
      });
  } else {
    queueMicrotask(() => dishList.querySelector<HTMLInputElement>('input')?.focus());
  }

  return { destroy: close };
}
