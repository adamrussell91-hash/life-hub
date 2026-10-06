/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest";
import {
  UNIVERSE_DARK_KEY,
  applyGraphChromeTuck,
  applyUniverseViewState,
  bindGraphChromeTuck,
  graphChromeTokenHtml,
  bindUniverseView,
  readUniverseDark,
  shouldExitUniverseFullscreen,
  syncUniverseViewButtons,
  graphFullscreenToolsHtml,
  universeViewToolsHtml,
  universeWrapClass,
  writeUniverseDark,
} from "./universeChrome";

describe("universe view chrome", () => {
  it("keeps the default wrap class identical to today's light inset graph", () => {
    expect(universeWrapClass(false, false)).toBe("graph-wrap");
    expect(universeWrapClass(true, false)).toBe("graph-wrap is-universe-dark");
    expect(universeWrapClass(false, true)).toBe("graph-wrap is-universe-fullscreen");
    expect(universeWrapClass(true, true)).toBe("graph-wrap is-universe-dark is-universe-fullscreen");
  });

  it("has one way out of full screen: the toolbar toggle, with no second Exit pill", () => {
    document.body.innerHTML = universeViewToolsHtml(true, true);
    expect(document.querySelector("[data-universe-exit]")).toBeNull();
    expect(document.querySelectorAll("[data-universe-fullscreen]")).toHaveLength(1);
  });

  it("gives constellation and Show All a Full screen toggle without the Universe dark control", () => {
    document.body.innerHTML = graphFullscreenToolsHtml(false);
    expect(document.querySelector("[data-universe-dark]")).toBeNull();
    const full = document.querySelector<HTMLButtonElement>("[data-universe-fullscreen]")!;
    expect(full.textContent).toBe("Full screen");
    expect(full.getAttribute("aria-pressed")).toBe("false");
    document.body.innerHTML = graphFullscreenToolsHtml(true);
    expect(document.querySelector("[data-universe-fullscreen]")!.textContent).toBe("Exit");
  });

  it("renders Dark and Full screen as unpressed toggles by default", () => {
    document.body.innerHTML = universeViewToolsHtml(false, false);
    const dark = document.querySelector<HTMLButtonElement>("[data-universe-dark]")!;
    const full = document.querySelector<HTMLButtonElement>("[data-universe-fullscreen]")!;
    expect(dark.textContent).toBe("Dark");
    expect(dark.getAttribute("aria-pressed")).toBe("false");
    expect(dark.classList.contains("is-active")).toBe(false);
    expect(full.textContent).toBe("Full screen");
    expect(full.getAttribute("aria-pressed")).toBe("false");
  });

  it("labels the active modes so they stay exitable", () => {
    document.body.innerHTML = universeViewToolsHtml(true, true);
    expect(document.querySelector("[data-universe-dark]")!.textContent).toBe("Light");
    expect(document.querySelector("[data-universe-fullscreen]")!.textContent).toBe("Exit");
  });

  it("applies classes on the wrap without rewriting its children", () => {
    const wrap = document.createElement("div");
    wrap.className = "graph-wrap";
    wrap.innerHTML = `<canvas class="graph-canvas"></canvas>${universeViewToolsHtml(false, false)}`;
    const canvas = wrap.querySelector("canvas");
    applyUniverseViewState(wrap, document.body, true, true);
    expect(wrap.className).toBe("graph-wrap is-universe-dark is-universe-fullscreen");
    expect(document.body.classList.contains("is-universe-fullscreen")).toBe(true);
    expect(wrap.querySelector("canvas")).toBe(canvas);
    expect(wrap.querySelector("[data-universe-dark]")!.textContent).toBe("Light");
    applyUniverseViewState(wrap, document.body, false, false);
    expect(wrap.className).toBe("graph-wrap");
    expect(document.body.classList.contains("is-universe-fullscreen")).toBe(false);
  });

  it("toggles dark and fullscreen through the buttons without remounting", () => {
    const host = document.createElement("div");
    host.innerHTML = `<div class="graph-wrap">${universeViewToolsHtml(false, false)}</div>`;
    const wrap = host.querySelector<HTMLElement>(".graph-wrap")!;
    let dark = false;
    let fullscreen = false;
    const setDark = vi.fn((on: boolean) => {
      dark = on;
      applyUniverseViewState(wrap, document.body, dark, fullscreen);
    });
    const setFullscreen = vi.fn((on: boolean) => {
      fullscreen = on;
      applyUniverseViewState(wrap, document.body, dark, fullscreen);
    });
    bindUniverseView(host, {
      getDark: () => dark,
      getFullscreen: () => fullscreen,
      setDark,
      setFullscreen,
    });
    host.querySelector<HTMLButtonElement>("[data-universe-dark]")!.click();
    expect(setDark).toHaveBeenCalledWith(true);
    expect(wrap.classList.contains("is-universe-dark")).toBe(true);
    host.querySelector<HTMLButtonElement>("[data-universe-fullscreen]")!.click();
    expect(setFullscreen).toHaveBeenCalledWith(true);
    host.querySelector<HTMLButtonElement>("[data-universe-fullscreen]")!.click();
    expect(setFullscreen).toHaveBeenLastCalledWith(false);
    expect(wrap.classList.contains("is-universe-fullscreen")).toBe(false);
  });

  it("only treats Escape as an exit while fullscreen is on", () => {
    expect(shouldExitUniverseFullscreen("Escape", true)).toBe(true);
    expect(shouldExitUniverseFullscreen("Escape", false)).toBe(false);
    expect(shouldExitUniverseFullscreen("Enter", true)).toBe(false);
  });

  it("persists dark as an explicit opt-in, never by default", () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
    };
    expect(readUniverseDark(storage)).toBe(false);
    writeUniverseDark(true, storage);
    expect(store.get(UNIVERSE_DARK_KEY)).toBe("1");
    expect(readUniverseDark(storage)).toBe(true);
    writeUniverseDark(false, storage);
    expect(readUniverseDark(storage)).toBe(false);
    expect(readUniverseDark(null)).toBe(false);
  });

  it("syncs button copy if the wrap already has the markup", () => {
    document.body.innerHTML = universeViewToolsHtml(false, false);
    syncUniverseViewButtons(document.body, true, true);
    expect(document.querySelector("[data-universe-dark]")!.textContent).toBe("Light");
    expect(document.querySelector("[data-universe-fullscreen]")!.textContent).toBe("Exit");
  });
});

describe("universe effects toolbar", () => {
  it("renders lens, chimes, ambient, comet and screensaver controls from prefs", async () => {
    const { universeEffectToolsHtml } = await import("./universeChrome");
    document.body.innerHTML = universeEffectToolsHtml({ lens: true, sound: false, ambient: 2 });
    expect(document.querySelector("[data-universe-lens]")!.getAttribute("aria-pressed")).toBe("true");
    expect(document.querySelector("[data-universe-sound]")!.getAttribute("aria-pressed")).toBe("false");
    expect(document.querySelector<HTMLLabelElement>(".universe-ambient")!.hidden).toBe(true);
    expect(document.querySelector<HTMLSelectElement>("[data-universe-ambient]")!.value).toBe("2");
    expect(document.querySelector("[data-universe-comet]")!.textContent).toBe("Follow a comet");
    expect(document.querySelector("[data-universe-saver]")!.textContent).toBe("Screensaver");
  });

  it("toggles chimes, reveals ambient, and forwards comet actions", async () => {
    const { bindUniverseEffects, universeEffectToolsHtml } = await import("./universeChrome");
    document.body.innerHTML = universeEffectToolsHtml({ lens: false, sound: false, ambient: 1 });
    const prefs = { lens: false, sound: false, ambient: 1 };
    const calls: string[] = [];
    bindUniverseEffects(document, {
      getPrefs: () => prefs,
      setLens: on => ((prefs.lens = on), calls.push(`lens:${on}`)),
      setSound: on => ((prefs.sound = on), calls.push(`sound:${on}`)),
      setAmbient: level => calls.push(`ambient:${level}`),
      followComet: () => calls.push("comet"),
      screensaver: () => calls.push("saver"),
    });
    document.querySelector<HTMLButtonElement>("[data-universe-sound]")!.click();
    expect(document.querySelector<HTMLLabelElement>(".universe-ambient")!.hidden).toBe(false);
    const select = document.querySelector<HTMLSelectElement>("[data-universe-ambient]")!;
    select.value = "3";
    select.dispatchEvent(new Event("change"));
    document.querySelector<HTMLButtonElement>("[data-universe-lens]")!.click();
    document.querySelector<HTMLButtonElement>("[data-universe-comet]")!.click();
    document.querySelector<HTMLButtonElement>("[data-universe-saver]")!.click();
    expect(calls).toEqual(["sound:true", "ambient:3", "lens:true", "comet", "saver"]);
  });

  it("folds the full-screen controls into a token and opens them again", () => {
    const wrap = document.createElement("div");
    wrap.className = "graph-wrap is-universe-fullscreen is-chrome-tucked";
    wrap.innerHTML = `${graphFullscreenToolsHtml(true)}${graphChromeTokenHtml(true)}`;
    document.body.appendChild(wrap);
    let tucked = true;
    bindGraphChromeTuck(wrap, next => {
      tucked = next;
      applyGraphChromeTuck(wrap, next);
    });
    const token = wrap.querySelector<HTMLButtonElement>("[data-chrome-token]")!;
    expect(token.getAttribute("aria-expanded")).toBe("false");
    token.click();
    expect(tucked).toBe(false);
    expect(wrap.classList.contains("is-chrome-tucked")).toBe(false);
    expect(token.getAttribute("aria-expanded")).toBe("true");
    wrap.querySelector<HTMLButtonElement>("[data-chrome-tuck]")!.click();
    expect(tucked).toBe(true);
    expect(wrap.classList.contains("is-chrome-tucked")).toBe(true);
    expect(document.activeElement).toBe(token);
    wrap.remove();
  });
});
