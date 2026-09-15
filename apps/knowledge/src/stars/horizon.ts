import { formatMonthIndex, monthIndexForRatio, ratioForMonthIndex } from "./timeline";

export type HorizonArc = {
  setMonthIndex(monthIndex: number): void;
  destroy(): void;
};

export function mountHorizonArc(
  host: HTMLElement,
  options: {
    monthIndex: number;
    minMonthIndex: number;
    maxMonthIndex: number;
    onChange: (monthIndex: number) => void;
    onCommit?: (monthIndex: number) => void;
  },
): HorizonArc {
  let monthIndex = options.monthIndex;
  const { minMonthIndex, maxMonthIndex } = options;

  host.innerHTML = `
    <div class="stars-horizon__track">
      <div class="stars-horizon__ticks"></div>
    </div>
    <button type="button" class="stars-horizon__marker" role="slider" aria-label="Sky position"
      aria-valuemin="${minMonthIndex}" aria-valuemax="${maxMonthIndex}"><span></span></button>
    <output class="stars-horizon__label"></output>
  `;

  const track = host.querySelector<HTMLElement>(".stars-horizon__track")!;
  const ticksLayer = host.querySelector<HTMLElement>(".stars-horizon__ticks")!;
  const marker = host.querySelector<HTMLButtonElement>(".stars-horizon__marker")!;
  const label = host.querySelector<HTMLOutputElement>(".stars-horizon__label")!;

  function ratioFor(value: number) {
    return ratioForMonthIndex(value, minMonthIndex, maxMonthIndex);
  }

  for (let year = Math.ceil(minMonthIndex / 12) * 12; year <= maxMonthIndex; year += 12) {
    const tick = document.createElement("span");
    tick.className = "stars-horizon__tick";
    tick.style.left = `${ratioFor(year) * 100}%`;
    tick.textContent = formatMonthIndex(year).split(" ")[1] ?? "";
    ticksLayer.append(tick);
  }

  function place(value: number) {
    const ratio = ratioFor(value);
    marker.style.left = `${ratio * 100}%`;
    marker.setAttribute("aria-valuenow", String(value));
    marker.setAttribute("aria-valuetext", formatMonthIndex(value));
    label.textContent = formatMonthIndex(value);
  }

  function valueFromClientX(clientX: number) {
    const rect = track.getBoundingClientRect();
    if (rect.width === 0) return monthIndex;
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return monthIndexForRatio(ratio, minMonthIndex, maxMonthIndex);
  }

  let dragging = false;
  function onMove(event: PointerEvent) {
    if (!dragging) return;
    const value = valueFromClientX(event.clientX);
    place(value);
    options.onChange(value);
  }
  function onUp(event: PointerEvent) {
    if (!dragging) return;
    dragging = false;
    marker.classList.remove("is-dragging");
    monthIndex = Math.round(valueFromClientX(event.clientX));
    place(monthIndex);
    options.onCommit?.(monthIndex);
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
  track.addEventListener("pointerdown", onDown);

  function commitStep(delta: number) {
    monthIndex = Math.max(minMonthIndex, Math.min(maxMonthIndex, monthIndex + delta));
    place(monthIndex);
    options.onChange(monthIndex);
    options.onCommit?.(monthIndex);
  }
  function onKey(event: KeyboardEvent) {
    if (event.key === "ArrowRight" || event.key === "ArrowUp") {
      event.preventDefault();
      commitStep(1);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
      event.preventDefault();
      commitStep(-1);
    }
  }
  marker.addEventListener("keydown", onKey);

  place(monthIndex);

  return {
    setMonthIndex(next) {
      monthIndex = Math.max(minMonthIndex, Math.min(maxMonthIndex, next));
      place(monthIndex);
    },
    destroy() {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      host.innerHTML = "";
    },
  };
}
