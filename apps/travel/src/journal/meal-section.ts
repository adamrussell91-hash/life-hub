import { ApiClientError } from '@/api/client';
import type { FoodDish, FoodVisit, MealPutBody, MealRead } from '@/api/travel-meal';
import type { JournalMedia, JournalMoment } from '@/journal/types';

export const MEAL_TYPES = ['Breakfast', 'Lunch', 'Dinner', 'Snack', 'Dessert', 'Drinks'] as const;
// Same limits as the journal schema.
export const EXTRA_MAX = { mood: 40, vibe: 600, with: 200 } as const;
export const RATING_OPTIONS: (number | null)[] = [null, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5];

export interface MealDishState {
  id?: string;
  title: string;
  title_en?: string;
  meal_type: string;
  rating: number | null;
  ingredients?: string;
  counted?: boolean;
}

export interface MealState {
  title: string;
  dishes: MealDishState[];
  extras: { mood: string; vibe: string; with: string };
}

export interface MealSectionHandle {
  /** False when the meal could not be loaded; then nothing about the meal is saved. */
  available: boolean;
  wasLinked: boolean;
  foodVersion: string | null;
  enabled(): boolean;
  state(): MealState;
  /** True when the meal differs from what was loaded, or is newly switched on. */
  changed(): boolean;
  /** Moment photos the linked visit has not copied yet; a save retries them. */
  photosPending: string[];
}

// Older moments have no author; they are Adam's.
export function canBeMeal(moment: Pick<JournalMoment, 'author'>): boolean {
  return (moment.author ?? 'adam') === 'adam';
}

// Only the fields the sheet edits are sent; the server keeps the rest of each dish.
export function mealPayload(
  state: MealState,
  versions: { travel_version: string; food_version: string | null },
): MealPutBody {
  const dishes: FoodDish[] = state.dishes
    .filter((d) => d.title.trim())
    .map((d) => ({
      ...(d.id ? { id: d.id } : {}),
      title: d.title.trim(),
      meal_type: d.meal_type,
      rating: d.rating,
    }));
  const extras: MealPutBody['extras'] = {};
  for (const key of ['mood', 'vibe', 'with'] as const) {
    const value = state.extras[key].trim();
    if (value) extras[key] = value;
  }
  return {
    travel_version: versions.travel_version,
    food_version: versions.food_version,
    food: { title: state.title.trim(), dishes },
    extras,
  };
}

// Compares what would be sent, so blank rows, spaces and read-only fields
// don't count. No loaded state means the meal is new.
export function mealChanged(loaded: MealState | null, current: MealState): boolean {
  if (!loaded) return true;
  const body = (s: MealState) => {
    const { food, extras } = mealPayload(s, { travel_version: '', food_version: null });
    return JSON.stringify({ food, extras });
  };
  return body(loaded) !== body(current);
}

// The Food Journal's photo limit per dish; copies go on the first dish.
const MAX_PHOTOS = 20;

// Same rule as the server's pickFoodPhotoKey: a JPEG up to 1600 wide.
function copyable(media: JournalMedia | undefined): boolean {
  if (!media || media.lifecycle === 'deleted' || media.deleted_at) return false;
  if (media.content_type != null && !/^image\//i.test(media.content_type)) return false;
  const sized = Object.keys(media.derivative_keys ?? {}).some((w) => {
    const n = Number(w.replace(/\D/g, ''));
    return Number.isFinite(n) && n <= 1600;
  });
  return sized || (media.content_type === 'image/jpeg' && Boolean(media.original_key));
}

// Only a linked visit has photos to retry; a new meal copies them all on its first save.
export function pendingPhotoIds(
  moment: Pick<JournalMoment, 'media_ids'>,
  media: JournalMedia[],
  visit: FoodVisit | null,
): string[] {
  if (!visit) return [];
  if ((visit.dishes[0]?.photos?.length ?? 0) >= MAX_PHOTOS) return [];
  const byId = new Map(media.map((m) => [m.id, m]));
  const copied = new Set(visit.dishes.flatMap((d) => (d.photos ?? []).map((p) => p.from)));
  return moment.media_ids.filter((id) => !copied.has(id) && copyable(byId.get(id)));
}

export function pendingPhotoHint(count: number): string {
  return `${count} ${count === 1 ? 'photo' : 'photos'} not yet in the Food Journal. Save to copy them.`;
}

export const MEAL_MESSAGES = {
  conflict: 'Your journal changed on another device. Reload before saving.',
  invalid: "Couldn't save the meal. Check the dish names and try again.",
  failed: 'Could not save. Try again.',
  photoFailed: "Saved. The photo didn't copy; open again to retry.",
  queued: 'Saved offline. The meal needs a connection; open the moment again to save it.',
} as const;

// A 400 only means the meal when it came from the meal call.
export function saveErrorMessage(err: unknown, step: 'moment' | 'meal'): string {
  const status = err instanceof ApiClientError ? err.status : undefined;
  if (status === 409 || (err instanceof ApiClientError && err.code === 'conflict')) return MEAL_MESSAGES.conflict;
  if (step === 'meal' && status === 400) return MEAL_MESSAGES.invalid;
  return MEAL_MESSAGES.failed;
}

export function removeDishLabel(dish: Pick<MealDishState, 'title'>, index: number): string {
  return `Remove dish ${dish.title.trim() || index + 1}`;
}

function field(labelText: string, control: HTMLElement): HTMLLabelElement {
  const wrap = document.createElement('label');
  wrap.className = 'journal-edit-moment__field';
  const label = document.createElement('span');
  label.textContent = labelText;
  wrap.append(label, control);
  return wrap;
}

function textInput(value: string, onInput: (value: string) => void, maxLength?: number): HTMLInputElement {
  const input = document.createElement('input');
  input.type = 'text';
  input.value = value;
  if (maxLength) input.maxLength = maxLength;
  input.addEventListener('input', () => onInput(input.value));
  return input;
}

function option(label: string, value: string): HTMLOptionElement {
  const o = document.createElement('option');
  o.textContent = label;
  o.value = value;
  return o;
}

function hint(text: string): HTMLParagraphElement {
  const p = document.createElement('p');
  p.className = 'journal-edit-moment__section-hint';
  p.textContent = text;
  return p;
}

export function mountMealSection(
  container: HTMLElement,
  options: { moment: JournalMoment; read: MealRead | null; media?: JournalMedia[]; onChange?: () => void },
): MealSectionHandle {
  const { moment, read } = options;
  const changed = () => options.onChange?.();
  const visit = read?.visit ?? null;

  const state: MealState = {
    title: visit?.title ?? moment.place?.name ?? '',
    dishes: (visit?.dishes ?? []).map((d) => ({ ...d, rating: d.rating ?? null })),
    extras: {
      mood: moment.meal?.mood ?? '',
      vibe: moment.meal?.vibe ?? '',
      with: moment.meal?.with ?? '',
    },
  };
  const loaded: MealState | null = visit ? structuredClone(state) : null;

  const section = document.createElement('section');
  section.className = 'journal-edit-moment__meal';

  const toggle = document.createElement('input');
  toggle.type = 'checkbox';
  toggle.setAttribute('role', 'switch');
  toggle.checked = Boolean(visit);
  toggle.disabled = !read;
  const toggleRow = document.createElement('label');
  toggleRow.className = 'journal-edit-moment__meal-switch';
  const toggleText = document.createElement('span');
  toggleText.textContent = 'This was a meal';
  toggleRow.append(toggle, toggleText);
  section.append(toggleRow);

  if (!read) {
    section.append(hint("Couldn't load the meal"));
    container.replaceChildren(section);
    return {
      available: false,
      wasLinked: false,
      foodVersion: null,
      enabled: () => false,
      state: () => state,
      changed: () => false,
      photosPending: [],
    };
  }

  const body = document.createElement('div');
  body.className = 'journal-edit-moment__meal-body';

  const extrasRow = document.createElement('div');
  extrasRow.className = 'journal-edit-moment__meal-extras';
  extrasRow.append(
    field('Mood', textInput(state.extras.mood, (v) => { state.extras.mood = v; changed(); }, EXTRA_MAX.mood)),
    field('Vibe', textInput(state.extras.vibe, (v) => { state.extras.vibe = v; changed(); }, EXTRA_MAX.vibe)),
    field('Who with', textInput(state.extras.with, (v) => { state.extras.with = v; changed(); }, EXTRA_MAX.with)),
  );

  const titleField = field('Title', textInput(state.title, (v) => { state.title = v; changed(); }));

  const dishList = document.createElement('div');
  dishList.className = 'journal-edit-moment__dishes';

  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'btn btn--secondary journal-edit-moment__add-dish';
  addBtn.textContent = 'Add dish';
  addBtn.addEventListener('click', () => {
    state.dishes.push({ title: '', meal_type: 'Dinner', rating: null });
    changed();
    renderDishes();
    dishList.querySelector<HTMLInputElement>('.journal-edit-moment__dish:last-child input')?.focus();
  });

  function dishRow(dish: MealDishState, index: number): HTMLElement {
    const row = document.createElement('div');
    row.className = 'journal-edit-moment__dish';

    const remove = document.createElement('button');
    const titleWrap = field('Dish', textInput(dish.title, (v) => {
      dish.title = v;
      remove.setAttribute('aria-label', removeDishLabel(dish, index));
      changed();
    }));
    if (dish.title_en) {
      const en = document.createElement('span');
      en.className = 'journal-edit-moment__dish-en';
      en.textContent = dish.title_en;
      titleWrap.append(en);
    }

    const type = document.createElement('select');
    const types: string[] = [...MEAL_TYPES];
    if (!types.includes(dish.meal_type)) types.push(dish.meal_type);
    for (const t of types) type.append(option(t, t));
    type.value = dish.meal_type;
    type.addEventListener('change', () => { dish.meal_type = type.value; changed(); });

    const rating = document.createElement('select');
    for (const r of RATING_OPTIONS) {
      const value = r === null ? '' : String(r);
      rating.append(option(r === null ? 'No rating' : value, value));
    }
    rating.value = dish.rating === null ? '' : String(dish.rating);
    rating.addEventListener('change', () => {
      dish.rating = rating.value === '' ? null : Number(rating.value);
      changed();
    });

    const pair = document.createElement('div');
    pair.className = 'journal-edit-moment__dish-pair';
    pair.append(field('Meal type', type), field('Rating', rating));

    row.append(titleWrap, pair);

    if (dish.ingredients) {
      const ingredients = document.createElement('p');
      ingredients.className = 'journal-edit-moment__section-hint';
      ingredients.textContent = `Ingredients: ${dish.ingredients}`;
      row.append(ingredients);
    }

    // The Food Journal removes a counted dish, and can remove its meal with it.
    if (dish.counted) {
      row.append(hint('Counted in Brisket. Remove it in the Food Journal.'));
      return row;
    }
    remove.type = 'button';
    remove.setAttribute('aria-label', removeDishLabel(dish, index));
    remove.className = 'btn btn--ghost journal-edit-moment__dish-remove';
    remove.textContent = 'Remove';
    remove.addEventListener('click', () => {
      state.dishes = state.dishes.filter((d) => d !== dish);
      changed();
      renderDishes();
    });
    row.append(remove);
    return row;
  }

  function renderDishes(): void {
    dishList.replaceChildren(...state.dishes.map((d, i) => dishRow(d, i)));
  }

  function refresh(): void {
    body.hidden = !toggle.checked;
  }

  toggle.addEventListener('change', () => {
    if (toggle.checked && state.dishes.length === 0) {
      state.dishes.push({ title: '', meal_type: 'Dinner', rating: null });
      renderDishes();
    }
    changed();
    refresh();
  });

  const photosPending = pendingPhotoIds(moment, options.media ?? [], visit);

  renderDishes();
  refresh();
  body.append(extrasRow, titleField, dishList, addBtn);
  if (photosPending.length) body.append(hint(pendingPhotoHint(photosPending.length)));
  section.append(body);
  container.replaceChildren(section);

  return {
    available: true,
    wasLinked: Boolean(visit),
    foodVersion: read.food_version,
    enabled: () => toggle.checked,
    state: () => state,
    changed: () => mealChanged(loaded, state),
    photosPending,
  };
}
