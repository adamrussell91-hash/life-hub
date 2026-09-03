import type { CapacityLevel, CapacitySnapshot } from '@/domain/capacity';
import type { CapacityShare } from '@/schemas/capacity';
import { tasksApi } from '@/services/client-api';
import { renderLoadError } from '@/views/feedback';
import { createHubSearch } from '@/views/hub-kit';

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function levelLabel(level: CapacityLevel): string {
  if (level === 'slammed') return 'slammed';
  if (level === 'busy') return 'busy';
  if (level === 'light') return 'light';
  return 'free';
}

function paintDays(
  host: HTMLElement,
  days: Array<{ date_key: string; weekday: string; level: CapacityLevel }>
): void {
  host.replaceChildren();
  const grid = el('div', 'capacity-grid');
  for (const day of days.slice(0, 14)) {
    const cell = el('div', `capacity-day capacity-day--${day.level}`);
    cell.append(
      el('span', 'capacity-day__name', day.weekday.slice(0, 3)),
      el('span', 'capacity-day__level', levelLabel(day.level))
    );
    grid.append(cell);
  }
  host.append(grid);
}

function shareUrl(token: string): string {
  const base = `${location.origin}${location.pathname}`.replace(/\/$/, '') || location.origin;
  return `${base}/#/capacity/${token}`;
}

/** Adam’s capacity desk — preview + share link for Corey (no task titles on the public side). */
export async function renderCoreyView(canvas: HTMLElement): Promise<void> {
  canvas.replaceChildren(el('p', 'canvas-status', 'Loading capacity…'));
  try {
    const data = await tasksApi.getCapacity();
    let share = data.share;
    if (!share) {
      const ensured = await tasksApi.ensureCapacityShare();
      share = ensured.share;
    }
    paintCorey(canvas, data.snapshot, share);
  } catch (err) {
    renderLoadError(canvas, err, () => void renderCoreyView(canvas), 'Could not load capacity');
  }
}

function paintCorey(canvas: HTMLElement, snapshot: CapacitySnapshot, share: CapacityShare): void {
  canvas.replaceChildren();

  const hero = el('div', 'capacity-hero');
  hero.append(el('p', 'page-header__eyebrow', `Overall · ${snapshot.overall}`));
  for (const line of snapshot.headlines) {
    hero.append(el('p', 'capacity-hero__line', line));
  }
  canvas.append(hero);

  const daysHost = el('div', 'capacity-days');
  paintDays(
    daysHost,
    snapshot.days.map((d) => ({ date_key: d.date_key, weekday: d.weekday, level: d.level }))
  );
  canvas.append(daysHost);

  // Adam-only: counts visible here; public view strips them
  const detail = el('div', 'capacity-detail');
  detail.append(el('h2', 'section-title', 'Your detail (not shared)'));
  for (const day of snapshot.days.slice(0, 7)) {
    if (!day.open_task_count) continue;
    detail.append(
      el(
        'p',
        'task-row__desc',
        `${day.weekday}: ${day.open_task_count} open · ~${day.estimated_minutes}m`
      )
    );
  }
  canvas.append(detail);

  const shareBox = el('div', 'capacity-share');
  shareBox.append(el('h2', 'section-title', 'Share with Corey'));
  const url = shareUrl(share.token);
  const shareField = createHubSearch({
    type: 'text',
    ariaLabel: 'Share URL',
    value: url,
    readOnly: true
  });
  const input = shareField.input;
  const copy = el('button', 'btn btn--primary', 'Copy link');
  copy.type = 'button';
  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(url);
      copy.textContent = 'Copied';
    } catch {
      input.select();
    }
  });
  const rotate = el('button', 'btn btn--ghost', 'Rotate link');
  rotate.type = 'button';
  rotate.addEventListener('click', async () => {
    const next = await tasksApi.rotateCapacityShare();
    paintCorey(canvas, snapshot, next.share);
  });
  shareBox.append(shareField.el, copy, rotate);
  canvas.append(shareBox);
}

/** Public Corey page — token in hash, no sign-in. */
export async function renderPublicCapacityView(
  canvas: HTMLElement,
  token: string
): Promise<void> {
  canvas.replaceChildren(el('p', 'canvas-status', 'Loading…'));
  try {
    const view = await tasksApi.getPublicCapacity(token);
    canvas.replaceChildren();
    canvas.append(el('p', 'page-header__eyebrow', 'Adam’s capacity'));
    canvas.append(el('h1', 'capacity-public__title', 'Availability'));
    const hero = el('div', 'capacity-hero');
    hero.append(el('p', 'page-header__eyebrow', `Overall · ${view.overall}`));
    for (const line of view.headlines) {
      hero.append(el('p', 'capacity-hero__line', line));
    }
    canvas.append(hero);
    const daysHost = el('div', 'capacity-days');
    paintDays(daysHost, view.days);
    canvas.append(daysHost);
    canvas.append(
      el('p', 'capacity-public__note', 'Task names are never shown on this page.')
    );
  } catch {
    canvas.replaceChildren(
      el('p', 'empty-state', 'This share link is unknown or was rotated.')
    );
  }
}
