/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import { paintVirtualList, virtualListWindow } from "./virtualList";

describe("virtualListWindow", () => {
  it("windows rows around the scroll position with overscan", () => {
    expect(
      virtualListWindow({
        total: 200,
        scrollTop: 1040,
        viewportHeight: 520,
        rowHeight: 104,
        overscan: 8,
      }),
    ).toEqual({
      start: 2,
      end: 23,
      offset: 208,
      spacerHeight: 20800,
    });
  });

  it("uses a short empty spacer when there are no rows", () => {
    expect(
      virtualListWindow({
        total: 0,
        scrollTop: 0,
        viewportHeight: 400,
        rowHeight: 104,
        overscan: 8,
      }),
    ).toEqual({
      start: 0,
      end: 0,
      offset: 0,
      spacerHeight: 120,
    });
  });
});

describe("paintVirtualList", () => {
  function paint(html: string, start: number, end: number, offset: number, spacerHeight = 5000) {
    return { start, end, offset, spacerHeight, html };
  }

  function scrollHost(initialTop = 0) {
    const viewport = document.createElement("div");
    let top = initialTop;
    const native = Object.getOwnPropertyDescriptor(Element.prototype, "innerHTML")!;
    Object.defineProperty(viewport, "scrollTop", {
      configurable: true,
      get: () => top,
      set(value: number) {
        top = Number(value);
      },
    });
    Object.defineProperty(viewport, "innerHTML", {
      configurable: true,
      get() {
        return native.get!.call(this);
      },
      set(html: string) {
        // Mimic mobile browsers: rewriting the scroll container resets scrollTop.
        top = 0;
        native.set!.call(this, html);
      },
    });
    return {
      viewport,
      get scrollTop() {
        return top;
      },
    };
  }

  it("mounts spacer + window once, then updates the window in place", () => {
    const { viewport, scrollTop } = scrollHost(900);
    let painted = paintVirtualList(viewport, paint("<button data-id='a'>A</button>", 0, 2, 0), null);
    expect(scrollTop).toBe(900);

    const spacer = viewport.querySelector(".list-spacer");
    const windowEl = viewport.querySelector(".list-window");
    expect(spacer).toBeTruthy();
    expect(windowEl!.textContent).toContain("A");

    painted = paintVirtualList(
      viewport,
      paint("<button data-id='b'>B</button>", 4, 10, 416),
      painted,
    );

    expect(viewport.querySelector(".list-spacer")).toBe(spacer);
    expect(viewport.querySelector(".list-window")).toBe(windowEl);
    expect(windowEl!.style.transform).toBe("translateY(416px)");
    expect(windowEl!.textContent).toContain("B");
    expect(scrollTop).toBe(900);
    expect(painted).toEqual({ start: 4, end: 10, spacerHeight: 5000 });
  });

  it("skips DOM work when the painted window has not changed", () => {
    const { viewport } = scrollHost();
    const first = paint("<button>A</button>", 0, 5, 0);
    const painted = paintVirtualList(viewport, first, null);
    const windowEl = viewport.querySelector(".list-window")!;
    windowEl.innerHTML = "<button>stale</button>";

    const again = paintVirtualList(viewport, { ...first, html: "<button>fresh</button>" }, painted);
    expect(again).toBe(painted);
    expect(windowEl.innerHTML).toBe("<button>stale</button>");
  });

  function rows(from: number, to: number) {
    return Array.from({ length: to - from }, (_, i) => {
      const id = String(from + i);
      return `<button class="card" type="button" data-id="${id}">Note ${id}</button>`;
    }).join("");
  }

  it("keeps overlapping note nodes when the window slides by one row", () => {
    const { viewport } = scrollHost();
    const first = paintVirtualList(viewport, paint(rows(0, 8), 0, 8, 0), null);
    const kept = viewport.querySelector("[data-id='3']");
    expect(kept).toBeTruthy();

    paintVirtualList(viewport, paint(rows(1, 9), 1, 9, 68), first);

    expect(viewport.querySelector("[data-id='3']")).toBe(kept);
    expect(viewport.querySelector("[data-id='0']")).toBeNull();
    expect(viewport.querySelector("[data-id='8']")?.textContent).toBe("Note 8");
  });

  it("does not fade already-visible notes when hub motion sees the slide", async () => {
    const { resetHubMotionForTests, startHubMotion } = await import("../../design-kit/js/hub-motion.js");
    resetHubMotionForTests();
    document.body.replaceChildren();
    const { viewport } = scrollHost();
    document.body.append(viewport);

    const first = paintVirtualList(viewport, paint(rows(0, 8), 0, 8, 0), null);
    startHubMotion(document);
    await Promise.resolve();

    const visible = viewport.querySelector<HTMLElement>("[data-id='3']")!;
    visible.classList.add("hub-reveal", "is-in");
    visible.dataset.hubMotionCard = "1";

    paintVirtualList(viewport, paint(rows(1, 9), 1, 9, 68), first);
    await Promise.resolve();

    const after = viewport.querySelector<HTMLElement>("[data-id='3']")!;
    const fadedOut = after.classList.contains("hub-reveal") && !after.classList.contains("is-in");
    expect(fadedOut).toBe(false);
    document.body.replaceChildren();
    resetHubMotionForTests();
  });
});
