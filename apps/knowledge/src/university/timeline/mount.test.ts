/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import { mountUniversityTimeline } from "./mount";
import type { UniversityCatalogue } from "./types";

const catalogue: UniversityCatalogue = {
  generated: "test",
  degrees: [
    {
      id: "med",
      title: "Master of Sample Studies",
      institution: "Sample Institute",
      status: "completed",
      start: "2025-02-10",
      end: "2026-04-24",
      description: null,
      units: [
        {
          id: "smpl",
          title: "SMPL5448 - Sample Research Methods",
          code: "SMPL5448",
          status: "completed",
          start: "2025-02-10",
          end: "2025-11-27",
          gpaPoints: 7,
          grade: "High Distinction",
          description: null,
          assessments: [
            {
              id: "quiz",
              title: "Assessment 1: Online quiz",
              kind: "test",
              status: "completed",
              start: "2025-10-17",
              end: null,
              gpaPoints: 7,
              grade: "High Distinction",
              description: "High Distinction Achieved",
              unitNumber: "SMPL5448",
            },
          ],
        },
      ],
    },
  ],
};

async function flush() {
  await new Promise(resolve => setTimeout(resolve, 0));
  await new Promise(resolve => requestAnimationFrame(() => resolve(undefined)));
}

class TestPointerEvent extends Event {
  button: number;
  clientX: number;
  pointerId: number;

  constructor(type: string, init: { button?: number; clientX?: number; bubbles?: boolean } = {}) {
    super(type, { bubbles: init.bubbles ?? true });
    this.button = init.button ?? 0;
    this.clientX = init.clientX ?? 0;
    this.pointerId = 1;
  }
}

describe("mountUniversityTimeline", () => {
  it("zooms from the degree into units, then opens an assessment grade card", async () => {
    const host = document.createElement("section");
    host.style.width = "900px";
    document.body.append(host);
    const stop = mountUniversityTimeline(host, catalogue);
    await flush();
    expect(host.querySelector("[data-tl-degree]")?.textContent).toContain("Master of Sample Studies");
    expect(host.querySelector("[data-gpa-toggle]")?.textContent).toMatch(/GPA/);

    host.querySelector<HTMLButtonElement>("[data-tl-degree]")!.click();
    await flush();
    expect(host.querySelector("[data-tl-unit]")).toBeTruthy();

    host.querySelector<HTMLButtonElement>("[data-tl-zoom='1']")!.click();
    host.querySelector<HTMLButtonElement>("[data-tl-zoom='1']")!.click();
    await flush();
    const assessment = host.querySelector<HTMLButtonElement>("[data-tl-assessment]");
    if (assessment) {
      assessment.click();
      await flush();
      expect(host.querySelector("[data-tl-card]")?.textContent).toContain("High Distinction");
      expect(host.querySelector("[data-tl-card]")?.textContent).toContain("7 / 7");
    }

    stop();
    host.remove();
  });

  it("blocks text selection while panning the timeline", async () => {
    const host = document.createElement("section");
    host.className = "uni-tl";
    host.style.width = "900px";
    document.body.append(host);
    const stop = mountUniversityTimeline(host, catalogue);
    await flush();

    const pane = host.querySelector<HTMLElement>("[data-tl-viewport]")!;
    const idle = new Event("selectstart", { bubbles: true, cancelable: true });
    expect(pane.dispatchEvent(idle)).toBe(false);

    pane.dispatchEvent(new TestPointerEvent("pointerdown", { button: 0, clientX: 240 }));
    pane.dispatchEvent(new TestPointerEvent("pointermove", { clientX: 180 }));
    expect(host.classList.contains("is-panning")).toBe(true);
    const duringPan = new Event("selectstart", { bubbles: true, cancelable: true });
    expect(host.dispatchEvent(duringPan)).toBe(false);

    pane.dispatchEvent(new TestPointerEvent("pointerup"));
    expect(host.classList.contains("is-panning")).toBe(false);

    stop();
    host.remove();
  });

  it("loads the private catalogue when none is passed in", async () => {
    const host = document.createElement("section");
    host.style.width = "900px";
    document.body.append(host);
    let resolve!: (value: UniversityCatalogue | null) => void;
    const stop = mountUniversityTimeline(host, undefined, () => new Promise(r => { resolve = r; }));
    expect(host.textContent).toMatch(/Loading your university timeline/);
    resolve(catalogue);
    await flush();
    await flush();
    expect(host.querySelector("[data-tl-degree]")?.textContent).toContain("Master of Sample Studies");
    stop();
    host.remove();
  });

  it("shows a status instead of a chart when the catalogue is unavailable", async () => {
    const host = document.createElement("section");
    document.body.append(host);
    const stop = mountUniversityTimeline(host, undefined, async () => null);
    await flush();
    expect(host.querySelector("[data-tl-degree]")).toBe(null);
    expect(host.textContent).toMatch(/isn’t available right now/);
    stop();
    expect(host.childElementCount).toBe(0);
    host.remove();
  });
});
