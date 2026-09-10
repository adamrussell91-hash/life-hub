/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";

describe("bindKeyboardInset", () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    document.documentElement.classList.remove("vv-keyboard-open");
    document.documentElement.style.removeProperty("--vv-offset-top");
    document.documentElement.style.removeProperty("--vv-height");
    document.documentElement.style.removeProperty("--vv-offset-bottom");
  });

  it("opens keyboard mode and writes --vv-* when geometry shows a keyboard", async () => {
    const listeners = new Map<string, () => void>();
    vi.stubGlobal("visualViewport", {
      height: 500,
      offsetTop: 20,
      addEventListener: (name: string, handler: () => void) => {
        listeners.set(name, handler);
      },
      removeEventListener: (name: string) => {
        listeners.delete(name);
      },
    });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 800 });
    const { bindKeyboardInset } = await import("./keyboardInset");
    bindKeyboardInset();
    expect(document.documentElement.style.getPropertyValue("--vv-offset-top")).toBe("20px");
    expect(document.documentElement.style.getPropertyValue("--vv-height")).toBe("500px");
    expect(document.documentElement.style.getPropertyValue("--vv-offset-bottom")).toBe("280px");
    expect(document.documentElement.classList.contains("vv-keyboard-open")).toBe(true);
    expect(listeners.has("resize")).toBe(true);
  });
});
