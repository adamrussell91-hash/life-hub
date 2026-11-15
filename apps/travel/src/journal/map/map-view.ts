import { lightFor } from '@/journal/map/light';
import { stopSpokenLabel, unplacedLine, type TripStop, type TripStops } from '@/journal/map/stops';
import { mountTripMap, type MapLibrary, type TripMapHandle, type TripMapState } from '@/journal/map/trip-map';
import { button, el, icon, ICONS } from '@/journal/story/dom';
import { clock12 } from '@/journal/trip-days';

export const MAP_FAILED_LINE = 'The map could not load. Your route is shown without it.';
export const MAP_UNSUPPORTED_LINE = 'This device cannot draw the map. You can still step through the trip here.';
export const MAP_EMPTY_LINE =
  'Moments need a place to appear on the map. Photos carry theirs when Location is on in your camera.';

export interface MapViewOptions {
  lib: MapLibrary;
  trip: TripStops;
  cityCount: number;
  /** 0 is the whole trip; 1 and up are the stops, in order. Where the slider starts. */
  position: number;
  colors: { line: string; plain: string };
  reducedMotion: boolean;
  fillPhoto: (img: HTMLImageElement, mediaId: string) => void;
  /** That day's sunset where the stop is, "HH:mm", when it can be worked out. */
  sunsetFor: (stop: TripStop) => string | null;
  onOpenMoment: (momentId: string) => void;
  /** Told whenever the slider moves, so the place is kept when the view is left and returned to. */
  onPosition: (position: number) => void;
}

export interface MapViewHandle {
  el: HTMLElement;
  /** Call once the view is in the page, and whenever its size changes. */
  resize(): void;
  destroy(): void;
}

/** The Map view: the trip on a map, with a slider that walks through it one stop at a time. */
export function renderMapView(options: MapViewOptions): MapViewHandle {
  const { stops, unplaced } = options.trip;
  const root = el('div', 'trip-map-view');
  root.setAttribute('data-trip-map', '');

  if (stops.length === 0) {
    root.classList.add('trip-map-view--empty');
    root.append(el('p', 'trip-map__empty', MAP_EMPTY_LINE));
    return { el: root, resize: () => undefined, destroy: () => undefined };
  }

  const canvas = el('div', 'trip-map__canvas');
  const notice = el('div', 'trip-map__notice');
  notice.setAttribute('role', 'status');
  notice.hidden = true;
  const noticeText = el('p', 'trip-map__notice-text');
  const retry = button('trip-map__retry', 'Try again');
  notice.append(noticeText, retry);

  const panel = el('div', 'trip-map__panel');
  const card = button('trip-map__card');
  const cardPhoto = el('span', 'trip-map__card-photo');
  const cardText = el('span', 'trip-map__card-text');
  const cardMeta = el('span', 'trip-map__card-meta num');
  const cardPlace = el('span', 'trip-map__card-place');
  const cardWords = el('span', 'trip-map__card-words');
  cardText.append(cardMeta, cardPlace, cardWords);
  card.append(cardPhoto, cardText);

  const controls = el('div', 'trip-map__controls');
  const prev = button('trip-map__step');
  prev.setAttribute('aria-label', 'Previous stop');
  prev.append(icon(ICONS.back));
  const next = button('trip-map__step');
  next.setAttribute('aria-label', 'Next stop');
  next.append(icon(ICONS.next));
  const slider = el('input', 'trip-map__slider');
  slider.type = 'range';
  slider.min = '0';
  slider.max = String(stops.length);
  slider.step = '1';
  slider.setAttribute('aria-label', 'Move through the trip');
  controls.append(prev, slider, next);

  panel.append(card, controls);
  const unplacedText = unplacedLine(unplaced);
  if (unplacedText) panel.append(el('p', 'trip-map__unplaced num', unplacedText));
  root.append(canvas, notice, panel);

  let position = Math.max(0, Math.min(options.position, stops.length));
  let map: TripMapHandle;

  function onState(state: TripMapState): void {
    const failed = state === 'plain' || state === 'none';
    notice.hidden = !failed;
    noticeText.textContent = state === 'none' ? MAP_UNSUPPORTED_LINE : MAP_FAILED_LINE;
    retry.hidden = state !== 'plain';
    root.setAttribute('data-map-state', state);
  }

  function mount(): TripMapHandle {
    root.setAttribute('data-map-state', 'loading');
    return mountTripMap(canvas, {
      lib: options.lib,
      stops,
      segments: options.trip.segments,
      colors: options.colors,
      reducedMotion: options.reducedMotion,
      onPick: (index) => go(index + 1),
      onState,
    });
  }

  function paint(animate: boolean): void {
    slider.value = String(position);
    prev.disabled = position <= 0;
    next.disabled = position >= stops.length;
    if (position === 0) {
      const cities = options.cityCount;
      slider.setAttribute('aria-valuetext', `The whole trip, ${stops.length} stops`);
      card.disabled = true;
      card.classList.add('trip-map__card--whole');
      cardPhoto.replaceChildren();
      cardMeta.textContent = `${stops.length} ${stops.length === 1 ? 'stop' : 'stops'}${cities > 1 ? ` across ${cities} cities` : ''}`;
      cardPlace.textContent = 'The whole trip';
      cardWords.textContent = 'Move the slider to walk through it.';
      card.removeAttribute('aria-label');
      map.setTint(lightFor(null).tint);
      map.showAll(animate);
      return;
    }
    const stop = stops[position - 1]!;
    slider.setAttribute('aria-valuetext', stopSpokenLabel(stop, stops.length));
    card.disabled = false;
    card.classList.remove('trip-map__card--whole');
    cardPhoto.replaceChildren();
    if (stop.mediaId) {
      const img = el('img');
      options.fillPhoto(img, stop.mediaId);
      cardPhoto.append(img);
    }
    cardMeta.textContent = [stop.dayNumber > 0 ? `Day ${stop.dayNumber}` : '', clock12(stop.localTime)].filter(Boolean).join(' · ');
    cardPlace.textContent = stop.placeName;
    cardWords.textContent = stop.text;
    card.setAttribute('aria-label', `Open this moment in the story: ${stopSpokenLabel(stop, stops.length)}`);
    map.setTint(lightFor(stop.localTime, options.sunsetFor(stop)).tint);
    map.select(stop.index, animate);
  }

  function go(to: number, animate = true): void {
    const clamped = Math.max(0, Math.min(to, stops.length));
    if (clamped === position) return;
    position = clamped;
    options.onPosition(position);
    paint(animate);
  }

  slider.addEventListener('input', () => go(Number(slider.value)));
  prev.addEventListener('click', () => go(position - 1));
  next.addEventListener('click', () => go(position + 1));
  card.addEventListener('click', () => {
    const stop = stops[position - 1];
    if (stop) options.onOpenMoment(stop.momentId);
  });
  retry.addEventListener('click', () => {
    map.destroy();
    notice.hidden = true;
    map = mount();
    paint(false);
  });

  map = mount();
  paint(false);

  return {
    el: root,
    resize: () => {
      map.resize();
      // The map was fitted before it had its real size: fit it again to where the slider is.
      if (position === 0) map.showAll(false);
      else map.select(position - 1, false);
    },
    destroy: () => map.destroy(),
  };
}
