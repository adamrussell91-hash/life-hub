/** Year timeline — Play / scrub (1.4s per year). */

export function mountTimeline(
  host: HTMLElement,
  options: {
    minYear: number;
    maxYear: number;
    reduceMotion?: boolean;
    onYear?: (year: number, isNow: boolean) => void;
  }
): {
  el: HTMLElement;
  setYear: (year: number) => void;
  setEnabled: (on: boolean) => void;
  setNote: (text: string | null) => void;
  destroy: () => void;
} {
  const min = options.minYear;
  const max = options.maxYear;
  const reduceMotion = options.reduceMotion ?? false;

  const el = document.createElement('div');
  el.className = 'miniworld__timeline';
  el.innerHTML = `
    <button type="button" class="miniworld__play" aria-label="Play history">
      <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.5v11l9-5.5z"/></svg>
    </button>
    <div class="miniworld__year" aria-live="polite"><span data-year>${max}</span><small data-mode>Now</small></div>
    <div class="miniworld__scrub">
      <input type="range" min="${min}" max="${max}" step="1" value="${max}" aria-label="Year">
      <div class="miniworld__ticks"></div>
    </div>
  `;
  const note = document.createElement('p');
  note.className = 'miniworld__timeline-note';
  note.hidden = true;
  host.append(el, note);

  const playBtn = el.querySelector('.miniworld__play') as HTMLButtonElement;
  const yearOut = el.querySelector('[data-year]') as HTMLElement;
  const modeOut = el.querySelector('[data-mode]') as HTMLElement;
  const scrub = el.querySelector('input') as HTMLInputElement;
  const ticks = el.querySelector('.miniworld__ticks') as HTMLElement;

  for (let y = min; y <= max; y += 1) {
    if (y !== min && y !== max && (y - min) % Math.max(1, Math.floor((max - min) / 4)) !== 0) continue;
    const span = document.createElement('span');
    span.textContent = y === max ? 'Now' : String(y);
    if (y === max) span.className = 'now';
    ticks.append(span);
  }

  let playing = false;
  let timer: ReturnType<typeof setInterval> | null = null;

  function emit(): void {
    const year = Number(scrub.value);
    const isNow = year === max;
    yearOut.textContent = String(year);
    modeOut.textContent = isNow ? 'Now' : 'History';
    options.onYear?.(year, isNow);
  }

  function stop(): void {
    playing = false;
    if (timer) clearInterval(timer);
    timer = null;
    playBtn.setAttribute('aria-label', 'Play history');
    playBtn.innerHTML = `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.5v11l9-5.5z"/></svg>`;
  }

  function play(): void {
    if (reduceMotion) {
      scrub.value = String(max);
      emit();
      return;
    }
    playing = true;
    playBtn.setAttribute('aria-label', 'Pause history');
    playBtn.innerHTML = `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 2h3v12H3zm7 0h3v12h-3z"/></svg>`;
    if (Number(scrub.value) >= max) scrub.value = String(min);
    timer = setInterval(() => {
      const next = Number(scrub.value) + 1;
      if (next > max) {
        stop();
        scrub.value = String(max);
        emit();
        return;
      }
      scrub.value = String(next);
      emit();
    }, 1400);
  }

  playBtn.addEventListener('click', () => (playing ? stop() : play()));
  scrub.addEventListener('input', () => {
    stop();
    emit();
  });

  return {
    el,
    setYear(year) {
      scrub.value = String(year);
      yearOut.textContent = String(year);
      modeOut.textContent = year === max ? 'Now' : 'History';
    },
    setEnabled(on) {
      scrub.disabled = !on;
      playBtn.disabled = !on;
      el.classList.toggle('is-disabled', !on);
    },
    setNote(text) {
      if (!text) {
        note.hidden = true;
        note.textContent = '';
        return;
      }
      note.hidden = false;
      note.textContent = text;
    },
    destroy() {
      stop();
    }
  };
}
