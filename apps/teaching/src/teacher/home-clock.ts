import { formatDisplayDate } from '../../design-kit/js/format-display-date.js';

/** Live hero clock for the Clinical Glass Home dashboard. */
export function mountHomeClock(el: HTMLElement): () => void {
  const timeEl = document.createElement('div');
  timeEl.className = 'home-dashboard__hero-time';
  timeEl.dataset.homeHeroClock = '';

  const dateEl = document.createElement('div');
  dateEl.className = 'home-dashboard__hero-date';

  const tick = (): void => {
    const now = new Date();
    timeEl.textContent = now.toLocaleTimeString('en-AU', {
      hour: 'numeric',
      minute: '2-digit'
    });
    dateEl.textContent = `${now.toLocaleDateString('en-AU', { weekday: 'long' })} ${formatDisplayDate(now)}`;
  };

  tick();
  const id = window.setInterval(tick, 30_000);
  el.append(timeEl, dateEl);
  return () => window.clearInterval(id);
}
