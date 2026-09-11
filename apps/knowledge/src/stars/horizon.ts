const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const VIEW_W = 320;
const VIEW_H = 60;
const P0 = { x: 6, y: 54 };
const P1 = { x: 160, y: 6 };
const P2 = { x: 314, y: 54 };

function pointAt(t: number) {
  const mt = 1 - t;
  return {
    x: mt * mt * P0.x + 2 * mt * t * P1.x + t * t * P2.x,
    y: mt * mt * P0.y + 2 * mt * t * P1.y + t * t * P2.y,
  };
}

function percent(point: { x: number; y: number }) {
  return { left: `${(point.x / VIEW_W) * 100}%`, top: `${(point.y / VIEW_H) * 100}%` };
}

export type HorizonArc = {
  setMonth(month: number): void;
  destroy(): void;
};

export function mountHorizonArc(
  host: HTMLElement,
  options: { month: number; year: number; onChange: (month: number) => void; onCommit?: (month: number) => void },
): HorizonArc {
  let month = options.month;

  host.innerHTML = `
    <svg class="stars-horizon__svg" viewBox="0 0 ${VIEW_W} ${VIEW_H}" preserveAspectRatio="none" aria-hidden="true">
      <path class="stars-horizon__glow" d="M${P0.x},${P0.y} Q${P1.x},${P1.y} ${P2.x},${P2.y}" />
      <path class="stars-horizon__track" d="M${P0.x},${P0.y} Q${P1.x},${P1.y} ${P2.x},${P2.y}" />
    </svg>
    <div class="stars-horizon__ticks"></div>
    <button type="button" class="stars-horizon__marker" role="slider" aria-label="Sky position" aria-valuemin="0" aria-valuemax="${MONTHS.length - 1}"><span></span></button>
    <output class="stars-horizon__label"></output>
  `;

  const svg = host.querySelector<SVGSVGElement>("svg")!;
  const ticksLayer = host.querySelector<HTMLElement>(".stars-horizon__ticks")!;
  const marker = host.querySelector<HTMLButtonElement>(".stars-horizon__marker")!;
  const label = host.querySelector<HTMLOutputElement>(".stars-horizon__label")!;
  const ticks: HTMLButtonElement[] = [];

  MONTHS.forEach((name, index) => {
    const point = percent(pointAt(index / (MONTHS.length - 1)));
    const tick = document.createElement("button");
    tick.type = "button";
    tick.className = "stars-horizon__tick";
    tick.style.left = point.left;
    tick.style.top = point.top;
    tick.setAttribute("aria-label", `${name} ${options.year}`);
    if (index % 2 === 0) tick.innerHTML = `<span>${name}</span>`;
    tick.onclick = () => commit(index);
    ticksLayer.append(tick);
    ticks.push(tick);
  });

  function place(m: number) {
    const point = percent(pointAt(m / (MONTHS.length - 1)));
    marker.style.left = point.left;
    marker.style.top = point.top;
    marker.setAttribute("aria-valuenow", String(m));
    marker.setAttribute("aria-valuetext", `${MONTHS[m]} ${options.year}`);
    label.textContent = `${MONTHS[m]} ${options.year}`;
    ticks.forEach((tick, index) => tick.classList.toggle("is-current", index === m));
  }

  function commit(next: number) {
    month = Math.max(0, Math.min(MONTHS.length - 1, next));
    place(month);
    options.onChange(month);
    options.onCommit?.(month);
  }

  function tFromClientX(clientX: number) {
    const rect = svg.getBoundingClientRect();
    if (rect.width === 0) return 0;
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  }

  let dragging = false;
  function onMove(event: PointerEvent) {
    if (!dragging) return;
    const t = tFromClientX(event.clientX);
    const point = percent(pointAt(t));
    marker.style.left = point.left;
    marker.style.top = point.top;
    const rounded = Math.round(t * (MONTHS.length - 1));
    label.textContent = `${MONTHS[rounded]} ${options.year}`;
    ticks.forEach((tick, index) => tick.classList.toggle("is-current", index === rounded));
    options.onChange(rounded);
  }
  function onUp(event: PointerEvent) {
    if (!dragging) return;
    dragging = false;
    marker.classList.remove("is-dragging");
    commit(Math.round(tFromClientX(event.clientX) * (MONTHS.length - 1)));
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
  }
  function onDown(event: PointerEvent) {
    dragging = true;
    marker.classList.add("is-dragging");
    onMove(event);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }
  marker.addEventListener("pointerdown", onDown);
  svg.addEventListener("pointerdown", onDown);

  function onKey(event: KeyboardEvent) {
    if (event.key === "ArrowRight" || event.key === "ArrowUp") {
      event.preventDefault();
      commit(month + 1);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
      event.preventDefault();
      commit(month - 1);
    }
  }
  marker.addEventListener("keydown", onKey);

  place(month);

  return {
    setMonth(next) {
      month = Math.max(0, Math.min(MONTHS.length - 1, next));
      place(month);
    },
    destroy() {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      host.innerHTML = "";
    },
  };
}
