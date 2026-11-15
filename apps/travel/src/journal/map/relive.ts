import type { Keepsake } from '@/journal/keepsakes/model';
import { lightFor } from '@/journal/map/light';
import { sceneDurationMs, type ReliveScene } from '@/journal/map/relive-scenes';
import type { TripStops } from '@/journal/map/stops';
import { mountTripMap, type MapLibrary, type TripMapHandle } from '@/journal/map/trip-map';
import { presentJournalOverlay, type JournalOverlayHandle } from '@/journal/overlay-host';
import { button, el, icon, ICONS } from '@/journal/story/dom';
import { clock12, longDate } from '@/journal/trip-days';

export interface ReliveOptions {
  anchor: HTMLElement;
  lib: MapLibrary;
  title: string;
  scenes: ReliveScene[];
  trip: TripStops;
  colors: { line: string; plain: string };
  reducedMotion: boolean;
  fillPhoto: (img: HTMLImageElement, mediaId: string) => void;
  drawKeepsake: (keepsake: Keepsake) => HTMLElement;
  sunsetFor: (stopIndex: number) => string | null;
  onClose?: () => void;
}

/** A press shorter than this is a tap (move on); longer is a hold (pause while held). */
const HOLD_MS = 280;
/** The top of the card's backdrop is a fade the map still shows through. */
const STAGE_FADE_PX = 40;

/**
 * Relive: the trip played on the map from the first stop to the last. Only
 * ever started by a tap. Tap the right for the next scene, the left for the
 * one before, hold to pause. Back, Escape and Close leave. It is silent.
 */
export function openRelive(options: ReliveOptions): { destroy(): void } {
  const { scenes } = options;
  let index = 0;
  let paused = false;
  let closed = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let startedAt = 0;
  let remaining = 0;
  let overlay: JournalOverlayHandle | null = null;

  const back = el('div', 'sheet-back relive-back');
  const root = el('div', 'relive');
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', `Relive ${options.title}`);
  if (options.reducedMotion) root.classList.add('relive--still');

  const mapHost = el('div', 'relive__map');
  const top = el('div', 'relive__top');
  const bar = el('div', 'relive__bar');
  bar.setAttribute('aria-hidden', 'true');
  const fill = el('span', 'relive__bar-fill');
  bar.append(fill);
  const pauseBtn = button('relive__btn');
  const closeBtn = button('relive__btn');
  closeBtn.setAttribute('aria-label', 'Close');
  closeBtn.append(icon(ICONS.close));
  top.append(bar, pauseBtn, closeBtn);

  const stage = el('div', 'relive__stage');
  stage.setAttribute('aria-live', 'polite');
  const prevZone = button('relive__zone relive__zone--prev');
  prevZone.setAttribute('aria-label', 'Previous');
  const nextZone = button('relive__zone relive__zone--next');
  nextZone.setAttribute('aria-label', 'Next');

  root.append(mapHost, prevZone, nextZone, stage, top);
  back.append(root);

  let map: TripMapHandle | null = null;

  function clearTimer(): void {
    if (timer) clearTimeout(timer);
    timer = null;
  }

  function schedule(ms: number): void {
    clearTimer();
    remaining = ms;
    startedAt = Date.now();
    if (!paused) timer = setTimeout(() => go(1), ms);
  }

  function paintPause(): void {
    pauseBtn.replaceChildren(icon(paused ? ICONS.play : ICONS.pause));
    pauseBtn.setAttribute('aria-label', paused ? 'Play' : 'Pause');
    root.classList.toggle('is-paused', paused);
  }

  function setPaused(next: boolean): void {
    if (paused === next || closed) return;
    paused = next;
    if (paused) {
      remaining = Math.max(0, remaining - (Date.now() - startedAt));
      clearTimer();
    } else if (sceneDurationMs(scenes[index]!) !== null) {
      schedule(Math.max(400, remaining));
    }
    paintPause();
  }

  function card(className: string): HTMLElement {
    const node = el('div', `relive__card ${className}`);
    stage.replaceChildren(node);
    return node;
  }

  function paintScene(): void {
    const scene = scenes[index]!;
    fill.style.width = `${((index + 1) / scenes.length) * 100}%`;
    prevZone.disabled = index === 0;
    root.setAttribute('data-relive-scene', scene.kind);

    // Each card is drawn before the map moves, so the map knows how much of itself the card covers.
    if (scene.kind === 'arrive') {
      const node = card('relive__card--arrive');
      if (scene.stamp) {
        const stamp = el('div', 'relive__stamp');
        stamp.append(options.drawKeepsake(scene.stamp));
        node.append(stamp);
      }
      node.append(el('p', 'relive__eyebrow', 'Arriving in'), el('h2', 'relive__headline', scene.city));
      if (scene.stopIndex !== null) map?.select(scene.stopIndex);
      map?.setTint(lightFor(null).tint);
    } else if (scene.kind === 'journey') {
      const node = card('relive__card--journey');
      node.append(el('p', 'relive__eyebrow', 'On the way'), el('h2', 'relive__headline relive__headline--small', scene.line));
      if (scene.ticket) {
        const ticket = el('div', 'relive__ticket');
        ticket.append(options.drawKeepsake(scene.ticket));
        node.append(ticket);
      }
      if (scene.stopIndex !== null) map?.select(scene.stopIndex);
      map?.setTint(lightFor(null).tint);
    } else if (scene.kind === 'moment') {
      const node = card('relive__card--moment');
      if (scene.mediaId) {
        const photo = el('div', 'relive__photo');
        const img = el('img');
        options.fillPhoto(img, scene.mediaId);
        photo.append(img);
        node.append(photo);
      }
      const meta = [scene.dayNumber > 0 ? `Day ${scene.dayNumber}` : longDate(scene.localDate), clock12(scene.localTime), scene.placeName]
        .filter(Boolean)
        .join(' · ');
      node.append(el('p', 'relive__meta num', meta));
      if (scene.text) node.append(el('p', 'relive__words', scene.text));
      if (scene.keepsakes.length) {
        const kept = el('div', 'relive__kept');
        for (const k of scene.keepsakes.slice(0, 2)) kept.append(options.drawKeepsake(k));
        node.append(kept);
      }
      if (scene.stopIndex !== null) {
        map?.select(scene.stopIndex);
        map?.setTint(lightFor(scene.localTime, options.sunsetFor(scene.stopIndex)).tint);
      } else {
        map?.setTint(lightFor(scene.localTime).tint);
      }
    } else {
      const node = card('relive__card--end');
      if (scene.stamps.length) {
        const stamps = el('div', 'relive__stamps');
        for (const stamp of scene.stamps) stamps.append(options.drawKeepsake(stamp));
        node.append(stamps);
      }
      node.append(el('h2', 'relive__headline', options.title), el('p', 'relive__counts num', scene.counts.join(' · ')));
      const again = button('relive__again', 'Play again');
      again.addEventListener('click', () => {
        index = 0;
        paused = false;
        paintPause();
        paintScene();
      });
      node.append(again);
      map?.setTint(lightFor(null).tint);
      map?.showAll();
    }

    const ms = sceneDurationMs(scene);
    if (ms === null) clearTimer();
    else schedule(ms);
    pauseBtn.hidden = ms === null;
  }

  function go(step: number): void {
    if (closed) return;
    const next = index + step;
    if (next < 0 || next >= scenes.length) return;
    index = next;
    paintScene();
  }

  function close(): void {
    if (closed) return;
    closed = true;
    clearTimer();
    root.ownerDocument.removeEventListener('keydown', onKey, true);
    map?.destroy();
    overlay?.release();
    options.onClose?.();
  }

  function onKey(ev: KeyboardEvent): void {
    if (ev.key === 'ArrowRight') go(1);
    else if (ev.key === 'ArrowLeft') go(-1);
    else if (ev.key === ' ') setPaused(!paused);
    else return;
    ev.preventDefault();
  }

  // Tap to move, hold to pause while held.
  for (const [zone, step] of [[prevZone, -1], [nextZone, 1]] as const) {
    let downAt = 0;
    let held = false;
    let wasPaused = false;
    let holdTimer: ReturnType<typeof setTimeout> | null = null;
    zone.addEventListener('pointerdown', () => {
      downAt = Date.now();
      held = false;
      wasPaused = paused;
      holdTimer = setTimeout(() => {
        held = true;
        setPaused(true);
      }, HOLD_MS);
    });
    const release = (): void => {
      if (holdTimer) clearTimeout(holdTimer);
      holdTimer = null;
      if (held && !wasPaused) setPaused(false);
    };
    zone.addEventListener('pointerup', release);
    zone.addEventListener('pointercancel', release);
    zone.addEventListener('pointerleave', release);
    zone.addEventListener('click', () => {
      // A hold ends in a click too: only a short press moves on.
      if (held || (downAt && Date.now() - downAt >= HOLD_MS)) return;
      go(step);
    });
  }

  pauseBtn.addEventListener('click', () => setPaused(!paused));
  closeBtn.addEventListener('click', close);
  root.ownerDocument.addEventListener('keydown', onKey, true);

  overlay = presentJournalOverlay(back, { anchor: options.anchor, dismiss: close, initialFocus: closeBtn });

  // The map is made once the overlay is in the page, so it has a real size.
  if (options.trip.stops.length) {
    map = mountTripMap(mapHost, {
      lib: options.lib,
      stops: options.trip.stops,
      segments: options.trip.segments,
      colors: options.colors,
      reducedMotion: options.reducedMotion,
      // The top row and the card cover part of the map: a stop is centred in the rest.
      inset: () => ({ top: top.offsetHeight, bottom: Math.max(0, stage.offsetHeight - STAGE_FADE_PX) }),
      onPick: () => undefined,
      onState: (state) => root.setAttribute('data-map-state', state),
    });
  }
  paintPause();
  paintScene();
  return { destroy: close };
}
