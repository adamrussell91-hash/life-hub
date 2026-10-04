export const UNIVERSE_DARK_KEY = "kh-universe-dark";

export function readUniverseDark(storage: Pick<Storage, "getItem"> | null | undefined) {
  try {
    return storage?.getItem(UNIVERSE_DARK_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeUniverseDark(on: boolean, storage: Pick<Storage, "setItem"> | null | undefined) {
  try {
    storage?.setItem(UNIVERSE_DARK_KEY, on ? "1" : "0");
  } catch {
    /* private mode / quota */
  }
}

export function universeWrapClass(dark: boolean, fullscreen: boolean) {
  return `graph-wrap${dark ? " is-universe-dark" : ""}${fullscreen ? " is-universe-fullscreen" : ""}`;
}

export function graphFullscreenButtonHtml(fullscreen: boolean) {
  return `<button type="button" data-universe-fullscreen aria-pressed="${fullscreen}" class="${fullscreen ? "is-active" : ""}">${fullscreen ? "Exit" : "Full screen"}</button>`;
}

export function graphFullscreenToolsHtml(fullscreen: boolean) {
  return `<div class="universe-view-tools graph-modes" role="group" aria-label="Graph view">
    ${graphFullscreenButtonHtml(fullscreen)}
  </div>`;
}

export function universeViewToolsHtml(dark: boolean, fullscreen: boolean) {
  return `<div class="universe-view-tools graph-modes" role="group" aria-label="Universe view">
    <button type="button" data-universe-dark aria-pressed="${dark}" class="${dark ? "is-active" : ""}">${dark ? "Light" : "Dark"}</button>
    ${graphFullscreenButtonHtml(fullscreen)}
  </div>`;
}

export function universeExitHtml(fullscreen: boolean) {
  return `<button type="button" class="universe-exit btn btn--ghost" data-universe-exit${fullscreen ? "" : " hidden"}>Exit full screen</button>`;
}

export function syncUniverseViewButtons(root: ParentNode, dark: boolean, fullscreen: boolean) {
  const darkBtn = root.querySelector<HTMLButtonElement>("[data-universe-dark]");
  if (darkBtn) {
    darkBtn.classList.toggle("is-active", dark);
    darkBtn.setAttribute("aria-pressed", String(dark));
    darkBtn.textContent = dark ? "Light" : "Dark";
  }
  const fullBtn = root.querySelector<HTMLButtonElement>("[data-universe-fullscreen]");
  if (fullBtn) {
    fullBtn.classList.toggle("is-active", fullscreen);
    fullBtn.setAttribute("aria-pressed", String(fullscreen));
    fullBtn.textContent = fullscreen ? "Exit" : "Full screen";
  }
  const exit = root.querySelector<HTMLButtonElement>("[data-universe-exit]");
  if (exit) exit.hidden = !fullscreen;
}

export function applyUniverseViewState(
  wrap: HTMLElement,
  body: HTMLElement,
  dark: boolean,
  fullscreen: boolean,
) {
  wrap.classList.toggle("is-universe-dark", dark);
  wrap.classList.toggle("is-universe-fullscreen", fullscreen);
  body.classList.toggle("is-universe-fullscreen", fullscreen);
  syncUniverseViewButtons(wrap, dark, fullscreen);
}

export function shouldExitUniverseFullscreen(key: string, fullscreen: boolean) {
  return key === "Escape" && fullscreen;
}

export function bindUniverseView(
  root: ParentNode,
  options: {
    getDark: () => boolean;
    getFullscreen: () => boolean;
    setDark: (on: boolean) => void;
    setFullscreen: (on: boolean) => void;
  },
) {
  const darkBtn = root.querySelector<HTMLButtonElement>("[data-universe-dark]");
  const fullBtn = root.querySelector<HTMLButtonElement>("[data-universe-fullscreen]");
  const exit = root.querySelector<HTMLButtonElement>("[data-universe-exit]");
  if (darkBtn) {
    darkBtn.onclick = () => options.setDark(!options.getDark());
  }
  if (fullBtn) {
    fullBtn.onclick = () => options.setFullscreen(!options.getFullscreen());
  }
  if (exit) {
    exit.onclick = () => options.setFullscreen(false);
  }
}

// ---------- Universe effects toolbar: lens, chimes, comets ----------

export const UNIVERSE_LENS_KEY = "kh-universe-lens";

export function readUniverseLens(storage: Pick<Storage, "getItem"> | null | undefined) {
  try {
    return storage?.getItem(UNIVERSE_LENS_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeUniverseLens(on: boolean, storage: Pick<Storage, "setItem"> | null | undefined) {
  try {
    storage?.setItem(UNIVERSE_LENS_KEY, on ? "1" : "0");
  } catch {
    /* private mode / quota */
  }
}

export type UniverseEffectPrefs = { lens: boolean; sound: boolean; ambient: number };

const AMBIENT_OPTIONS = ["Off", "Sparse", "Gentle", "Often"];

export function universeEffectToolsHtml(prefs: UniverseEffectPrefs) {
  const pressed = (on: boolean) => `aria-pressed="${on}" class="${on ? "is-active" : ""}"`;
  return `<div class="universe-effect-tools graph-modes" role="group" aria-label="Universe effects">
    <button type="button" data-universe-lens ${pressed(prefs.lens)} title="Magnify under the pointer">Lens</button>
    <button type="button" data-universe-sound ${pressed(prefs.sound)} title="Soft chimes">Chimes</button>
    <label class="universe-ambient" ${prefs.sound ? "" : "hidden"}>
      <span class="universe-ambient__label">Ambient</span>
      <select data-universe-ambient aria-label="Ambient chimes">
        ${AMBIENT_OPTIONS.map((label, value) => `<option value="${value}"${value === prefs.ambient ? " selected" : ""}>${label}</option>`).join("")}
      </select>
    </label>
    <button type="button" data-universe-comet title="Ride along with one of your comets">Follow a comet</button>
    <button type="button" data-universe-saver title="Drift between comets with the controls hidden. Press Escape or touch to stop.">Screensaver</button>
  </div>`;
}

export function bindUniverseEffects(
  root: ParentNode,
  handlers: {
    getPrefs: () => UniverseEffectPrefs;
    setLens: (on: boolean) => void;
    setSound: (on: boolean) => void;
    setAmbient: (level: number) => void;
    followComet: () => void;
    screensaver: () => void;
  },
) {
  const lens = root.querySelector<HTMLButtonElement>("[data-universe-lens]");
  const sound = root.querySelector<HTMLButtonElement>("[data-universe-sound]");
  const ambientWrap = root.querySelector<HTMLLabelElement>(".universe-ambient");
  const ambient = root.querySelector<HTMLSelectElement>("[data-universe-ambient]");
  const sync = (button: HTMLButtonElement | null, on: boolean) => {
    if (!button) return;
    button.classList.toggle("is-active", on);
    button.setAttribute("aria-pressed", String(on));
  };
  if (lens) {
    lens.onclick = () => {
      const next = !handlers.getPrefs().lens;
      handlers.setLens(next);
      sync(lens, next);
    };
  }
  if (sound) {
    sound.onclick = () => {
      const next = !handlers.getPrefs().sound;
      handlers.setSound(next);
      sync(sound, next);
      if (ambientWrap) ambientWrap.hidden = !next;
    };
  }
  if (ambient) ambient.onchange = () => handlers.setAmbient(Number(ambient.value));
  const comet = root.querySelector<HTMLButtonElement>("[data-universe-comet]");
  if (comet) comet.onclick = () => handlers.followComet();
  const saver = root.querySelector<HTMLButtonElement>("[data-universe-saver]");
  if (saver) saver.onclick = () => handlers.screensaver();
}
